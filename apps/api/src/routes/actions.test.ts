import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { TokenStore } from '../auth/tokens';
import { BitrixError, type Params } from '../bitrix';
import { createRawCaller } from '../bitrix/client';
import type { DatasetProvider } from '../data/dataset';
import { buildServer } from '../server';
import { statusPlan } from './actions';

const SECRET = 'x'.repeat(40);
const PORTAL = 'https://portal.example';
// Task 41 is Neha's (7); task 42 is someone else's, outside her scope (NFR-4).
const task = {
  id: 41,
  groupId: 154,
  stage: 'To do',
  stageTitle: 'To Do',
  status: 2,
  events: [],
  responsibleId: 7,
  createdBy: 10,
  tags: ['old'],
};
const other = { ...task, id: 42, responsibleId: 30, createdBy: 10 };
const dataset = (async () => ({
  tasks: [task, other],
  byId: new Map([
    [41, task],
    [42, other],
  ]),
  testers: new Set(),
  users: new Map([
    [7, { id: 7, name: 'Neha', active: true, deptGroup: 'Development' }],
    [30, { id: 30, name: 'Vijay', active: true, deptGroup: 'Development' }],
  ]),
  projects: new Map([
    [154, { id: 154, name: 'Moto India' }],
    [148, { id: 148, name: 'Nural Edge' }],
  ]),
  boards: new Map([
    [
      154,
      [
        { id: 1001, title: 'To Do', stage: 'To do', color: null },
        { id: 1002, title: 'In progress', stage: 'In progress', color: null },
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

type Calls = { method: string; params: Params; token: string }[];

async function server(
  opts: { scope?: string; fail?: BitrixError; token?: boolean; full?: boolean } = {},
) {
  const calls: Calls = [];
  const recorded: unknown[] = [];
  const enqueued: unknown[] = [];
  const tokens: TokenStore = {
    save: async () => undefined,
    get: async () =>
      opts.token === false
        ? null
        : {
            accessToken: 'user-token',
            refreshToken: 'r',
            expiresAt: new Date(Date.now() + 60_000),
            scope: opts.scope ?? 'task,user',
          },
  };
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    now: () => new Date('2026-10-11T06:30:00Z'),
    // Neha (7) is a member unless the test makes her a team lead.
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
      userCall: async <T>(method: string, params: Params, token: string) => {
        if (opts.fail) throw opts.fail;
        calls.push({ method, params, token });
        return { result: true as T };
      },
      enqueue: async (j) => void enqueued.push(j),
      record: async (a) => void recorded.push(a),
    },
  });
  return { app, calls, recorded, enqueued };
}

const cookie = `${SESSION_COOKIE}=${sign({ userId: 7, name: 'Neha', exp: Date.now() + 60_000 }, SECRET)}`;
const post = (url: string, body: unknown, signedIn = true) =>
  app!.inject({
    method: 'POST',
    url,
    payload: body as Record<string, unknown>,
    headers: signedIn ? { cookie } : {},
  });

describe('task actions (SRS 7)', () => {
  it('maps a status choice to Bitrix24 actions', () => {
    expect(statusPlan(2, 'completed')).toEqual(['tasks.task.complete']);
    expect(statusPlan(3, 'pending')).toEqual(['tasks.task.pause']);
    expect(statusPlan(5, 'pending')).toEqual(['tasks.task.renew']);
    expect(statusPlan(5, 'inProgress')).toEqual(['tasks.task.renew', 'tasks.task.start']);
    expect(statusPlan(6, 'completed')).toEqual(['tasks.task.renew', 'tasks.task.complete']);
    expect(statusPlan(2, 'deferred')).toEqual(['tasks.task.defer']);
    expect(statusPlan(5, 'completed')).toEqual([]);
  });

  it('moves a task to a column of its board as the signed-in person', async () => {
    const s = await server();
    const res = await post('/api/tasks/41/stage', { stageId: 1002 });
    expect(res.statusCode).toBe(200);
    expect(s.calls).toEqual([
      { method: 'task.stages.movetask', params: { id: 41, stageId: 1002 }, token: 'user-token' },
    ]);
    expect(s.recorded[0]).toMatchObject({
      userId: 7,
      taskId: 41,
      action: 'move',
      fromValue: 'To Do',
      toValue: 'In progress',
      ok: true,
    });
    expect(s.enqueued).toEqual([{ taskId: 41, event: 'ONTASKUPDATE' }]);
  });

  it('task view: saves several fields at once, fields first, then column, then status', async () => {
    const s = await server();
    const res = await post('/api/tasks/41/edit', {
      edits: [
        { kind: 'status', status: 'completed' },
        { kind: 'stage', stageId: 1002 },
        { kind: 'field', field: 'tags', value: 'bug, ui' },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().done).toHaveLength(3);
    expect(s.calls.map((c) => c.method)).toEqual([
      'tasks.task.update',
      'task.stages.movetask',
      'tasks.task.complete',
    ]);
    expect(s.recorded).toHaveLength(3);
  });

  it('task view: one refused change stops the whole save before anything changes', async () => {
    const s = await server();
    // A member may not change the priority; the column change must not run either.
    const res = await post('/api/tasks/41/edit', {
      edits: [
        { kind: 'stage', stageId: 1002 },
        { kind: 'field', field: 'priority', value: 'high' },
      ],
    });
    expect(res.statusCode).toBe(403);
    expect(s.calls).toEqual([]);
    // A new project and a column of the old board cannot go together.
    const both = await post('/api/tasks/41/edit', {
      edits: [
        { kind: 'field', field: 'project', value: 148 },
        { kind: 'stage', stageId: 1002 },
      ],
    });
    expect(both.statusCode).toBe(400);
    // Someone else's task does not exist for her.
    expect(
      (await post('/api/tasks/42/edit', { edits: [{ kind: 'status', status: 'completed' }] }))
        .statusCode,
    ).toBe(404);
  });

  it('task view: stops at the first Bitrix24 refusal', async () => {
    const s = await server({
      fail: new BitrixError('task.stages.movetask', 'ACCESS_DENIED', 'No access', false),
    });
    const res = await post('/api/tasks/41/edit', {
      edits: [
        { kind: 'stage', stageId: 1002 },
        { kind: 'status', status: 'completed' },
      ],
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    // The column move was tried and refused; the status change never ran.
    expect(s.recorded).toHaveLength(1);
    expect(s.recorded[0]).toMatchObject({ action: 'move', ok: false });
  });

  it('bulk: several changes at once, checked then applied per task in order', async () => {
    const s = await server();
    const body = {
      ids: [41],
      edits: [
        { kind: 'status', status: 'inProgress' },
        { kind: 'stage', stageId: 1002 },
        { kind: 'field', field: 'tags', value: 'ui', tagsMode: 'add' },
      ],
    };
    const checked = (await post('/api/tasks/bulk/check', body)).json();
    expect(checked.results).toEqual([
      { id: 41, state: 'ok', reason: 'tags saved, moved to In progress, In progress' },
    ]);
    expect(s.calls).toEqual([]);
    const applied = (await post('/api/tasks/bulk/apply', body)).json();
    expect(applied.results[0].state).toBe('done');
    expect(s.calls.map((c) => c.method)).toEqual([
      'tasks.task.update',
      'task.stages.movetask',
      'tasks.task.start',
    ]);
    // One change a member may not make refuses the task; the old single `edit` still works.
    const refused = (
      await post('/api/tasks/bulk/check', {
        ids: [41],
        edits: [
          { kind: 'stage', stageId: 1002 },
          { kind: 'field', field: 'priority', value: 'high' },
        ],
      })
    ).json();
    expect(refused.results[0].state).toBe('error');
    const single = (
      await post('/api/tasks/bulk/check', { ids: [41], edit: { kind: 'stage', stageId: 1002 } })
    ).json();
    expect(single.results[0].state).toBe('ok');
  });

  it('changes the status with Bitrix24’s own actions', async () => {
    const s = await server();
    expect((await post('/api/tasks/41/status', { status: 'completed' })).statusCode).toBe(200);
    expect(s.calls.map((c) => [c.method, c.params])).toEqual([
      ['tasks.task.complete', { taskId: 41 }],
    ]);
  });

  it('cannot change a task outside the person’s scope (another person’s task)', async () => {
    const s = await server();
    expect((await post('/api/tasks/42/status', { status: 'completed' })).statusCode).toBe(404);
    expect((await post('/api/tasks/42/stage', { stageId: 1002 })).statusCode).toBe(404);
    expect(s.calls).toHaveLength(0);
  });

  it('refuses a column from another board', async () => {
    const s = await server();
    expect((await post('/api/tasks/41/stage', { stageId: 9999 })).statusCode).toBe(400);
    expect(s.calls).toHaveLength(0);
  });

  it('needs a signed-in person with a token and the Tasks permission', async () => {
    await server();
    expect((await post('/api/tasks/41/status', { status: 'completed' }, false)).statusCode).toBe(
      401,
    );
    await app!.close();
    await server({ token: false });
    expect((await post('/api/tasks/41/status', { status: 'completed' })).json().error).toMatch(
      /Sign in again/,
    );
    await app!.close();
    // A missing Tasks permission is Bitrix24's own answer (insufficient_scope), not a guess.
    const s = await server({
      scope: 'app',
      fail: new BitrixError('tasks.task.complete', 'insufficient_scope', '', false),
    });
    const res = await post('/api/tasks/41/status', { status: 'completed' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/Tasks permission/);
    expect(s.recorded[0]).toMatchObject({ ok: false });
  });

  it('reports a Bitrix24 refusal and records it', async () => {
    const s = await server({
      fail: new BitrixError('tasks.task.complete', 'ACCESS_DENIED', 'Access denied', false),
    });
    const res = await post('/api/tasks/41/status', { status: 'completed' });
    expect(res.statusCode).toBe(403);
    expect(s.recorded[0]).toMatchObject({ ok: false, error: 'Bitrix24 refused: Access denied' });
  });

  it('explains a refused column move: only the project’s members can move its cards', async () => {
    const s = await server({
      fail: new BitrixError('task.stages.movetask', 'ACCESS_DENIED', 'Access denied', false),
    });
    const res = await post('/api/tasks/41/stage', { stageId: 1002 });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/only members of .+ can move cards/);
    expect(s.recorded[0]).toMatchObject({ ok: false, action: 'move' });
  });

  it('keeps the webhook read-only and task actions to their allowlist', async () => {
    const webhook = createRawCaller({ baseUrl: 'https://portal.example/rest/1/x/' });
    await expect(webhook('task.stages.movetask', {})).rejects.toThrow(/read-only/);
    const user = createRawCaller({ baseUrl: `${PORTAL}/rest/`, mode: 'userAction' });
    await expect(user('tasks.task.delete', { auth: 't' })).rejects.toThrow(/not an allowed/);
    await expect(user('tasks.task.complete', {})).rejects.toThrow(/user token/);
  });

  it('a member can set several tags (comma-separated, replacing the list)', async () => {
    const s = await server();
    const res = await post('/api/tasks/41/field', {
      field: 'tags',
      value: 'bug,  Backend App , new-tag, BUG',
    });
    expect(res.statusCode).toBe(200);
    expect(s.calls).toEqual([
      {
        method: 'tasks.task.update',
        params: { taskId: 41, fields: { TAGS: ['bug', 'Backend App', 'new-tag'] } },
        token: 'user-token',
      },
    ]);
    expect(s.recorded[0]).toMatchObject({
      action: 'field:tags',
      toValue: 'bug, Backend App, new-tag',
    });
  });

  it('a member cannot change project, assignee, priority or deadline', async () => {
    const s = await server();
    for (const [field, value] of [
      ['project', 148],
      ['assignee', 30],
      ['priority', 'high'],
      ['deadline', '2026-12-01T13:00:00Z'],
    ] as const) {
      const res = await post('/api/tasks/41/field', { field, value });
      expect(res.statusCode, field).toBe(403);
    }
    expect(
      (await app!.inject({ url: '/api/tasks/edit-options', headers: { cookie } })).statusCode,
    ).toBe(403);
    expect(s.calls).toHaveLength(0);
  });

  it('a manager can change every field', async () => {
    const s = await server({ full: true });
    for (const [field, value] of [
      ['project', 148],
      ['assignee', 30],
      ['priority', 'high'],
      ['deadline', '2026-12-01T13:00:00Z'],
    ] as const) {
      expect((await post('/api/tasks/41/field', { field, value })).statusCode, field).toBe(200);
    }
    expect(s.calls.map((c) => c.params.fields)).toEqual([
      { GROUP_ID: 148 },
      { RESPONSIBLE_ID: 30 },
      { PRIORITY: '2' },
      { DEADLINE: '2026-12-01T13:00:00.000Z' },
    ]);
    const opts = await app!.inject({ url: '/api/tasks/edit-options', headers: { cookie } });
    expect(opts.json().projects.map((p: { name: string }) => p.name)).toEqual([
      'Moto India',
      'Nural Edge',
    ]);
  });

  it('refuses a past deadline, an unknown project or person', async () => {
    const s = await server({ full: true });
    expect(
      (
        await post('/api/tasks/41/field', { field: 'deadline', value: '2026-10-10T10:00:00Z' })
      ).json().error,
    ).toMatch(/future/);
    expect((await post('/api/tasks/41/field', { field: 'project', value: 999 })).statusCode).toBe(
      400,
    );
    expect((await post('/api/tasks/41/field', { field: 'assignee', value: 999 })).statusCode).toBe(
      400,
    );
    expect(s.calls).toHaveLength(0);
  });

  it('tasks.task.update may only carry the five editable fields', async () => {
    const user = createRawCaller({ baseUrl: `${PORTAL}/rest/`, mode: 'userAction' });
    await expect(
      user('tasks.task.update', { auth: 't', taskId: 1, fields: { STATUS: 5 } }),
    ).rejects.toThrow(/outside the editable set/);
    await expect(user('tasks.task.update', { auth: 't', taskId: 1, fields: {} })).rejects.toThrow(
      /outside the editable set/,
    );
  });
});
