// The workflow API (SRS 22): everyone reads it, only admins change it, and a change moves the
// numbers at once; every version can be restored.
import {
  applyWorkflow,
  DEFAULT_WORKFLOW,
  indexTasks,
  issueTypeOf,
  type MetricTask,
} from '@nural/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { Dataset } from '../data/dataset';
import { buildServer } from '../server';

const SECRET = 'w'.repeat(40);
const task = (id: number, stage: string): MetricTask => ({
  id,
  title: `Task ${id}`,
  groupId: 100,
  stage,
  stageTitle: stage,
  status: 2,
  priority: 1,
  responsibleId: 30,
  createdBy: 30,
  createdAt: new Date('2026-09-01'),
  changedAt: new Date('2026-10-01'),
  deadline: null,
  closedAt: null,
  parentId: null,
  relatedIds: [],
  tags: [],
  isIssue: false,
  issueType: issueTypeOf([]),
  events: [],
});
const tasks = [task(1, 'To do'), task(2, 'Pending for QA'), task(3, 'QA Backlog')];
const dataset = async (): Promise<Dataset> =>
  ({
    tasks,
    byId: indexTasks(tasks),
    testers: new Set(),
    users: new Map([
      [
        30,
        {
          id: 30,
          name: 'Neel',
          workPosition: null,
          email: null,
          deptGroup: 'Development',
          active: true,
          departmentIds: [],
        },
      ],
    ]),
    projects: new Map([[100, { id: 100, name: 'Edge' }]]),
    owners: new Map(),
    kpiDept: new Map([[30, 'dev']]),
    departments: [],
    boards: new Map([
      [
        100,
        [
          { id: 1, title: 'New', stage: 'To do', color: null },
          { id: 2, title: 'Sprint planning', stage: null, color: null },
        ],
      ],
    ]),
    portalOrigin: 'https://portal.example',
    loadedAt: new Date(),
  }) as unknown as Dataset;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  applyWorkflow(DEFAULT_WORKFLOW);
});

async function server() {
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    roles: { admins: [1], pms: [], teamLeads: [], productOwners: [] },
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 's',
      sessionSecret: SECRET,
      portalOrigin: 'https://portal.example',
      secure: true,
    },
  });
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
const pending = async () =>
  (await call('GET', '/api/tasks?preset=pending&pageSize=1', 1)).json().total;

describe('workflow API', () => {
  it('everyone reads it; projects show their columns, type and unmapped columns', async () => {
    await server();
    const r = (await call('GET', '/api/workflow', 30)).json();
    expect(r).toMatchObject({ version: 0, isDefault: true });
    expect(r.workflow.stages).toHaveLength(11);
    const p = (await call('GET', '/api/workflow/projects', 30)).json().projects[0];
    expect(p).toMatchObject({ name: 'Edge', unmapped: ['Sprint planning'] });
  });

  it('only admins change it, and a change moves the numbers; versions restore', async () => {
    await server();
    expect(await pending()).toBe(2);
    const wf = structuredClone(DEFAULT_WORKFLOW);
    wf.stages.find((s) => s.title === 'Pending for QA')!.category = 'completed';
    expect((await call('PUT', '/api/workflow', 30, wf)).statusCode).toBe(403);
    expect((await call('PUT', '/api/workflow', 1, wf)).json()).toEqual({ ok: true, version: 1 });
    expect(await pending()).toBe(1);
    const bad = structuredClone(DEFAULT_WORKFLOW);
    bad.stages[0]!.roles = [];
    const refused = await call('PUT', '/api/workflow', 1, bad);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().errors).toContain('One stage must be the start.');
    expect((await call('GET', '/api/workflow/history', 1)).json().versions).toHaveLength(1);
    expect((await call('POST', '/api/workflow/restore/0', 1)).json()).toEqual({
      ok: true,
      version: 2,
    });
    expect(await pending()).toBe(2);
    expect((await call('POST', '/api/workflow/restore/0', 30)).statusCode).toBe(403);
  });
});
