// Bulk edit (SRS 7, Task actions): every selected task is checked first; inconsistent ones are
// reported with a reason and never sent; Bitrix24 refusals are reported per task.
import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { TokenStore } from '../auth/tokens';
import { BitrixError, type Params } from '../bitrix';
import type { DatasetProvider } from '../data/dataset';
import { buildServer } from '../server';

const SECRET = 'x'.repeat(40);
const PORTAL = 'https://portal.example';
const base = {
  stage: 'To do',
  stageTitle: 'To Do',
  status: 2,
  events: [],
  createdBy: 10,
  tags: [],
  priority: 1,
  deadline: null,
};
// Neha (7) owns 41, 43, 44, 45; 42 is someone else's.
const tasks = [
  { ...base, id: 41, groupId: 154, responsibleId: 7, stageId: '1001' },
  { ...base, id: 42, groupId: 154, responsibleId: 30, stageId: '1001' },
  { ...base, id: 43, groupId: 160, responsibleId: 7, stageId: '2001' }, // board has no In progress
  { ...base, id: 44, groupId: 0, responsibleId: 7, stage: 'Done', stageTitle: null }, // no board
  { ...base, id: 45, groupId: 154, responsibleId: 7, stage: 'In progress', stageId: '1002' },
];
const dataset = (async () => ({
  tasks,
  byId: new Map(tasks.map((t) => [t.id, t])),
  testers: new Set(),
  users: new Map([
    [7, { id: 7, name: 'Neha', active: true, deptGroup: 'Development' }],
    [30, { id: 30, name: 'Vijay', active: true, deptGroup: 'Development' }],
    [31, { id: 31, name: 'Left', active: false, deptGroup: 'Development' }],
  ]),
  projects: new Map([
    [154, { id: 154, name: 'Moto India' }],
    [160, { id: 160, name: 'Support Tool' }],
  ]),
  boards: new Map([
    [
      154,
      [
        { id: 1001, title: 'To Do', stage: 'To do', color: null },
        { id: 1002, title: 'In progress', stage: 'In progress', color: null },
        { id: 1003, title: 'QA Backlog', stage: 'QA Backlog', color: null },
      ],
    ],
    [
      160,
      [
        { id: 2001, title: 'New', stage: 'To do', color: null },
        { id: 2002, title: 'Finished', stage: 'Done', color: null },
      ],
    ],
  ]),
  portalOrigin: PORTAL,
  loadedAt: new Date(),
})) as unknown as DatasetProvider;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server(opts: { full?: boolean; failOn?: number } = {}) {
  const calls: { method: string; params: Params }[] = [];
  const recorded: { ok: boolean; taskId: number }[] = [];
  const tokens: TokenStore = {
    save: async () => undefined,
    get: async () => ({
      accessToken: 't',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 6e4),
      scope: 'task',
    }),
  };
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    now: () => new Date('2026-10-11T06:30:00Z'),
    roles: { admins: [], pms: [], teamLeads: opts.full ? [7] : [], productOwners: [] },
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 's',
      sessionSecret: SECRET,
      portalOrigin: PORTAL,
      secure: true,
    },
    actions: {
      tokens,
      userCall: async <T>(method: string, params: Params) => {
        const id = Number(params.taskId ?? params.id);
        if (id === opts.failOn)
          throw new BitrixError(method, 'ACCESS_DENIED', 'No access to this task', false);
        calls.push({ method, params });
        return { result: true as T };
      },
      enqueue: async () => undefined,
      record: async (a) => void recorded.push(a),
    },
  });
  return { calls, recorded };
}

const cookie = `${SESSION_COOKIE}=${sign({ userId: 7, name: 'Neha', exp: Date.now() + 60_000 }, SECRET)}`;
const post = (url: string, body: unknown) =>
  app!.inject({
    method: 'POST',
    url,
    payload: body as Record<string, unknown>,
    headers: { cookie },
  });
const byId = (results: { id: number; state: string; reason: string }[]) =>
  Object.fromEntries(results.map((r) => [r.id, [r.state, r.reason]]));

describe('bulk edit', () => {
  it('checks every task and explains each inconsistency, changing nothing', async () => {
    const s = await server();
    const res = await post('/api/tasks/bulk/check', {
      ids: [41, 42, 43, 44, 45],
      edit: { kind: 'stage', stage: 'In progress' },
    });
    expect(byId(res.json().results)).toEqual({
      41: ['ok', 'moved to In progress'],
      42: ['error', 'Not found, or outside your scope.'],
      43: ['error', 'Its board (Support Tool) has no "In progress" column.'],
      44: ['error', 'Not on a Kanban board (no project), so it has no columns.'],
      45: ['skip', 'Already in In progress.'],
    });
    expect(s.calls).toHaveLength(0);
  });

  it('applies only the valid tasks, each to its own board’s column', async () => {
    const s = await server();
    const res = await post('/api/tasks/bulk/apply', {
      ids: [41, 42, 43, 45],
      edit: { kind: 'stage', stage: 'In progress' },
    });
    const states = Object.fromEntries(
      res.json().results.map((r: { id: number; state: string }) => [r.id, r.state]),
    );
    expect(states).toEqual({ 41: 'done', 42: 'error', 43: 'error', 45: 'skip' });
    expect(s.calls).toEqual([
      { method: 'task.stages.movetask', params: { id: 41, stageId: 1002 } },
    ]);
  });

  it('reports a Bitrix24 refusal for one task and carries on with the rest', async () => {
    const s = await server({ failOn: 41 });
    const res = await post('/api/tasks/bulk/apply', {
      ids: [41, 45],
      edit: { kind: 'status', status: 'completed' },
    });
    expect(byId(res.json().results)).toEqual({
      41: ['failed', 'Bitrix24 refused: No access to this task'],
      45: ['done', 'Completed'],
    });
    expect(s.recorded.map((r) => [r.taskId, r.ok])).toEqual([
      [41, false],
      [45, true],
    ]);
  });

  it('tags can be added in bulk, keeping each task’s own tags', async () => {
    const s = await server();
    await post('/api/tasks/bulk/apply', {
      ids: [41, 45],
      edit: { kind: 'field', field: 'tags', value: 'urgent, review', tagsMode: 'add' },
    });
    expect(s.calls.map((c) => c.params.fields)).toEqual([
      { TAGS: ['urgent', 'review'] },
      { TAGS: ['urgent', 'review'] },
    ]);
  });

  it('members cannot bulk change manager-only fields; managers can, with validation', async () => {
    await server();
    const member = await post('/api/tasks/bulk/check', {
      ids: [41, 45],
      edit: { kind: 'field', field: 'assignee', value: 30 },
    });
    expect(member.json().results.every((r: { state: string }) => r.state === 'error')).toBe(true);
    await app!.close();
    const s = await server({ full: true });
    const res = await post('/api/tasks/bulk/check', {
      ids: [41, 42],
      edit: { kind: 'field', field: 'assignee', value: 31 },
    });
    expect(byId(res.json().results)).toEqual({
      41: ['error', 'Left is no longer active.'],
      42: ['error', 'Left is no longer active.'],
    });
    const past = await post('/api/tasks/bulk/check', {
      ids: [41],
      edit: { kind: 'field', field: 'deadline', value: '2026-10-01T10:00:00Z' },
    });
    expect(past.json().results[0]).toMatchObject({
      state: 'error',
      reason: 'The deadline must be in the future.',
    });
    expect(s.calls).toHaveLength(0);
  });

  it('refuses more than 100 tasks at once', async () => {
    await server();
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    expect(
      (await post('/api/tasks/bulk/check', { ids, edit: { kind: 'status', status: 'completed' } }))
        .statusCode,
    ).toBe(400);
  });
});
