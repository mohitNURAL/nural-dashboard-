// NFR-4 scoping, tested on every surface. The core check is an equivalence: for each person,
// every endpoint of the real server (sign-in and roles on) must answer exactly what a server
// holding only that person's tasks answers. Anything leaked would make the two differ.
import { indexTasks, issueTypeOf, type MetricTask, type TaskChanged } from '@nural/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '../data/dataset';
import { createMemoryBus } from '../events/bus';
import { mayReceive } from '../routes/stream';
import { buildServer } from '../server';
import { inScope, scopeDataset, viewerOf, type RolesConfig, LOCAL_VIEWER } from './roles';
import { sign, SESSION_COOKIE } from './session';

const NOW = new Date('2026-10-10T06:30:00Z');
const SECRET = 's'.repeat(40);
const PORTAL = 'https://portal.example';

// People: 40 admin, 10 PM, 12 team lead, 70 owns workgroup 154 (product owner); members:
// 30 and 28 developers, 14 tester (files issues), 99 nobody's tasks.
const ROLES: RolesConfig = { admins: [40], pms: [10], teamLeads: [12], productOwners: [] };
const FULL = [40, 10, 12, 70];
const MEMBERS = [30, 28, 14, 99];

let next = 1;
const t = (over: Partial<MetricTask>): MetricTask => {
  const tags = over.tags ?? [];
  const issueType = issueTypeOf(tags);
  return {
    id: next++,
    title: `Task ${next}`,
    groupId: 154,
    stage: 'To do',
    stageTitle: 'To do',
    status: 2,
    priority: 1,
    responsibleId: 30,
    createdBy: 10,
    createdAt: new Date('2026-10-01T05:00:00Z'),
    changedAt: new Date('2026-10-09T05:00:00Z'),
    deadline: null,
    closedAt: null,
    parentId: null,
    relatedIds: [],
    tags,
    isIssue: issueType !== null,
    issueType,
    events: [],
    ...over,
  };
};

const tasks: MetricTask[] = [
  t({ id: 1, deadline: new Date('2026-10-05T12:00:00Z') }), // 30's, overdue
  t({ id: 2, responsibleId: 28, groupId: 148, stage: 'QA Backlog' }), // 28's
  t({ id: 3, responsibleId: 28, createdBy: 30, groupId: 148, stage: 'In progress' }), // 28's, by 30
  t({ id: 4, responsibleId: 28, createdBy: 14, groupId: 148, tags: ['bug'] }), // 28's bug by 14
  t({ id: 5, createdBy: 14, tags: ['feedback'], stage: 'QA Backlog' }), // 30's feedback by 14
  t({ id: 6, responsibleId: 12, createdBy: 12, groupId: 160, stage: 'LIVE' }), // the TL's
  t({ id: 7, responsibleId: 14, createdBy: 14, groupId: 0, stage: 'Done' }), // tester's own
  t({ id: 8, responsibleId: 28, groupId: 148, stage: 'On Hold' }), // 28's, on hold
];
const visible = (uid: number) =>
  tasks
    .filter((x) => inScope(x, uid))
    .map((x) => x.id)
    .sort();

const users = new Map(
  [40, 10, 12, 70, 30, 28, 14, 99].map((id) => [
    id,
    {
      id,
      name: `Person ${id}`,
      workPosition: null,
      deptGroup: (id === 14 ? 'Testing' : 'Development') as 'Testing' | 'Development',
      active: true,
    },
  ]),
);

const makeDataset = (list: MetricTask[]): Dataset => ({
  tasks: list,
  byId: indexTasks(list),
  testers: new Set([14]),
  developers: new Set([30, 28, 12, 10]),
  qaLead: 12,
  stageIds: new Map(),
  users,
  projects: new Map([
    [154, { id: 154, name: 'Moto India' }],
    [148, { id: 148, name: 'Nural Edge' }],
    [160, { id: 160, name: 'Support Tool' }],
  ]),
  owners: new Map([
    [154, 70],
    [148, 70],
  ]),
  kpiDept: new Map(),
  comments: [],
  boards: new Map(),
  portalOrigin: PORTAL,
  loadedAt: NOW,
});
const FULL_DS = makeDataset(tasks);

const cookie = (uid: number) =>
  `${SESSION_COOKIE}=${sign({ userId: uid, name: `Person ${uid}`, exp: Date.now() + 600_000 }, SECRET)}`;

// Every GET endpoint that serves data, with the variants that change what is counted.
const ENDPOINTS = [
  '/api/dev/summary?scope=all',
  '/api/dev/summary?scope=dev',
  '/api/dev/summary?scope=issues',
  '/api/dev/assignees?scope=all',
  '/api/dev/assignees?scope=all&groupBy=project',
  '/api/dev/ranking?scope=all',
  '/api/dev/matrix?scope=all',
  '/api/dev/matrix?scope=all&groupBy=project',
  '/api/qa/summary',
  '/api/qa/issues',
  '/api/qa/issues?groupBy=project',
  '/api/qa/testing',
  '/api/qa/filed',
  '/api/qa/open',
  '/api/qa/inhand/calendar?view=day',
  '/api/dev/inhand/calendar?view=month&groupBy=project',
  '/api/qa/retest',
  '/api/qa/retest?groupBy=project',
  '/api/filters/options?tab=dev&scope=all',
  '/api/filters/options?tab=qa',
  '/api/alerts',
  '/api/tasks?kind=all&preset=all&pageSize=200',
  '/api/tasks?kind=tasks&scope=all&preset=total&pageSize=200',
  '/api/tasks?kind=issues&preset=all&pageSize=200',
  '/api/tasks?kind=tasks&scope=all&preset=pending&pageSize=200',
  '/api/tasks?kind=all&ids=1,2,3,4,5,6,7,8&pageSize=200',
  '/api/insights',
  '/api/insights?window=30',
];

/** Drops the request clock, which differs between two otherwise identical answers. */
const stable = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v), (k, x) =>
    k === 'asOf' || k === 'dataLoadedAt' || k === 'viewScope' ? undefined : x,
  );

let scoped: Awaited<ReturnType<typeof buildServer>>;
const references = new Map<number, Awaited<ReturnType<typeof buildServer>>>();
let fullReference: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  scoped = await buildServer({
    getDataset: async () => FULL_DS,
    now: () => NOW,
    logger: false,
    roles: ROLES,
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 'x',
      sessionSecret: SECRET,
      portalOrigin: PORTAL,
      secure: true,
    },
  });
  fullReference = await buildServer({
    getDataset: async () => FULL_DS,
    now: () => NOW,
    logger: false,
    roles: ROLES,
    auth: { mode: 'off' },
  });
  // A sign-in-off server per member, holding only that member's tasks: the expected answers.
  for (const uid of MEMBERS) {
    references.set(
      uid,
      await buildServer({
        getDataset: async () => makeDataset(tasks.filter((x) => inScope(x, uid))),
        now: () => NOW,
        logger: false,
        roles: ROLES,
        auth: { mode: 'off' },
      }),
    );
  }
});
afterAll(async () => {
  await scoped.close();
  await fullReference.close();
  for (const r of references.values()) await r.close();
});

const get = (url: string, uid: number) =>
  scoped.inject({ method: 'GET', url, headers: { cookie: cookie(uid) } });

describe('roles (NFR-4)', () => {
  it('admins, PM, team leads and project owners see everything; others are members', () => {
    const v = (id: number) => viewerOf(id, FULL_DS, ROLES, true);
    expect(v(40)).toMatchObject({ role: 'admin', full: true });
    expect(v(10)).toMatchObject({ role: 'pm', full: true });
    expect(v(12)).toMatchObject({ role: 'teamLead', full: true });
    expect(v(70)).toMatchObject({ role: 'productOwner', full: true }); // owns a workgroup
    expect(viewerOf(99, FULL_DS, { ...ROLES, productOwners: [99] }, true).full).toBe(true);
    for (const id of [30, 28, 14, 99]) expect(v(id)).toMatchObject({ role: 'member', full: false });
    expect(viewerOf(null, FULL_DS, ROLES, true).full).toBe(false); // no session: nothing
    expect(viewerOf(30, FULL_DS, ROLES, false)).toMatchObject({ role: 'local', full: true });
  });

  it('a member’s scope is tasks assigned to them or created by them', () => {
    expect(visible(30)).toEqual([1, 3, 5]);
    expect(visible(28)).toEqual([2, 3, 4, 8]);
    expect(visible(14)).toEqual([4, 5, 7]);
    expect(visible(99)).toEqual([]);
    expect(scopeDataset(FULL_DS, 30).byId.has(2)).toBe(false);
    // Memoised per person and dataset, never shared between people.
    expect(scopeDataset(FULL_DS, 30)).toBe(scopeDataset(FULL_DS, 30));
    expect(scopeDataset(FULL_DS, 30)).not.toBe(scopeDataset(FULL_DS, 28));
  });

  it('/api/auth/me tells the web app the role and access', async () => {
    expect((await get('/api/auth/me', 12)).json()).toMatchObject({ role: 'teamLead', full: true });
    expect((await get('/api/auth/me', 30)).json()).toMatchObject({ role: 'member', full: false });
  });
});

describe('every endpoint answers a member exactly as if only their tasks existed', () => {
  for (const uid of MEMBERS) {
    it(`member ${uid}`, async () => {
      const reference = references.get(uid)!;
      for (const url of ENDPOINTS) {
        const got = await get(url, uid);
        const want = await reference.inject({ method: 'GET', url });
        expect(got.statusCode, url).toBe(200);
        expect(stable(got.json()), `${url} as ${uid}`).toEqual(stable(want.json()));
      }
    });
  }

  it('people are served one after another without mixing (no shared cache)', async () => {
    const ids = async (uid: number) =>
      (await get('/api/tasks?kind=all&preset=all&pageSize=200', uid))
        .json()
        .rows.map((r: { id: number }) => r.id)
        .sort();
    expect(await ids(30)).toEqual(visible(30));
    expect(await ids(28)).toEqual(visible(28));
    expect(await ids(30)).toEqual(visible(30));
    expect(await ids(12)).toEqual(tasks.map((x) => x.id).sort());
  });
});

describe('full access sees everything', () => {
  for (const uid of FULL) {
    it(`full viewer ${uid}: every endpoint as if sign-in were off`, async () => {
      for (const url of ENDPOINTS) {
        const got = await get(url, uid);
        const want = await fullReference.inject({ method: 'GET', url });
        expect(stable(got.json()), `${url} as ${uid}`).toEqual(stable(want.json()));
      }
      expect((await get('/api/tasks?kind=all&preset=all&pageSize=200', uid)).json().total).toBe(
        tasks.length,
      );
    });
  }
});

describe('task view, actions and export follow the scope', () => {
  it('a member opens only their own tasks', async () => {
    for (const uid of MEMBERS) {
      for (const x of tasks) {
        const res = await get(`/api/tasks/${x.id}`, uid);
        expect(res.statusCode, `task ${x.id} as ${uid}`).toBe(inScope(x, uid) ? 200 : 404);
      }
    }
  });

  it('linked tasks in the view are scoped too', async () => {
    // Task 3 (28's, created by 30): 30 sees it, but not 28's other tasks through it.
    const view = (await get('/api/tasks/3', 30)).json();
    const ids = [view.parent, ...view.linkedIssues, ...view.related]
      .filter(Boolean)
      .map((r: { id: number }) => r.id);
    for (const id of ids) expect(visible(30)).toContain(id);
  });

  it('the Excel export holds only the member’s tasks', async () => {
    const res = await get('/api/tasks/export?kind=all&preset=all', 28);
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    const ids: number[] = [];
    sheet.eachRow((row, n) => {
      // Rows 1-3 are the title band, row 4 the header; the ID cell links to Bitrix24.
      if (n > 4) ids.push(Number(row.getCell(1).text));
    });
    expect(ids.filter(Boolean).sort((a, b) => a - b)).toEqual(visible(28));
  });

  it('a member cannot change another person’s task (it does not exist for them)', async () => {
    const res = await scoped.inject({
      method: 'POST',
      url: '/api/tasks/2/status',
      payload: { status: 'completed' },
      headers: { cookie: cookie(30) },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('KPI tab: managers only', () => {
  const KPI = [
    'summary',
    'projects',
    'people',
    'workload',
    'overdue',
    'activity',
    'insights',
    'inhand/calendar',
  ];

  it('every KPI endpoint and KPI task list refuses a member', async () => {
    for (const uid of MEMBERS) {
      for (const k of KPI) expect((await get(`/api/kpi/${k}`, uid)).statusCode, k).toBe(403);
      expect((await get('/api/tasks?kind=kpi&preset=all&kpi=open', uid)).statusCode).toBe(403);
      expect((await get('/api/tasks/export?kind=kpi&preset=all', uid)).statusCode).toBe(403);
    }
  });

  it('and serves full access', async () => {
    for (const uid of FULL) {
      for (const k of KPI) expect((await get(`/api/kpi/${k}`, uid)).statusCode, k).toBe(200);
      expect((await get('/api/tasks?kind=kpi&preset=all&kpi=open', uid)).statusCode).toBe(200);
    }
  });

  it('signed out: nothing at all', async () => {
    for (const url of [...ENDPOINTS, '/api/kpi/summary']) {
      expect((await scoped.inject({ method: 'GET', url })).statusCode, url).toBe(401);
    }
  });
});

describe('live stream', () => {
  const change = (people?: number[], taskId = 2): TaskChanged => ({
    type: 'task.changed',
    taskId,
    title: 'Secret title',
    projectId: 148,
    stage: 'In QA',
    fromStage: 'QA Backlog',
    stageGroup: 'sentToQa',
    isIssue: false,
    isNew: false,
    reopened: false,
    deleted: false,
    source: 'webhook',
    at: NOW.toISOString(),
    people,
  });
  const member = (userId: number) => ({
    ...LOCAL_VIEWER,
    userId,
    role: 'member' as const,
    full: false,
    kpi: false,
    support: false,
    inbox: false,
    employees: false,
    editAll: false,
    admin: false,
  });

  it('a member receives only changes naming them; full viewers receive all', () => {
    expect(mayReceive(member(28), change([28, 10]))).toBe(true);
    expect(mayReceive(member(30), change([28, 10]))).toBe(false);
    expect(mayReceive(member(30), change(undefined))).toBe(false); // names no one: not sent
    expect(mayReceive(member(30), change(undefined, 0))).toBe(true); // nightly notice
    expect(
      mayReceive(
        {
          ...LOCAL_VIEWER,
          userId: 12,
          role: 'teamLead',
          full: true,
          kpi: true,
          support: true,
          inbox: false,
          employees: true,
          editAll: true,
          admin: false,
        },
        change([28]),
      ),
    ).toBe(true);
  });

  it('end to end: a member’s stream carries their change and not another person’s', async () => {
    const bus = createMemoryBus();
    const app = await buildServer({
      getDataset: async () => FULL_DS,
      bus,
      logger: false,
      roles: ROLES,
      auth: {
        mode: 'bitrix',
        clientId: 'c',
        clientSecret: 'x',
        sessionSecret: SECRET,
        portalOrigin: PORTAL,
        secure: false,
      },
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const addr = app.server.address() as { port: number };
    const ctrl = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${addr.port}/api/stream`, {
        headers: { cookie: cookie(30) },
        signal: ctrl.signal,
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      const readUntil = async (needle: string) => {
        while (!text.includes(needle)) text += decoder.decode((await reader.read()).value);
      };
      await readUntil('event: hello');
      await bus.publish({ ...change([28, 10], 2), title: 'NOT FOR 30' });
      await bus.publish({ ...change([30, 10], 1), title: 'For 30' });
      await readUntil('For 30');
      expect(text).not.toContain('NOT FOR 30');
    } finally {
      ctrl.abort();
      await app.close();
    }
  });
});
