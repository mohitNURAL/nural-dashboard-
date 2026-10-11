// Access rights (SRS 7, Access permissions, 2026-10-11). Every person has a set of rights: what
// data they see, which tabs and modules they open, what they may edit and whether they manage
// access. Defaults come from their role (config/roles.json, Bitrix24 project owners, Tech Support
// department and lead); admins override them per department (sub-departments included, the
// deeper department winning) and per person (winning over departments). Admins listed in
// config/roles.json are locked: they always keep every right, so nobody can lock everyone out.
// Pure functions; enforced through viewerOf (roles.ts) on every request.
import { z } from 'zod';

// One right per menu page (2026-10-12, packages/shared modules.ts) plus the permissions under
// them: data scope, edit, the Support inbox and the Help feedback inbox. Grants saved before
// 2026-10-12 may hold `employees` (company tree and people directory together): it still counts
// for both pages unless one of them is set on its own.
export const RIGHT_KEYS = [
  'scope',
  'edit',
  'kpi',
  'dev',
  'qa',
  'support',
  'inbox',
  'insights',
  'org',
  'people',
  'admin',
  'connections',
  'mailing',
  'helpFeedback',
  'helpInbox',
  'helpDocs',
  'helpFaq',
] as const;
export type RightKey = (typeof RIGHT_KEYS)[number];

export interface Rights {
  /** all = every project and person; own = tasks assigned to or created by them. */
  scope: 'all' | 'own';
  /** all = every task field; limited = stage, status and tags. */
  edit: 'all' | 'limited';
  kpi: boolean;
  dev: boolean;
  qa: boolean;
  /** Support tab (feedback form). */
  support: boolean;
  /** Support feedback inbox. */
  inbox: boolean;
  insights: boolean;
  /** Company tree. */
  org: boolean;
  /** People directory. */
  people: boolean;
  /** Manage access (the Access permissions screen). */
  admin: boolean;
  /** Integration: Connections. */
  connections: boolean;
  /** Integration: Mailing. */
  mailing: boolean;
  /** Help: send feedback. */
  helpFeedback: boolean;
  /** Help feedback inbox: read everyone's feedback. */
  helpInbox: boolean;
  /** Help: Documents. */
  helpDocs: boolean;
  /** Help: FAQs. */
  helpFaq: boolean;
}

const bool = z.boolean();
/** An override: only the rights it sets; the rest are inherited. */
export const grantSchema = z
  .object({
    scope: z.enum(['all', 'own']),
    edit: z.enum(['all', 'limited']),
    kpi: bool,
    dev: bool,
    qa: bool,
    support: bool,
    inbox: bool,
    insights: bool,
    org: bool,
    people: bool,
    admin: bool,
    connections: bool,
    mailing: bool,
    helpFeedback: bool,
    helpInbox: bool,
    helpDocs: bool,
    helpFaq: bool,
    /** Before 2026-10-12: company tree and people directory together. */
    employees: bool,
    /**
     * The person's dashboard role, set in the People directory (2026-10-12); it wins over
     * config/roles.json and project ownership, except for locked admins. People only.
     */
    role: z.enum(['admin', 'pm', 'teamLead', 'productOwner', 'member']),
  })
  .partial()
  .strict();
export type Grant = z.infer<typeof grantSchema>;

/** A saved grant in today's terms: an old `employees` setting covers both Employee pages. */
export function normalizeGrant(g: Grant): Grant {
  if (g.employees === undefined) return g;
  const { employees, ...rest } = g;
  return { org: employees, people: employees, ...rest };
}

export interface Grants {
  users: Map<number, Grant>;
  depts: Map<number, Grant>;
}
export const noGrants = (): Grants => ({ users: new Map(), depts: new Map() });

export type Role = 'admin' | 'pm' | 'teamLead' | 'productOwner' | 'member' | 'local';
export type Source = 'role' | 'department' | 'person' | 'locked';

export const ALL_RIGHTS: Rights = {
  scope: 'all',
  edit: 'all',
  kpi: true,
  dev: true,
  qa: true,
  support: true,
  inbox: true,
  insights: true,
  org: true,
  people: true,
  admin: true,
  connections: true,
  mailing: true,
  helpFeedback: true,
  helpInbox: true,
  helpDocs: true,
  helpFaq: true,
};

/** Rights from the role alone (unchanged behaviour before any override). */
export function defaultRights(
  role: Role,
  ctx: { supportDept: boolean; supportLead: boolean },
): Rights {
  if (role === 'admin' || role === 'local') return { ...ALL_RIGHTS };
  const manager = role === 'pm' || role === 'teamLead';
  const full = role !== 'member';
  return {
    scope: full ? 'all' : 'own',
    edit: full ? 'all' : 'limited',
    kpi: full,
    dev: true,
    qa: true,
    support: manager || ctx.supportDept || ctx.supportLead,
    inbox: ctx.supportLead,
    insights: true,
    org: manager,
    people: manager,
    admin: false,
    connections: false,
    mailing: false,
    helpFeedback: true,
    helpInbox: manager,
    helpDocs: true,
    helpFaq: true,
  };
}

export interface Department {
  id: number;
  name: string;
  parentId: number | null;
  headId?: number | null;
}

/**
 * The person's departments with all their parents, outermost first, so a deeper department's
 * grant is applied after (and wins over) its parent's.
 */
export function departmentChain(deptIds: number[], depts: Department[]): number[] {
  const byId = new Map(depts.map((d) => [d.id, d]));
  const depth = (id: number) => {
    let n = 0;
    for (let d = byId.get(id); d?.parentId != null && n < 50; d = byId.get(d.parentId)) n++;
    return n;
  };
  const all = new Set<number>();
  for (const id of deptIds) {
    for (
      let d = byId.get(id), n = 0;
      d && n < 50;
      d = d.parentId != null ? byId.get(d.parentId) : undefined, n++
    ) {
      all.add(d.id);
    }
  }
  return [...all].sort((a, b) => depth(a) - depth(b) || a - b);
}

export interface Resolved {
  rights: Rights;
  /** Where each right comes from. */
  source: Record<RightKey, Source>;
  /** The role's defaults, before overrides. */
  defaults: Rights;
}

/** Role defaults, then department grants (outer to inner), then the person's own grant. */
export function resolveRights(
  userId: number,
  role: Role,
  ctx: { supportDept: boolean; supportLead: boolean; locked: boolean; chain: number[] },
  grants: Grants,
): Resolved {
  const defaults = defaultRights(role, ctx);
  const rights = { ...defaults };
  const source = Object.fromEntries(RIGHT_KEYS.map((k) => [k, 'role'])) as Record<RightKey, Source>;
  if (ctx.locked) {
    return {
      rights: { ...ALL_RIGHTS },
      source: Object.fromEntries(RIGHT_KEYS.map((k) => [k, 'locked'])) as Record<RightKey, Source>,
      defaults,
    };
  }
  const apply = (saved: Grant | undefined, from: Source) => {
    if (!saved) return;
    const g = normalizeGrant(saved);
    for (const k of RIGHT_KEYS) {
      if (g[k] === undefined) continue;
      (rights as Record<RightKey, unknown>)[k] = g[k];
      source[k] = from;
    }
  };
  for (const d of ctx.chain) apply(grants.depts.get(d), 'department');
  apply(grants.users.get(userId), 'person');
  return { rights, source, defaults };
}
