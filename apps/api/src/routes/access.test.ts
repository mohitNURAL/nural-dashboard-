// Access permissions (SRS 7): rights from roles, overridden per department (sub-departments
// included, the deeper department winning) and per person; enforced at once on every surface;
// admins only; config admins locked; every change audited. Plus the Employee module's guard and
// sign-in status.
import { indexTasks, issueTypeOf, type MetricTask } from '@nural/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { Dataset } from '../data/dataset';
import { buildServer } from '../server';
import { memoryAccessStore } from './access';
import { signInStatus } from './employees';
import { memoryPrefsStore } from './prefs';

const SECRET = 'a'.repeat(40);
const NOW = new Date('2026-10-11T06:30:00Z');

// Company 1 > Development 2 > Mobile 6; Company 1 > Tech Support 8.
// 1 admin (config), 12 team lead (Development), 30 developer (Mobile), 31 developer
// (Development), 52 support (Tech Support).
const departments = [
  { id: 1, name: 'Company', parentId: null, headId: 1 },
  { id: 2, name: 'Development', parentId: 1, headId: 12 },
  { id: 6, name: 'Mobile', parentId: 2, headId: null },
  { id: 8, name: 'Tech Support', parentId: 1, headId: 52 },
];
const deptOf: Record<number, number[]> = { 1: [1], 12: [2], 30: [6], 31: [2], 52: [8] };

let n = 1;
const task = (over: Partial<MetricTask>): MetricTask => ({
  id: n++,
  title: 'T',
  groupId: 154,
  stage: 'To do',
  stageTitle: 'To do',
  status: 2,
  priority: 1,
  responsibleId: 30,
  createdBy: 12,
  createdAt: new Date('2026-10-01T05:00:00Z'),
  changedAt: new Date('2026-10-09T05:00:00Z'),
  deadline: null,
  closedAt: null,
  parentId: null,
  relatedIds: [],
  tags: [],
  isIssue: false,
  issueType: issueTypeOf([]),
  events: [],
  ...over,
});
const tasks = [
  task({ responsibleId: 30, deadline: new Date('2026-10-05T12:00:00Z') }), // 30's, overdue
  task({ responsibleId: 31 }),
  task({ responsibleId: 12 }),
  task({ responsibleId: 52, createdBy: 52 }),
];

const dataset = async (): Promise<Dataset> =>
  ({
    tasks,
    byId: indexTasks(tasks),
    testers: new Set(),
    developers: new Set([30, 31, 12]),
    users: new Map(
      [1, 12, 30, 31, 52].map((id) => [
        id,
        {
          id,
          name: `Person ${id}`,
          workPosition: id === 12 ? 'Team Lead' : null,
          deptGroup: 'Development' as const,
          active: true,
          departmentIds: deptOf[id],
        },
      ]),
    ),
    projects: new Map([[154, { id: 154, name: 'App' }]]),
    owners: new Map(),
    kpiDept: new Map([
      [52, 'support'],
      [30, 'dev'],
      [31, 'dev'],
      [12, 'dev'],
    ]),
    supportLead: 52,
    departments,
    portalOrigin: 'https://portal.example',
    loadedAt: NOW,
  }) as unknown as Dataset;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server() {
  const prefs = memoryPrefsStore();
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    now: () => NOW,
    prefs,
    access: memoryAccessStore(),
    roles: { admins: [1], pms: [], teamLeads: [12], productOwners: [] },
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 's',
      sessionSecret: SECRET,
      portalOrigin: 'https://portal.example',
      secure: true,
    },
  });
  return { prefs };
}

const cookie = (uid: number) =>
  `${SESSION_COOKIE}=${sign({ userId: uid, name: `Person ${uid}`, exp: Date.now() + 60_000 }, SECRET)}`;
const get = (uid: number, url: string) => app!.inject({ url, headers: { cookie: cookie(uid) } });
const put = (uid: number, url: string, rights: unknown) =>
  app!.inject({
    method: 'PUT',
    url,
    headers: { cookie: cookie(uid) },
    payload: { rights } as Record<string, unknown>,
  });
const me = async (uid: number) => (await get(uid, '/api/auth/me')).json();
const taskCount = async (uid: number) => (await get(uid, '/api/tasks?kind=all')).json().total;

describe('access permissions', () => {
  it('defaults follow the role, as before', async () => {
    await server();
    expect(await me(30)).toMatchObject({
      full: false,
      kpi: false,
      support: false,
      employees: false,
      editAll: false,
      admin: false,
    });
    expect(await me(12)).toMatchObject({
      full: true,
      kpi: true,
      support: true,
      employees: true,
      editAll: true,
      admin: false,
    });
    expect(await me(52)).toMatchObject({ full: false, support: true, inbox: true });
    expect(await me(1)).toMatchObject({ admin: true, employees: true });
  });

  it('only admins reach Access; only the employees right reaches the Employee module', async () => {
    await server();
    expect((await get(12, '/api/access')).statusCode).toBe(403);
    expect((await put(12, '/api/access/user/30', { scope: 'all' })).statusCode).toBe(403);
    expect((await get(30, '/api/employees')).statusCode).toBe(403);
    expect((await get(30, '/api/employees/tree')).statusCode).toBe(403);
    expect((await get(12, '/api/employees')).statusCode).toBe(200);
    expect((await get(1, '/api/access')).statusCode).toBe(200);
  });

  it('a person grant takes effect at once on data, KPI and edit rights', async () => {
    await server();
    expect(await taskCount(30)).toBe(1);
    expect((await get(30, '/api/kpi/summary')).statusCode).toBe(403);
    expect((await get(30, '/api/tasks/edit-options')).statusCode).toBe(403);
    expect(
      (await put(1, '/api/access/user/30', { scope: 'all', kpi: true, edit: 'all' })).statusCode,
    ).toBe(200);
    expect(await taskCount(30)).toBe(tasks.length);
    expect((await get(30, '/api/kpi/summary')).statusCode).toBe(200);
    expect((await get(30, '/api/tasks/edit-options')).statusCode).toBe(200);
    // Removing the grant goes back to the role's defaults.
    await put(1, '/api/access/user/30', null);
    expect(await taskCount(30)).toBe(1);
    expect((await me(30)).kpi).toBe(false);
  });

  it('a deny takes a right away from a team lead', async () => {
    await server();
    await put(1, '/api/access/user/12', { kpi: false, scope: 'own' });
    expect((await get(12, '/api/kpi/summary')).statusCode).toBe(403);
    // Own tasks only: the one assigned to them (not those they created for others, nor 52's).
    expect(await taskCount(12)).toBe(1);
  });

  it('department grants reach sub-departments; the deeper department and the person win', async () => {
    await server();
    await put(1, '/api/access/dept/2', { employees: true }); // Development
    expect((await get(30, '/api/employees')).statusCode).toBe(200); // Mobile, inside Development
    expect((await get(31, '/api/employees')).statusCode).toBe(200);
    expect((await get(52, '/api/employees')).statusCode).toBe(403); // Tech Support: not covered
    await put(1, '/api/access/dept/6', { employees: false }); // Mobile overrides Development
    expect((await get(30, '/api/employees')).statusCode).toBe(403);
    expect((await get(31, '/api/employees')).statusCode).toBe(200);
    await put(1, '/api/access/user/30', { employees: true }); // the person over the department
    expect((await get(30, '/api/employees')).statusCode).toBe(200);
    const row = (await get(1, '/api/access'))
      .json()
      .people.find((p: { id: number }) => p.id === 30);
    // An old "Employees" grant covers both Employee pages.
    expect(row.source.people).toBe('person');
    expect(row.source.org).toBe('person');
    expect(row.source.kpi).toBe('role');
  });

  it('each page has its own right, checked by the server (2026-10-12)', async () => {
    await server();
    // Everyone has Development, QA and Insights by default; a person can lose one.
    expect((await get(30, '/api/dev/summary')).statusCode).toBe(200);
    await put(1, '/api/access/user/30', { dev: false, insights: false });
    expect((await get(30, '/api/dev/summary')).statusCode).toBe(403);
    expect((await get(30, '/api/insights')).statusCode).toBe(403);
    expect((await get(30, '/api/qa/summary')).statusCode).toBe(200);
    // The Company tree and the People directory are separate.
    await put(1, '/api/access/user/31', { org: true });
    expect((await get(31, '/api/employees/tree')).statusCode).toBe(200);
    expect((await get(31, '/api/employees')).statusCode).toBe(403);
    // Mailing can be given without making someone an admin.
    expect((await get(31, '/api/reports')).statusCode).toBe(403);
    await put(1, '/api/access/user/31', { org: true, mailing: true });
    expect((await get(31, '/api/reports')).statusCode).toBe(200);
    expect((await get(31, '/api/access')).statusCode).toBe(403);
    // Unknown rights are refused.
    expect((await put(1, '/api/access/user/31', { finance: true })).statusCode).toBe(400);
  });

  it('config admins are locked; bad input and unknown subjects are refused', async () => {
    await server();
    expect((await put(1, '/api/access/user/1', { admin: false })).statusCode).toBe(409);
    expect((await put(1, '/api/access/user/30', { scope: 'everything' })).statusCode).toBe(400);
    expect((await put(1, '/api/access/user/30', { superpower: true })).statusCode).toBe(400);
    expect((await put(1, '/api/access/user/999', { kpi: true })).statusCode).toBe(404);
    expect((await put(1, '/api/access/dept/999', { kpi: true })).statusCode).toBe(404);
  });

  it('an admin can make another admin, and every change is audited', async () => {
    await server();
    await put(1, '/api/access/user/31', { admin: true });
    expect((await get(31, '/api/access')).statusCode).toBe(200);
    await put(31, '/api/access/dept/8', { kpi: true });
    const rows = (await get(1, '/api/access/audit')).json().rows;
    expect(rows.map((r: { by: string; subject: string }) => `${r.by} → ${r.subject}`)).toEqual([
      'Person 31 → Tech Support',
      'Person 1 → Person 31',
    ]);
  });
});

describe('employee module', () => {
  it('lists people with access areas, sign-in status and open and overdue tasks', async () => {
    const { prefs } = await server();
    await prefs.signIn(30);
    const rows = (await get(12, '/api/employees')).json().rows;
    const p30 = rows.find((r: { id: number }) => r.id === 30);
    expect(p30).toMatchObject({
      departments: ['Mobile'],
      role: 'member',
      loginCount: 1,
      status: 'active',
      open: 1,
      overdue: 1,
    });
    expect(p30.rights).toMatchObject({ scope: 'own', kpi: false });
    expect(rows.find((r: { id: number }) => r.id === 31).status).toBe('never');
    const tree = (await get(12, '/api/employees/tree')).json().departments;
    expect(tree.find((d: { id: number }) => d.id === 2)).toMatchObject({
      head: { id: 12, name: 'Person 12', position: 'Team Lead' },
      members: [{ id: 12 }, { id: 31 }],
    });
  });

  it('works out the sign-in status', () => {
    const at = (min: number) => new Date(NOW.getTime() - min * 60_000);
    const a = (signIn: number | null, seen: number | null, count = 1) => ({
      loginCount: count,
      lastSignInAt: signIn === null ? null : at(signIn),
      lastSeenAt: seen === null ? null : at(seen),
    });
    expect(signInStatus(undefined, NOW, 3)).toBe('never');
    expect(signInStatus(a(60, 2), NOW, 3)).toBe('active');
    expect(signInStatus(a(60, 30), NOW, 3)).toBe('signedIn');
    expect(signInStatus(a(4 * 1440, 4 * 1440), NOW, 3)).toBe('ended');
    expect(signInStatus(a(null, null, 5), NOW, 3)).toBe('earlier');
  });
});
