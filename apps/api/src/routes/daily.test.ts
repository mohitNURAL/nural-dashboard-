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
  priority: 1,
  parentId: null,
  relatedIds: [],
  isIssue: false,
  issueType: null,
};
// Neha (7): 41 overdue, 43 due today, 44 later; 42 is Vijay's (30).
const overdue = { ...base, id: 41, title: 'Payment bug', deadline: ist('2026-10-12T18:00') };
const other = { ...base, id: 42, title: 'Not hers', responsibleId: 30, deadline: NOW };
const today = { ...base, id: 43, title: 'Login fix', deadline: ist('2026-10-14T18:00') };
const later = { ...base, id: 44, title: 'API docs', deadline: ist('2026-10-20T18:00') };
const undated = { ...base, id: 45, title: 'Cache clean-up', deadline: null };
const tasks = [overdue, other, today, later, undated];
const dataset = (async () => ({
  tasks,
  byId: new Map(tasks.map((t) => [t.id, t])),
  testers: new Set(),
  users: new Map([
    [7, { id: 7, name: 'Neha', email: 'neha@nural.test', active: true, deptGroup: 'Development' }],
    [30, { id: 30, name: 'Vijay', active: true, deptGroup: 'Development' }],
  ]),
  projects: new Map([
    [154, { id: 154, name: 'Moto India', active: true }],
    [170, { id: 170, name: 'Nural BA', active: true }],
    [168, { id: 168, name: 'Nural Sales International', active: true }],
  ]),
  // Neha is in 168 (new, no tasks yet), not in 170.
  members: new Map([
    [168, new Set([7, 30])],
    [170, new Set([30])],
  ]),
  boards: new Map(),
  portalOrigin: PORTAL,
  loadedAt: new Date(),
})) as unknown as DatasetProvider;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server(
  opts: { channel?: string | null; token?: boolean; admins?: number[]; now?: () => Date } = {},
) {
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
    now: opts.now ?? (() => NOW),
    roles: { admins: opts.admins ?? [], pms: [], teamLeads: [], productOwners: [] },
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
  it('Add task: creates it for herself with every field, and it can go on the plan at once', async () => {
    const s = await server();
    const res = await post('/api/daily/task', {
      title: 'Write the release notes',
      description: 'For 2.4',
      groupId: 154,
      tags: ['docs'],
      priority: 'high',
      deadline: '2026-10-16',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ taskId: 900, project: 'Moto India', state: 'pending' });
    expect(s.calls[0]).toMatchObject({
      method: 'tasks.task.add',
      params: {
        fields: {
          TITLE: 'Write the release notes',
          RESPONSIBLE_ID: 7,
          GROUP_ID: 154,
          DESCRIPTION: 'For 2.4',
          TAGS: ['docs'],
          PRIORITY: '2',
          // 16 Oct, 18:30 IST.
          DEADLINE: '2026-10-16T13:00:00.000Z',
        },
      },
    });
    // Not in the data yet, still accepted on the plan.
    const plan = await post('/api/daily/plan', { taskIds: [900, 41], note: '' });
    expect(plan.statusCode).toBe(200);
    const bad = await post('/api/daily/task', { title: 'x', groupId: 154 });
    expect(bad.statusCode).toBe(400);
  });

  it('wrap-up: a task created and reported Done a moment ago stays Done', async () => {
    await server();
    const made = (
      await post('/api/daily/task', { title: 'Hotfix for login', groupId: 154, done: true })
    ).json();
    expect(made).toMatchObject({ taskId: 900, state: 'done' });
    const wrap = await post('/api/daily/wrap', { items: [{ taskId: 900, done: true }], note: '' });
    expect(wrap.statusCode).toBe(200);
    expect(wrap.json().items).toMatchObject([{ taskId: 900, state: 'done' }]);
  });
  it('lists upcoming tasks and returns each listed task as a full row with its state', async () => {
    await server();
    const body = (await get('/api/daily/today')).json();
    expect(body.upcoming.map((i: { taskId: number }) => i.taskId)).toEqual([44]);
    expect(body.rows['41']).toMatchObject({ id: 41, title: 'Payment bug' });
    expect(body.rows['44']).toBeDefined();
    expect(body.rows['42']).toBeUndefined(); // not hers
    expect(body.states).toMatchObject({ 41: 'pending', 43: 'pending', 44: 'pending' });
  });
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

  it('lists tasks with no deadline, and posting one on the plan sets its deadline to today', async () => {
    const s = await server();
    const t = (await get('/api/daily/today')).json();
    expect(t.noDeadline.map((i: { taskId: number }) => i.taskId)).toEqual([45]);
    expect(t.rows['45']).toBeTruthy();
    const res = await post('/api/daily/plan', { taskIds: [41, 45], note: '' });
    expect(res.json()).toMatchObject({ ok: true, failures: [] });
    expect(s.calls).toEqual([
      {
        method: 'tasks.task.update',
        params: { taskId: 45, fields: { DEADLINE: ist('2026-10-14T18:30').toISOString() } },
      },
    ]);
    expect(s.recorded[0]).toMatchObject({ taskId: 45, action: 'field:deadline', ok: true });
    expect(JSON.stringify(s.posts[0]!.m)).toContain('due today (deadline set)');
  });

  it('without a Bitrix24 sign-in the plan still posts, listing the deadline not set', async () => {
    const s = await server({ token: false });
    const res = await post('/api/daily/plan', { taskIds: [45], note: '' });
    expect(res.json().posted).toBe(true);
    expect(res.json().failures[0].title).toBe('Cache clean-up');
    expect(s.calls).toEqual([]);
  });

  it('adds more tasks to a posted plan in the day: message updated, a reply in its thread', async () => {
    let at = NOW;
    const s = await server({ now: () => at });
    await post('/api/daily/plan', { taskIds: [41], note: '' });
    expect((await get('/api/daily/today')).json().late).toBe(false); // 10:30, before 11:30
    at = ist('2026-10-14T14:05');
    const res = await post('/api/daily/plan/add', { taskIds: [44, 45, 41] });
    expect(res.json()).toMatchObject({ ok: true, posted: true, added: 2, failures: [] });
    // The undated one gets today's deadline, with her own login.
    expect(s.calls.map((c) => c.method)).toEqual(['tasks.task.update']);
    expect(s.updates).toEqual([expect.objectContaining({ ts: 'ts1' })]);
    expect(JSON.stringify(s.updates[0]!.m)).toContain('added 14:05');
    expect(s.posts[1]).toMatchObject({ threadTs: 'ts1' });
    expect(JSON.stringify(s.posts[1]!.m)).toContain('Added to the plan at 14:05');
    const t = (await get('/api/daily/today')).json();
    expect(t.plan.items.map((i: { taskId: number }) => i.taskId)).toEqual([41, 44, 45]);
    expect(t.plan.items[1].addedAt).toBe(at.toISOString());
    expect(t.plannedAt).toBe(NOW.toISOString()); // the first posting time stays
    // Only on a posted plan, only new tasks of her own.
    expect((await post('/api/daily/plan/add', { taskIds: [41] })).statusCode).toBe(400);
    expect((await post('/api/daily/plan/add', { taskIds: [42] })).statusCode).toBe(400);
  });

  it('a plan first posted after 11:30 is Late planned, on the page and in Slack', async () => {
    let at = ist('2026-10-14T12:10');
    const s = await server({ now: () => at });
    expect((await post('/api/daily/plan/add', { taskIds: [41] })).statusCode).toBe(400); // no plan
    await post('/api/daily/plan', { taskIds: [41], note: '' });
    expect((await get('/api/daily/today')).json()).toMatchObject({ late: true, planBy: '11:30' });
    expect(JSON.stringify(s.posts[0]!.m)).toContain('Late planned* (12:10)');
    // Changing it later does not move the time it was first posted.
    at = ist('2026-10-14T15:00');
    await post('/api/daily/plan', { taskIds: [41, 43], note: '' });
    const t = (await get('/api/daily/today')).json();
    expect(t.plannedAt).toBe(ist('2026-10-14T12:10').toISOString());
    expect(t.plan.items[1].addedAt).toBe(at.toISOString());
  });

  it('Add task projects: hers, then those she is a member of; full access every active one', async () => {
    await server();
    const names = async () =>
      (await get('/api/daily/projects')).json().projects.map((p: { name: string }) => p.name);
    // A member: projects with her tasks, then a new one she is in (never Nural BA, not hers).
    expect(await names()).toEqual(['Moto India', 'Nural Sales International']);
    await app!.close();
    await server({ admins: [7] });
    expect(await names()).toEqual(['Moto India', 'Nural BA', 'Nural Sales International']);
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
    // Not done and still in To do: Pending under the Daily update rules (2026-10-17).
    expect(body.items.map((i: { state: string }) => i.state)).toEqual(['done', 'pending', 'done']);
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

  it('resets a plan saved but not posted, so she plans again; never a posted one', async () => {
    await server({ channel: null });
    expect((await post('/api/daily/plan/reset', {})).statusCode).toBe(400); // nothing saved
    await post('/api/daily/plan', { taskIds: [41] });
    expect((await post('/api/daily/plan/reset', {})).json()).toEqual({ ok: true });
    const t = (await get('/api/daily/today')).json();
    expect(t).toMatchObject({ plan: null, posted: false, plannedAt: NOW.toISOString() });
    await app!.close();
    await server();
    await post('/api/daily/plan', { taskIds: [41] });
    expect((await post('/api/daily/plan/reset', {})).statusCode).toBe(400); // posted
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

describe('Report › Daily task update (SRS 24)', () => {
  const as = (userId: number) =>
    `${SESSION_COOKIE}=${sign({ userId, name: 'X', exp: Date.now() + 60_000 }, SECRET)}`;
  const getAs = (userId: number, url: string) =>
    app!.inject({ method: 'GET', url, headers: { cookie: as(userId) } });

  it('a member sees only their own day; full access sees everyone and who did not post', async () => {
    await server({ admins: [30] });
    expect((await post('/api/daily/plan', { taskIds: [41], note: 'Busy day' })).statusCode).toBe(
      200,
    );
    const mine = (await getAs(7, '/api/report/daily')).json();
    expect(mine.full).toBe(false);
    expect(mine.lines.map((l: { userId: number }) => l.userId)).toEqual([7]);
    expect(mine.lines[0]).toMatchObject({ planned: 1, planNote: 'Busy day' });
    expect(mine.lines[0].tasks[0]).toMatchObject({ taskId: 41, planned: true, now: 'pending' });

    const all = (await getAs(30, '/api/report/daily')).json();
    expect(all.full).toBe(true);
    expect(all.summary.expected).toBe(2);
    expect(all.summary.planned.map((p: { id: number }) => p.id)).toEqual([7]);
    expect(all.summary.notPlanned.map((p: { id: number }) => p.id)).toEqual([30]);
    const only = (await getAs(30, '/api/report/daily?assignee=30')).json();
    expect(only.lines.map((l: { userId: number }) => l.userId)).toEqual([30]);
  });
});
