// People directory edits (SRS 17): admins only; Bitrix24 gets only the allowed methods and
// fields, with the admin's own token; every attempt is logged; roles stay on the dashboard.
import { indexTasks } from '@nural/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { TokenStore } from '../auth/tokens';
import { BitrixError, type Params } from '../bitrix/client';
import { assertPeopleAction } from '../bitrix/methods';
import type { Dataset } from '../data/dataset';
import { buildServer } from '../server';
import type { PeopleAction } from './people';

const SECRET = 'p'.repeat(40);
const departments = [
  { id: 1, name: 'Company', parentId: null, headId: 1 },
  { id: 2, name: 'Development', parentId: 1, headId: null },
  { id: 3, name: 'Mobile', parentId: 2, headId: null },
];
const dataset = async (): Promise<Dataset> =>
  ({
    tasks: [],
    byId: indexTasks([]),
    testers: new Set(),
    users: new Map(
      [
        [1, 'Asha Admin', [1]],
        [9, 'Locked Admin', [1]],
        [30, 'Neel Dev', [3]],
      ].map(([id, name, d]) => [
        id,
        {
          id,
          name,
          workPosition: 'Developer',
          email: null,
          deptGroup: 'Development',
          active: true,
          departmentIds: d,
        },
      ]),
    ),
    projects: new Map(),
    owners: new Map(),
    kpiDept: new Map(),
    departments,
    portalOrigin: 'https://portal.example',
    loadedAt: new Date(),
  }) as unknown as Dataset;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server(opts: { fail?: BitrixError } = {}) {
  const calls: { method: string; params: Params; token: string }[] = [];
  const recorded: PeopleAction[] = [];
  let synced = 0;
  const tokens: TokenStore = {
    save: async () => undefined,
    get: async () => ({
      accessToken: 'admin-token',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 60_000),
      scope: 'app',
    }),
  };
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    roles: { admins: [1, 9], pms: [], teamLeads: [], productOwners: [] },
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 's',
      sessionSecret: SECRET,
      portalOrigin: 'https://portal.example',
      secure: true,
    },
    people: {
      tokens,
      peopleCall: async <T>(method: string, params: Params, token: string) => {
        assertPeopleAction(method, params);
        if (opts.fail) throw opts.fail;
        calls.push({ method, params, token });
        return { result: (method === 'department.add' ? 77 : true) as T };
      },
      record: async (a) => void recorded.push(a),
      refreshDirectory: async () => void synced++,
    },
  });
  return { calls, recorded, synced: () => synced };
}
const cookie = (uid: number) =>
  `${SESSION_COOKIE}=${sign({ userId: uid, name: 'x', exp: Date.now() + 60_000 }, SECRET)}`;
const call = (method: 'GET' | 'PUT' | 'POST', url: string, uid: number, payload?: unknown) =>
  app!.inject({
    method,
    url,
    headers: { cookie: cookie(uid) },
    payload: payload as Record<string, unknown>,
  });

describe('people directory edits', () => {
  it('only the allowed Bitrix24 methods and fields', () => {
    expect(() =>
      assertPeopleAction('user.update', {
        ID: 1,
        UF_DEPARTMENT: [2],
        WORK_POSITION: 'x',
        auth: 't',
      }),
    ).not.toThrow();
    expect(() => assertPeopleAction('user.update', { ID: 1, EMAIL: 'x' })).toThrow(/outside/);
    expect(() => assertPeopleAction('department.delete', { ID: 1 })).toThrow(/not an allowed/);
    expect(() => assertPeopleAction('user.add', { NAME: 'x' })).toThrow(/not an allowed/);
  });

  it('admins only', async () => {
    await server();
    expect((await call('PUT', '/api/people/30', 30, { position: 'Lead' })).statusCode).toBe(403);
    expect(
      (await call('POST', '/api/departments', 30, { name: 'QA Ops', parentId: 1 })).statusCode,
    ).toBe(403);
    expect((await call('PUT', '/api/people/30/role', 30, { role: 'admin' })).statusCode).toBe(403);
  });

  it("a person's departments and designation go to Bitrix24 with the admin's token, logged and synced", async () => {
    const s = await server();
    const r = await call('PUT', '/api/people/30', 1, {
      departments: [2, 3],
      position: 'Senior Developer',
    });
    expect(r.statusCode).toBe(200);
    expect(s.calls).toEqual([
      {
        method: 'user.update',
        params: { ID: 30, UF_DEPARTMENT: [2, 3], WORK_POSITION: 'Senior Developer' },
        token: 'admin-token',
      },
    ]);
    expect(s.recorded.map((a) => [a.action, a.fromValue, a.toValue, a.ok])).toEqual([
      ['departments', 'Mobile', 'Development, Mobile', true],
      ['position', 'Developer', 'Senior Developer', true],
    ]);
    expect(s.synced()).toBe(1);
    expect((await call('PUT', '/api/people/30', 1, { departments: [999] })).statusCode).toBe(400);
  });

  it('departments: add, rename, move (never under itself), head', async () => {
    const s = await server();
    const added = await call('POST', '/api/departments', 1, {
      name: 'QA Ops',
      parentId: 2,
      headId: 30,
    });
    expect(added.json()).toEqual({ ok: true, id: 77 });
    expect(s.calls[0]).toMatchObject({
      method: 'department.add',
      params: { NAME: 'QA Ops', PARENT: 2, UF_HEAD: 30 },
    });
    expect((await call('PUT', '/api/departments/2', 1, { parentId: 3 })).statusCode).toBe(400);
    expect(
      (await call('PUT', '/api/departments/3', 1, { name: 'Mobile Apps', headId: 30 })).statusCode,
    ).toBe(200);
    expect(s.calls[1]).toMatchObject({
      method: 'department.update',
      params: { ID: 3, NAME: 'Mobile Apps', UF_HEAD: 30 },
    });
  });

  it('a Bitrix24 refusal is logged and explained', async () => {
    const s = await server({
      fail: new BitrixError('user.update', 'insufficient_scope', 'scope', false),
    });
    const r = await call('PUT', '/api/people/30', 1, { position: 'Lead' });
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatch(/Departments or Users permission/);
    expect(s.recorded[0]).toMatchObject({ ok: false, action: 'position' });
    expect(s.synced()).toBe(0);
  });

  it('the dashboard role changes rights; locked admins stay admins', async () => {
    await server();
    expect((await call('GET', '/api/auth/me', 30)).json()).toMatchObject({
      role: 'member',
      kpi: false,
    });
    expect((await call('PUT', '/api/people/30/role', 1, { role: 'teamLead' })).statusCode).toBe(
      200,
    );
    expect((await call('GET', '/api/auth/me', 30)).json()).toMatchObject({
      role: 'teamLead',
      kpi: true,
      people: true,
    });
    expect((await call('PUT', '/api/people/9/role', 1, { role: 'member' })).statusCode).toBe(409);
    expect((await call('PUT', '/api/people/30/role', 1, { role: null })).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/me', 30)).json()).toMatchObject({ role: 'member' });
  });
});
