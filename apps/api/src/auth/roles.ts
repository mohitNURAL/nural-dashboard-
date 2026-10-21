// Roles and data scoping (SRS NFR-4). Admins and directors, PM, team leads and product owners
// (config/roles.json, plus every Bitrix24 workgroup owner) see everything. Everyone else sees
// only tasks assigned to them (a QA tester also the issues they filed), on every endpoint and the live stream. Admins
// change these rights per department or person (rights.ts, Access permissions). Enforced on the
// server: routes read data only through the per-request provider, which hands a scoped viewer a
// scoped copy of the dataset.
import type { MetricTask } from '@nural/shared';
import type { FastifyRequest } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Dataset, DatasetProvider } from '../data/dataset';
import {
  departmentChain,
  noGrants,
  resolveRights,
  type Grants,
  type Resolved,
  type Role,
} from './rights';
import { sessionUserOf } from './routes';

export interface RolesConfig {
  admins: number[];
  pms: number[];
  teamLeads: number[];
  /** Extra product owners; Bitrix24 workgroup owners count automatically. */
  productOwners: number[];
}

export type { Role } from './rights';

/** Who is asking and what they may do (rights.ts); enforced by every route. */
export interface Viewer {
  /** 0 when sign-in is off (local copy). */
  userId: number;
  role: Role;
  /** Data scope: every project and person (else only their own tasks). */
  full: boolean;
  /** In the QA Testing department: also sees the issues they filed (inScope). */
  tester: boolean;
  kpi: boolean;
  dev: boolean;
  qa: boolean;
  /** Sees the Support tab. */
  support: boolean;
  /** Reads the feedback inbox. */
  inbox: boolean;
  insights: boolean;
  workflow: boolean;
  projectTypes: boolean;
  /** Company tree. */
  org: boolean;
  /** People directory. */
  people: boolean;
  /** Either Employee page (company tree or people directory). */
  employees: boolean;
  /** Changes every task field (else stage, status and tags only). */
  editAll: boolean;
  /** Manages access. */
  admin: boolean;
  connections: boolean;
  mailing: boolean;
  helpFeedback: boolean;
  helpInbox: boolean;
  helpDocs: boolean;
  helpFaq: boolean;
  /** Daily update: morning plan and evening wrap-up to Slack (SRS 23). */
  dailyUpdate: boolean;
  dailyReport: boolean;
}

const EMPTY: RolesConfig = { admins: [], pms: [], teamLeads: [], productOwners: [] };

export function loadRoles(): RolesConfig {
  const file = fileURLToPath(new URL('../../../../config/roles.json', import.meta.url));
  if (!existsSync(file)) return EMPTY;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<RolesConfig>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : []);
  return {
    admins: ids(raw.admins),
    pms: ids(raw.pms),
    teamLeads: ids(raw.teamLeads),
    productOwners: ids(raw.productOwners),
  };
}

type RoleData = Pick<Dataset, 'owners' | 'kpiDept' | 'supportLead' | 'users' | 'departments'> &
  Partial<Pick<Dataset, 'testers'>>;

/** The person's role from config/roles.json and Bitrix24 project ownership. */
export function roleOf(id: number, ds: Pick<Dataset, 'owners'>, roles: RolesConfig): Role {
  const ownsProject = [...(ds.owners?.values() ?? [])].includes(id);
  return roles.admins.includes(id)
    ? 'admin'
    : roles.pms.includes(id)
      ? 'pm'
      : roles.teamLeads.includes(id)
        ? 'teamLead'
        : roles.productOwners.includes(id) || ownsProject
          ? 'productOwner'
          : 'member';
}

/** Role, rights and where each right comes from (the Access permissions screen). */
export function resolveFor(
  id: number,
  ds: RoleData,
  roles: RolesConfig,
  grants: Grants,
): Resolved & { role: Role; locked: boolean } {
  const locked = roles.admins.includes(id);
  // A role set in the People directory wins, except over a locked admin.
  const role = (!locked && grants.users.get(id)?.role) || roleOf(id, ds, roles);
  const resolved = resolveRights(
    id,
    role,
    {
      supportDept: ds.kpiDept?.get(id) === 'support',
      supportLead: ds.supportLead != null && ds.supportLead === id,
      locked,
      chain: departmentChain(ds.users?.get(id)?.departmentIds ?? [], ds.departments ?? []),
    },
    grants,
  );
  return { ...resolved, role, locked };
}

/** Sign-in off (local copy): everything. */
export const LOCAL_VIEWER: Viewer = {
  userId: 0,
  role: 'local',
  full: true,
  tester: false,
  kpi: true,
  dev: true,
  qa: true,
  support: true,
  inbox: true,
  insights: true,
  workflow: true,
  projectTypes: true,
  org: true,
  people: true,
  employees: true,
  editAll: true,
  admin: true,
  connections: true,
  mailing: true,
  helpFeedback: true,
  helpInbox: true,
  helpDocs: true,
  helpFaq: true,
  dailyUpdate: true,
  dailyReport: true,
};

/** What a signed-in person may do; `authOn` false (local copy) means everything. */
export function viewerOf(
  userId: number | null,
  ds: RoleData,
  roles: RolesConfig,
  authOn: boolean,
  grants: Grants = noGrants(),
): Viewer {
  if (!authOn) return { ...LOCAL_VIEWER };
  const id = userId ?? -1;
  const { role, rights } = resolveFor(id, ds, roles, grants);
  return {
    userId: id,
    role,
    full: rights.scope === 'all',
    tester: !!ds.testers?.has(id),
    kpi: rights.kpi,
    dev: rights.dev,
    qa: rights.qa,
    support: rights.support,
    inbox: rights.inbox,
    insights: rights.insights,
    workflow: rights.workflow,
    projectTypes: rights.projectTypes,
    org: rights.org,
    people: rights.people,
    employees: rights.org || rights.people,
    editAll: rights.edit === 'all',
    admin: rights.admin,
    connections: rights.connections,
    mailing: rights.mailing,
    helpFeedback: rights.helpFeedback,
    helpInbox: rights.helpInbox,
    helpDocs: rights.helpDocs,
    helpFaq: rights.helpFaq,
    dailyUpdate: rights.dailyUpdate,
    dailyReport: rights.dailyReport,
  };
}

/**
 * A task is in a member's scope when it is assigned to them. A QA tester also keeps the issues
 * they filed (bug/feedback they created for developers). Others' tasks a member created are not
 * theirs (2026-10-21: no other person's name or numbers on a member's screen).
 */
export const inScope = (t: MetricTask, userId: number, testers?: ReadonlySet<number>) =>
  t.responsibleId === userId || (t.isIssue && t.createdBy === userId && !!testers?.has(userId));

const memo = new WeakMap<Dataset, Map<number, Dataset>>();

/**
 * The dataset as a member sees it: only their tasks (and comments on them). Names, projects and
 * boards stay, so the tasks they can see still read correctly. Memoised per dataset and person;
 * a new dataset load starts afresh.
 */
export function scopeDataset(ds: Dataset, userId: number): Dataset {
  let byUser = memo.get(ds);
  if (!byUser) memo.set(ds, (byUser = new Map()));
  const hit = byUser.get(userId);
  if (hit) return hit;
  const tasks = ds.tasks.filter((t) => inScope(t, userId, ds.testers));
  const ids = new Set(tasks.map((t) => t.id));
  const scoped: Dataset = {
    ...ds,
    scoped: true,
    tasks,
    byId: new Map(tasks.map((t) => [t.id, t])),
    comments: ds.comments?.filter((c) => ids.has(c.taskId)),
  };
  byUser.set(userId, scoped);
  return scoped;
}

export type RequestDataset = (req: FastifyRequest) => Promise<Dataset>;

/**
 * The only way routes get data: the full dataset for full viewers, a scoped copy otherwise.
 * `req` is required so a route cannot read data without saying whose request it is.
 */
export function requestDataset(
  base: DatasetProvider,
  roles: RolesConfig,
  authOn: boolean,
  /** The current access overrides (read on every request, so a change applies at once). */
  grants: () => Grants = noGrants,
): { dataset: RequestDataset; viewer: (req: FastifyRequest) => Promise<Viewer> } {
  const viewer = async (req: FastifyRequest) =>
    authOn
      ? viewerOf(sessionUserOf(req)?.userId ?? null, await base(), roles, authOn, grants())
      : { ...LOCAL_VIEWER };
  const dataset = async (req: FastifyRequest) => {
    const ds = await base();
    if (!authOn) return ds;
    const v = viewerOf(sessionUserOf(req)?.userId ?? null, ds, roles, authOn, grants());
    return v.full ? ds : scopeDataset(ds, v.userId);
  };
  return { dataset, viewer };
}
