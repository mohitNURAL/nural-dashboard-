import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { TokenStore } from '../auth/tokens';
import type { Params } from '../bitrix';
import type { DatasetProvider } from '../data/dataset';
import type { Slack, SlackMessage } from '../integrations/slack';
import { buildServer } from '../server';
import { memorySettingsStore } from './daily';

const SECRET = 'x'.repeat(40);
const PORTAL = 'https://portal.example';
const ist = (local: string) => new Date(`${local}+05:30`);
// Wednesday 14 Oct 2026, 10:30 IST.
const NOW = ist('2026-10-14T10:30');

const base = {
  groupId: 154,
  stage: 'To do',
  stageTitle: 'To Do',
  status: 2,
  events: [],
  responsibleId: 7,
  createdBy: 10,
  tags: [],
  changedAt: NOW,
  createdAt: ist('2026-10-01T10:00'),
  closedAt: null,
};
// Neha (7): 41 overdue, 43 due today, 44 later; 42 is Vijay's (30).
const overdue = { ...base, id: 41, title: 'Payment bug', deadline: ist('2026-10-12T18:00') };
const other = { ...base, id: 42, title: 'Not hers', responsibleId: 30, deadline: NOW };
const today = { ...base, id: 43, title: 'Login fix', deadline: ist('2026-10-14T18:00') };
const later = { ...base, id: 44, title: 'API docs', deadline: ist('2026-10-20T18:00') };
const tasks = [overdue, other, today, later];
const dataset = (async () => ({
  tasks,
  byId: new Map(tasks.map((t) => [t.id, t])),
  testers: new Set(),
  users: new Map([
    [7, { id: 7, name: 'Neha', email: 'neha@nural.test', active: true, deptGroup: 'Development' }],
    [30, { id: 30, name: 'Vijay', active: true, deptGroup: 'Development' }],
  ]),
  projects: new Map([[154, { id: 154, name: 'Moto India' }]]),
  boards: new Map(),
  portalOrigin: PORTAL,
  loadedAt: new Date(),
})) as unknown as DatasetProvider;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server(opts: { channel?: string | null; token?: boolean } = {}) {
  const calls: { method: string; params: Params }[] = [];
  const recorded: unknown[] = [];
  const posts: { channel: string; m: SlackMessage; threadTs?: string }[] = [];
  const updates: { ts: string; m: SlackMessage }[] = [];
  const slack: Slack = {
    connected: true,
    team: async () => 'Nural',
    toPerson: async () => undefined,
    toChannel: async (channel, m, o) => {
      posts.push({ channel, m, threadTs: o?.threadTs });
      return { channel: 'C1', ts: `ts${posts.length}` };
    },
    update: async (_c, ts, m) => void updates.push({ ts, m }),
    mention: async (email) => (email === 'neha@nural.test' ? '<@UNEHA>' : null),
    channels: async () => [],
  };
  const tokens: TokenStore = {
    save: async () => undefined,
    get: async () =>
      opts.token === false
        ? null
        : { accessToken: 'user-token', refreshToken: 'r', expiresAt: new Date(), scope: 'task' },
  };
  const settings = memorySettingsStore();
  if (opts.channel !== null)
    await settings.set('dailyUpdate', { channel: opts.channel ?? 'C1' }, 1);
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    now: () => NOW,
    roles: { admins: [], pms: [], teamLeads: [], productOwners: [] },
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 's',
      sessionSecret: SECRET,
      portalOrigin: PORTAL,
      secure: true,
    },
    reports: { slack },
    daily: { settings },
    actions: {
      tokens,
      userCall: async <T>(method: string, params: Params) => {
        calls.push({ method, params });
        return {
          result: (method === 'tasks.task.add' ? { task: { id: '900' } } : true) as T,
        };
      },
      enqueue: async () => undefined,
      record: async (a) => void recorded.push(a),
    },
  });
  return { calls, recorded, posts, updates };
}

const cookie = `${SESSION_COOKIE}=${sign({ userId: 7, name: 'Neha', exp: Date.now() + 60_000 }, SECRET)}`;
const get = (url: string) => app!.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, body: unknown) =>
  app!.inject({
    method: 'POST',
    url,
    payload: body as Record<string, unknown>,
    headers: { cookie },
  });

describe('daily update (SRS 23)', () => {
  it('suggests only my overdue and due-today tasks', async () => {
    await server();
    const res = await get('/api/daily/today');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.suggestions.map((s: { taskId: number }) => s.taskId)).toEqual([41, 43]);
    expect(body).toMatchObject({ day: '2026-10-14', working: true, plan: null, canWrite: true });
    const mine = (await get('/api/daily/mine?q=api')).json();
    expect(mine.tasks.map((t: { id: number }) => t.id)).toEqual([44]);
  });

  it('posts the plan with a mention, and edits the same message when posted again', async () => {
    const s = await server();
    const res = await post('/api/daily/plan', { taskIds: [41, 44], note: 'Client call at 3' });
    expect(res.json()).toMatchObject({ ok: true, posted: true });
    expect(s.posts).toHaveLength(1);
    const text = JSON.stringify(s.posts[0]!.m.blocks);
    expect(text).toContain('<@UNEHA>');
    expect(text).toContain('/workgroups/group/154/tasks/task/view/41/');
    expect(text).toContain('Client call at 3');
    await post('/api/daily/plan', { taskIds: [41], note: '' });
    expect(s.posts).toHaveLength(1);
    expect(s.updates).toEqual([expect.objectContaining({ ts: 'ts1' })]);
    const today = (await get('/api/daily/today')).json();
    expect(today.plan.items).toHaveLength(1);
  });

  it('refuses someone else’s task on the plan', async () => {
    const s = await server();
    const res = await post('/api/daily/plan', { taskIds: [42] });
    expect(res.statusCode).toBe(400);
    expect(s.posts).toHaveLength(0);
  });

  it('wraps up: completes ticked tasks, creates unplanned work for herself, replies in the thread', async () => {
    const s = await server();
    await post('/api/daily/plan', { taskIds: [41, 43] });
    const res = await post('/api/daily/wrap', {
      items: [
        { taskId: 41, done: true },
        { taskId: 43, done: false },
      ],
      extra: [{ title: 'Hotfix for checkout', groupId: 154, done: true }],
      note: '',
    });
    const body = res.json();
    expect(body).toMatchObject({ ok: true, posted: true, failures: [] });
    expect(body.items.map((i: { state: string }) => i.state)).toEqual(['done', 'wip', 'done']);
    expect(s.calls).toEqual([
      { method: 'tasks.task.complete', params: { taskId: 41 } },
      {
        method: 'tasks.task.add',
        params: { fields: { TITLE: 'Hotfix for checkout', RESPONSIBLE_ID: 7, GROUP_ID: 154 } },
      },
      { method: 'tasks.task.complete', params: { taskId: 900 } },
    ]);
    expect(s.recorded).toContainEqual(
      expect.objectContaining({ action: 'create', taskId: 900, userId: 7, ok: true }),
    );
    expect(s.posts[1]).toMatchObject({ channel: 'C1', threadTs: 'ts1' });
  });

  it('still posts the wrap-up without a Bitrix24 sign-in, listing what could not be saved', async () => {
    const s = await server({ token: false });
    const res = await post('/api/daily/wrap', {
      items: [],
      extra: [{ title: 'Helped QA', groupId: 154, done: true }],
    });
    expect(res.json()).toMatchObject({ posted: true, failures: [{ title: 'Helped QA' }] });
    expect(s.calls).toHaveLength(0);
  });

  it('saves but does not post when no channel is set', async () => {
    const s = await server({ channel: null });
    const res = await post('/api/daily/plan', { taskIds: [41] });
    expect(res.json()).toMatchObject({ ok: true, posted: false });
    expect(s.posts).toHaveLength(0);
    expect((await get('/api/daily/today')).json().plan.items).toHaveLength(1);
  });

  it('lets only Connections change the channel', async () => {
    await server();
    const res = await app!.inject({
      method: 'PUT',
      url: '/api/integrations/daily-channel',
      payload: { channel: 'C9' },
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});
