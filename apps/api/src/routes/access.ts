// Access permissions (SRS 7, 2026-10-11): admins see every person's rights (role defaults,
// department and person overrides, the result and where each right comes from) and change them
// per person or per department. Admins listed in config/roles.json are locked. Every change is
// written to access_audit. Needs the admin right.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { resolveFor, type RequestDataset, type RolesConfig, type Viewer } from '../auth/roles';
import { departmentChain, grantSchema, noGrants, type Grant, type Grants } from '../auth/rights';

export type Subject = 'user' | 'dept';

export interface AuditRow {
  id: number;
  at: Date;
  byUser: number;
  subjectType: Subject;
  subjectId: number;
  before: Grant | null;
  after: Grant | null;
}

export interface AccessStore {
  load(): Promise<Grants>;
  /** Sets the override; null or {} removes it. */
  set(type: Subject, id: number, grant: Grant | null, by: number): Promise<void>;
  audit(limit: number): Promise<AuditRow[]>;
}

const clean = (g: Grant | null): Grant | null =>
  g && Object.keys(g).length
    ? Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined))
    : null;

/** In-memory store (tests, and local runs without a database). */
export function memoryAccessStore(): AccessStore {
  const grants = noGrants();
  const log: AuditRow[] = [];
  return {
    load: async () => ({ users: new Map(grants.users), depts: new Map(grants.depts) }),
    async set(type, id, grant, by) {
      const map = type === 'user' ? grants.users : grants.depts;
      const before = map.get(id) ?? null;
      const after = clean(grant);
      if (after) map.set(id, after);
      else map.delete(id);
      log.unshift({
        id: log.length + 1,
        at: new Date(),
        byUser: by,
        subjectType: type,
        subjectId: id,
        before,
        after,
      });
    },
    audit: async (limit) => log.slice(0, limit),
  };
}

const body = z.object({ rights: grantSchema.nullable() });
const params = z.object({ id: z.coerce.number().int() });

export function accessRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  deps: {
    store: AccessStore;
    roles: RolesConfig;
    grants: () => Grants;
    /** Reloads the cached overrides after a change, so it applies at once. */
    refresh: () => Promise<void>;
  },
) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/access')) return;
    if (!(await viewer(req)).admin) {
      return reply.code(403).send({ error: 'Access permissions are for admins only.' });
    }
  });

  app.get('/api/access', async (req) => {
    const ds = await getDataset(req);
    const grants = deps.grants();
    const depts = ds.departments ?? [];
    const deptName = new Map(depts.map((d) => [d.id, d.name]));
    const people = [...ds.users.values()]
      .filter((u) => u.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => {
        const r = resolveFor(u.id, ds, deps.roles, grants);
        return {
          id: u.id,
          name: u.name,
          position: u.workPosition,
          departments: (u.departmentIds ?? []).map((d) => deptName.get(d) ?? String(d)),
          role: r.role,
          locked: r.locked,
          defaults: r.defaults,
          grant: grants.users.get(u.id) ?? null,
          rights: r.rights,
          source: r.source,
        };
      });
    const byId = new Map(depts.map((d) => [d.id, d]));
    const depth = (id: number) => departmentChain([id], depts).length - 1;
    const departments = depts
      .map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        depth: depth(d.id),
        head: d.headId ? (ds.users.get(d.headId)?.name ?? null) : null,
        members: [...ds.users.values()].filter((u) => u.active && u.departmentIds?.includes(d.id))
          .length,
        grant: grants.depts.get(d.id) ?? null,
      }))
      // Tree order: each department after its parent.
      .sort((a, b) => path(a.id).localeCompare(path(b.id)));
    function path(id: number): string {
      const d = byId.get(id);
      return d ? `${d.parentId != null ? `${path(d.parentId)}/` : ''}${d.name}` : '';
    }
    return { people, departments };
  });

  async function change(req: FastifyRequest, type: Subject) {
    const { id } = params.parse(req.params);
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      return { status: 400, error: parsed.error.issues[0]?.message ?? 'Invalid rights.' } as const;
    }
    const ds = await getDataset(req);
    if (type === 'user') {
      if (!ds.users.get(id)?.active) return { status: 404, error: 'No such person.' } as const;
      if (deps.roles.admins.includes(id)) {
        return {
          status: 409,
          error: 'This admin is set in config/roles.json and always has every right.',
        } as const;
      }
    } else if (!(ds.departments ?? []).some((d) => d.id === id)) {
      return { status: 404, error: 'No such department.' } as const;
    }
    await deps.store.set(type, id, parsed.data.rights, (await viewer(req)).userId);
    await deps.refresh();
    return { status: 200 } as const;
  }

  app.put('/api/access/user/:id', async (req, reply) => {
    const r = await change(req, 'user');
    return r.status === 200 ? { ok: true } : reply.code(r.status).send({ error: r.error });
  });
  app.put('/api/access/dept/:id', async (req, reply) => {
    const r = await change(req, 'dept');
    return r.status === 200 ? { ok: true } : reply.code(r.status).send({ error: r.error });
  });

  app.get('/api/access/audit', async (req) => {
    const ds = await getDataset(req);
    const deptName = new Map((ds.departments ?? []).map((d) => [d.id, d.name]));
    const rows = await deps.store.audit(100);
    return {
      rows: rows.map((r) => ({
        ...r,
        by: ds.users.get(r.byUser)?.name ?? (r.byUser === 0 ? 'Local copy' : `User ${r.byUser}`),
        subject:
          r.subjectType === 'user'
            ? (ds.users.get(r.subjectId)?.name ?? `User ${r.subjectId}`)
            : (deptName.get(r.subjectId) ?? `Department ${r.subjectId}`),
      })),
    };
  });
}

/** Postgres-backed store (tables access_grants and access_audit). */
export async function dbAccessStore(): Promise<AccessStore> {
  const { db, schema } = await import('../db/client');
  const { and, desc, eq } = await import('drizzle-orm');
  const g = schema.accessGrants;
  const a = schema.accessAudit;
  return {
    async load() {
      const rows = await db.select().from(g);
      const out = noGrants();
      for (const r of rows) {
        (r.subjectType === 'user' ? out.users : out.depts).set(r.subjectId, r.rights as Grant);
      }
      return out;
    },
    async set(type, id, grant, by) {
      const where = and(eq(g.subjectType, type), eq(g.subjectId, id));
      const [old] = await db.select().from(g).where(where);
      const after = clean(grant);
      if (after) {
        await db
          .insert(g)
          .values({ subjectType: type, subjectId: id, rights: after, updatedBy: by })
          .onConflictDoUpdate({
            target: [g.subjectType, g.subjectId],
            set: { rights: after, updatedBy: by, updatedAt: new Date() },
          });
      } else {
        await db.delete(g).where(where);
      }
      await db.insert(a).values({
        byUser: by,
        subjectType: type,
        subjectId: id,
        before: (old?.rights as Grant | undefined) ?? null,
        after,
      });
    },
    async audit(limit) {
      const rows = await db.select().from(a).orderBy(desc(a.at)).limit(limit);
      return rows.map((r) => ({
        ...r,
        subjectType: r.subjectType as Subject,
        before: r.before as Grant | null,
        after: r.after as Grant | null,
      }));
    },
  };
}
