// People directory edits (2026-10-12, SRS 17), admins only:
// - a person's dashboard role: saved on their access record (Access permissions), the dashboard's
//   own idea; locked admins (config/roles.json) cannot be changed;
// - a person's departments and designation, and adding or changing departments: sent to
//   Bitrix24 with the admin's own OAuth token, only through bitrix/methods.ts PEOPLE_FIELDS
//   (department.add, department.update, user.update with UF_DEPARTMENT and WORK_POSITION).
//   Every attempt is logged; on success the directory is synced from Bitrix24 at once.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset, RolesConfig, Viewer } from '../auth/roles';
import { normalizeGrant, type Grant, type Grants } from '../auth/rights';
import type { TokenStore } from '../auth/tokens';
import { BitrixError, type BitrixResponse, type Params } from '../bitrix/client';
import type { AccessStore } from './access';

export interface PeopleAction {
  userId: number;
  subjectType: 'user' | 'department';
  subjectId: number | null;
  action: 'departments' | 'position' | 'add' | 'rename' | 'parent' | 'head';
  fromValue: string | null;
  toValue: string;
  ok: boolean;
  error: string | null;
}

export interface PeopleDeps {
  /** limiter.peopleCall: the admin's own token, people methods only. */
  peopleCall?: <T = unknown>(
    method: string,
    params: Params,
    token: string,
  ) => Promise<BitrixResponse<T>>;
  tokens?: TokenStore;
  userOf: (req: unknown) => { userId: number; name: string } | null;
  record?: (a: PeopleAction) => Promise<void>;
  /** Syncs users and departments from Bitrix24 and reloads the dataset. */
  refreshDirectory?: () => Promise<void>;
  access: AccessStore;
  grants: () => Grants;
  refreshGrants: () => Promise<void>;
  roles: RolesConfig;
}

/** A Bitrix24 refusal in plain words. */
export function explainPeople(e: unknown): { status: number; message: string } {
  if (e instanceof BitrixError) {
    const t = `${e.code} ${e.description}`;
    if (/insufficient_scope/i.test(t))
      return {
        status: 403,
        message:
          'The Bitrix24 app is missing the Departments or Users permission. Ask the Bitrix24 admin to add them, then sign out and sign in again.',
      };
    if (/ACCESS_DENIED|NO_AUTH|expired_token|invalid_token|access denied/i.test(t))
      return {
        status: 403,
        message: `Bitrix24 refused: ${e.description || e.code}. Changing people and departments needs Bitrix24 admin rights.`,
      };
    return { status: 400, message: `Bitrix24: ${e.description || e.code}` };
  }
  return { status: 502, message: 'Bitrix24 could not be reached. Try again.' };
}

const ROLES = ['admin', 'pm', 'teamLead', 'productOwner', 'member'] as const;
const idParam = z.object({ id: z.coerce.number().int().positive() });
const personInput = z
  .object({
    departments: z.array(z.number().int().positive()).min(1).max(20).optional(),
    position: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.departments !== undefined || v.position !== undefined, 'Nothing to change.');
const deptInput = z.object({
  name: z.string().trim().min(2).max(120),
  parentId: z.number().int().positive(),
  headId: z.number().int().positive().nullable().optional(),
});
const deptChange = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    parentId: z.number().int().positive().optional(),
    headId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change.');

export function peopleRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  deps: PeopleDeps,
) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/people') && !req.url.startsWith('/api/departments')) return;
    if (!(await viewer(req)).admin)
      return reply.code(403).send({ error: 'Only admins can change people and departments.' });
  });

  /** The admin and their Bitrix24 token, or why the change cannot be sent. */
  async function actor(req: unknown) {
    const user = deps.userOf(req);
    if (!user?.userId || !deps.tokens || !deps.peopleCall)
      return { error: 'Sign in with Bitrix24 to change people and departments.' } as const;
    const token = await deps.tokens.get(user.userId).catch(() => null);
    if (!token)
      return { error: 'Sign in again with Bitrix24 to change people and departments.' } as const;
    return { userId: user.userId, token: token.accessToken } as const;
  }

  /** Sends the calls, logs each change, and syncs the directory after success. */
  async function send(
    who: { userId: number; token: string },
    calls: { method: string; params: Params }[],
    log: Omit<PeopleAction, 'userId' | 'ok' | 'error'>[],
  ): Promise<{ ok: true; result?: unknown } | { ok: false; status: number; message: string }> {
    let result: unknown;
    try {
      for (const c of calls)
        result = (await deps.peopleCall!(c.method, c.params, who.token)).result;
    } catch (e) {
      const { status, message } = explainPeople(e);
      for (const l of log)
        await deps
          .record?.({ ...l, userId: who.userId, ok: false, error: message })
          .catch(() => undefined);
      return { ok: false, status, message };
    }
    for (const l of log)
      await deps
        .record?.({ ...l, userId: who.userId, ok: true, error: null })
        .catch(() => undefined);
    await deps.refreshDirectory?.().catch(() => undefined);
    return { ok: true, result };
  }

  // A person's departments and designation, in Bitrix24.
  app.put('/api/people/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = personInput.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid change.' });
    const ds = await getDataset(req);
    const u = ds.users.get(id);
    if (!u?.active) return reply.code(404).send({ error: 'No such person.' });
    const known = new Set((ds.departments ?? []).map((d) => d.id));
    if (body.data.departments?.some((d) => !known.has(d)))
      return reply.code(400).send({ error: 'Choose existing departments.' });
    const params: Params = { ID: id };
    const log: Omit<PeopleAction, 'userId' | 'ok' | 'error'>[] = [];
    const deptName = (d: number) => ds.departments?.find((x) => x.id === d)?.name ?? String(d);
    if (body.data.departments) {
      params.UF_DEPARTMENT = body.data.departments;
      log.push({
        subjectType: 'user',
        subjectId: id,
        action: 'departments',
        fromValue: (u.departmentIds ?? []).map(deptName).join(', ') || null,
        toValue: body.data.departments.map(deptName).join(', '),
      });
    }
    if (body.data.position !== undefined) {
      params.WORK_POSITION = body.data.position;
      log.push({
        subjectType: 'user',
        subjectId: id,
        action: 'position',
        fromValue: u.workPosition ?? null,
        toValue: body.data.position,
      });
    }
    const who = await actor(req);
    if ('error' in who) return reply.code(403).send({ error: who.error });
    const r = await send(who, [{ method: 'user.update', params }], log);
    return r.ok ? { ok: true } : reply.code(r.status).send({ error: r.message });
  });

  // A person's dashboard role (the dashboard's own; not in Bitrix24).
  app.put('/api/people/:id/role', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ role: z.enum(ROLES).nullable() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose a role.' });
    const ds = await getDataset(req);
    if (!ds.users.get(id)?.active) return reply.code(404).send({ error: 'No such person.' });
    if (deps.roles.admins.includes(id))
      return reply
        .code(409)
        .send({ error: 'This admin is set in config/roles.json and always stays an admin.' });
    const before = normalizeGrant(deps.grants().users.get(id) ?? {});
    const rest: Grant = { ...before };
    delete rest.role;
    const next: Grant = body.data.role ? { ...rest, role: body.data.role } : rest;
    await deps.access.set(
      'user',
      id,
      Object.keys(next).length ? next : null,
      (await viewer(req)).userId,
    );
    await deps.refreshGrants();
    return { ok: true };
  });

  // A new department, in Bitrix24.
  app.post('/api/departments', async (req, reply) => {
    const body = deptInput.safeParse(req.body);
    if (!body.success)
      return reply
        .code(400)
        .send({ error: body.error.issues[0]?.message ?? 'Invalid department.' });
    const ds = await getDataset(req);
    if (!(ds.departments ?? []).some((d) => d.id === body.data.parentId))
      return reply.code(400).send({ error: 'Choose an existing parent department.' });
    if (body.data.headId && !ds.users.get(body.data.headId)?.active)
      return reply.code(400).send({ error: 'Choose an active person as head.' });
    const who = await actor(req);
    if ('error' in who) return reply.code(403).send({ error: who.error });
    const params: Params = { NAME: body.data.name, PARENT: body.data.parentId };
    if (body.data.headId) params.UF_HEAD = body.data.headId;
    const r = await send(
      who,
      [{ method: 'department.add', params }],
      [
        {
          subjectType: 'department',
          subjectId: null,
          action: 'add',
          fromValue: null,
          toValue: body.data.name,
        },
      ],
    );
    return r.ok
      ? { ok: true, id: r.result ?? null }
      : reply.code(r.status).send({ error: r.message });
  });

  // Rename a department, move it under another, or change its head, in Bitrix24.
  app.put('/api/departments/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = deptChange.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid change.' });
    const ds = await getDataset(req);
    const depts = ds.departments ?? [];
    const d = depts.find((x) => x.id === id);
    if (!d) return reply.code(404).send({ error: 'No such department.' });
    const { name, parentId, headId } = body.data;
    if (parentId !== undefined) {
      if (!depts.some((x) => x.id === parentId))
        return reply.code(400).send({ error: 'Choose an existing parent department.' });
      // Not under itself or one of its own sub-departments.
      for (let p: number | null | undefined = parentId, n = 0; p != null && n < 50; n++) {
        if (p === id)
          return reply.code(400).send({ error: 'A department cannot sit under itself.' });
        p = depts.find((x) => x.id === p)?.parentId;
      }
    }
    if (headId && !ds.users.get(headId)?.active)
      return reply.code(400).send({ error: 'Choose an active person as head.' });
    const params: Params = { ID: id };
    const log: Omit<PeopleAction, 'userId' | 'ok' | 'error'>[] = [];
    const nameOf = (x?: number | null) =>
      x ? (depts.find((y) => y.id === x)?.name ?? String(x)) : null;
    if (name !== undefined && name !== d.name) {
      params.NAME = name;
      log.push({
        subjectType: 'department',
        subjectId: id,
        action: 'rename',
        fromValue: d.name,
        toValue: name,
      });
    }
    if (parentId !== undefined && parentId !== d.parentId) {
      params.PARENT = parentId;
      log.push({
        subjectType: 'department',
        subjectId: id,
        action: 'parent',
        fromValue: nameOf(d.parentId),
        toValue: nameOf(parentId)!,
      });
    }
    if (headId !== undefined && headId !== (d.headId ?? null)) {
      params.UF_HEAD = headId ?? 0;
      log.push({
        subjectType: 'department',
        subjectId: id,
        action: 'head',
        fromValue: d.headId ? (ds.users.get(d.headId)?.name ?? String(d.headId)) : null,
        toValue: headId ? (ds.users.get(headId)?.name ?? String(headId)) : '(none)',
      });
    }
    if (!log.length) return { ok: true, unchanged: true };
    const who = await actor(req);
    if ('error' in who) return reply.code(403).send({ error: who.error });
    const r = await send(who, [{ method: 'department.update', params }], log);
    return r.ok ? { ok: true } : reply.code(r.status).send({ error: r.message });
  });
}
