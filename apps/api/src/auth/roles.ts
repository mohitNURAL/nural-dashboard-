// Roles and data scoping (SRS NFR-4). Admins and directors, PM, team leads and product owners
// (config/roles.json, plus every Bitrix24 workgroup owner) see everything. Everyone else sees
// only tasks assigned to them or created by them, on every endpoint and the live stream. The
// KPI tab is for full access only. Enforced on the server: routes read data only through the
// per-request provider, which hands a scoped viewer a scoped copy of the dataset.
import type { MetricTask } from '@nural/shared';
import type { FastifyRequest } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Dataset, DatasetProvider } from '../data/dataset';
import { sessionUserOf } from './routes';

export interface RolesConfig {
  admins: number[];
  pms: number[];
  teamLeads: number[];
  /** Extra product owners; Bitrix24 workgroup owners count automatically. */
  productOwners: number[];
}

export type Role = 'admin' | 'pm' | 'teamLead' | 'productOwner' | 'member' | 'local';

export interface Viewer {
  /** 0 when sign-in is off (local copy). */
  userId: number;
  role: Role;
  /** Sees everything, including the KPI tab. */
  full: boolean;
  /** Sees the Support tab: the Tech Support team, PM, team leads and admins. */
  support: boolean;
  admin: boolean;
  /** Reads the feedback inbox: admins and the head of Tech Support. */
  inbox: boolean;
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

/** The role of a signed-in person; `authOn` false (local copy) means full access. */
export function viewerOf(
  userId: number | null,
  ds: Pick<Dataset, 'owners' | 'kpiDept' | 'supportLead'>,
  roles: RolesConfig,
  authOn: boolean,
): Viewer {
  if (!authOn)
    return { userId: 0, role: 'local', full: true, support: true, admin: true, inbox: true };
  const id = userId ?? -1;
  const ownsProject = [...(ds.owners?.values() ?? [])].includes(id);
  const role: Role = roles.admins.includes(id)
    ? 'admin'
    : roles.pms.includes(id)
      ? 'pm'
      : roles.teamLeads.includes(id)
        ? 'teamLead'
        : roles.productOwners.includes(id) || ownsProject
          ? 'productOwner'
          : 'member';
  const support =
    role === 'admin' || role === 'pm' || role === 'teamLead' || ds.kpiDept?.get(id) === 'support';
  const admin = role === 'admin';
  const inbox = admin || (ds.supportLead != null && ds.supportLead === id);
  return { userId: id, role, full: role !== 'member', support: support || inbox, admin, inbox };
}

/** A task is in a member's scope when it is assigned to them or they created it. */
export const inScope = (t: MetricTask, userId: number) =>
  t.responsibleId === userId || t.createdBy === userId;

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
  const tasks = ds.tasks.filter((t) => inScope(t, userId));
  const ids = new Set(tasks.map((t) => t.id));
  const scoped: Dataset = {
    ...ds,
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
): { dataset: RequestDataset; viewer: (req: FastifyRequest) => Promise<Viewer> } {
  const local: Viewer = {
    userId: 0,
    role: 'local',
    full: true,
    support: true,
    admin: true,
    inbox: true,
  };
  const viewer = async (req: FastifyRequest) =>
    authOn ? viewerOf(sessionUserOf(req)?.userId ?? null, await base(), roles, authOn) : local;
  const dataset = async (req: FastifyRequest) => {
    const ds = await base();
    if (!authOn) return ds;
    const v = viewerOf(sessionUserOf(req)?.userId ?? null, ds, roles, authOn);
    return v.full ? ds : scopeDataset(ds, v.userId);
  };
  return { dataset, viewer };
}
