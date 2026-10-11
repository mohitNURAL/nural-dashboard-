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
const task = { id: 41, groupId: 154, stage: 'To do', stageTitle: 'To Do', status: 2, events: [] };
const dataset = (async () => ({
  tasks: [task],
  byId: new Map([[41, task]]),
  testers: new Set(),
  users: new Map([[7, { id: 7, name: 'Neha', active: true }]]),
  projects: new Map(),
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

async function server(opts: { scope?: string; fail?: BitrixError; token?: boolean } = {}) {
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

  it('changes the status with Bitrix24’s own actions', async () => {
    const s = await server();
    expect((await post('/api/tasks/41/status', { status: 'completed' })).statusCode).toBe(200);
    expect(s.calls.map((c) => [c.method, c.params])).toEqual([
      ['tasks.task.complete', { taskId: 41 }],
    ]);
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
    const s = await server({ scope: 'user' });
    const res = await post('/api/tasks/41/status', { status: 'completed' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/Tasks permission/);
    expect(s.calls).toHaveLength(0);
  });

  it('reports a Bitrix24 refusal and records it', async () => {
    const s = await server({
      fail: new BitrixError('tasks.task.complete', 'ACCESS_DENIED', 'Access denied', false),
    });
    const res = await post('/api/tasks/41/status', { status: 'completed' });
    expect(res.statusCode).toBe(403);
    expect(s.recorded[0]).toMatchObject({ ok: false, error: 'Bitrix24 refused: Access denied' });
  });

  it('keeps the webhook read-only and task actions to their allowlist', async () => {
    const webhook = createRawCaller({ baseUrl: 'https://portal.example/rest/1/x/' });
    await expect(webhook('task.stages.movetask', {})).rejects.toThrow(/read-only/);
    const user = createRawCaller({ baseUrl: `${PORTAL}/rest/`, mode: 'userAction' });
    await expect(user('tasks.task.delete', { auth: 't' })).rejects.toThrow(/not an allowed/);
    await expect(user('tasks.task.complete', {})).rejects.toThrow(/user token/);
  });
});
