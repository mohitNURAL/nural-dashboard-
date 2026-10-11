// Access rights (SRS 7, Access permissions, 2026-10-11). Every person has a set of rights: what
// data they see, which tabs and modules they open, what they may edit and whether they manage
// access. Defaults come from their role (config/roles.json, Bitrix24 project owners, Tech Support
// department and lead); admins override them per department (sub-departments included, the
// deeper department winning) and per person (winning over departments). Admins listed in
// config/roles.json are locked: they always keep every right, so nobody can lock everyone out.
// Pure functions; enforced through viewerOf (roles.ts) on every request.
import { z } from 'zod';

export const RIGHT_KEYS = [
  'scope',
  'kpi',
  'support',
  'inbox',
  'employees',
  'edit',
  'admin',
] as const;
export type RightKey = (typeof RIGHT_KEYS)[number];

export interface Rights {
  /** all = every project and person; own = tasks assigned to or created by them. */
  scope: 'all' | 'own';
  kpi: boolean;
  /** Support tab (feedback form). */
  support: boolean;
  /** Support feedback inbox. */
  inbox: boolean;
  /** Employee module: company tree and people directory. */
  employees: boolean;
  /** all = every task field; limited = stage, status and tags. */
  edit: 'all' | 'limited';
  /** Manage access (the Access permissions screen). */
  admin: boolean;
}

/** An override: only the rights it sets; the rest are inherited. */
export const grantSchema = z
  .object({
    scope: z.enum(['all', 'own']),
    kpi: z.boolean(),
    support: z.boolean(),
    inbox: z.boolean(),
    employees: z.boolean(),
    edit: z.enum(['all', 'limited']),
    admin: z.boolean(),
  })
  .partial()
  .strict();
export type Grant = z.infer<typeof grantSchema>;

export interface Grants {
  users: Map<number, Grant>;
  depts: Map<number, Grant>;
}
export const noGrants = (): Grants => ({ users: new Map(), depts: new Map() });

export type Role = 'admin' | 'pm' | 'teamLead' | 'productOwner' | 'member' | 'local';
export type Source = 'role' | 'department' | 'person' | 'locked';

export const ALL_RIGHTS: Rights = {
  scope: 'all',
  kpi: true,
  support: true,
  inbox: true,
  employees: true,
  edit: 'all',
  admin: true,
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
    kpi: full,
    support: manager || ctx.supportDept || ctx.supportLead,
    inbox: ctx.supportLead,
    employees: manager,
    edit: full ? 'all' : 'limited',
    admin: false,
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
  const apply = (g: Grant | undefined, from: Source) => {
    if (!g) return;
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
