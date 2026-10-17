// Daily update (2026-10-14, SRS 23): each person's morning plan and evening wrap-up, posted to the
// Slack daily work update group by the Nural Pulse bot, naming and mentioning the person.
// Morning: their overdue and due-today tasks, which they keep, remove or add to. Evening: each
// planned task done or WIP (from Bitrix24; ticking Done completes it there with their own login),
// plus unplanned work, created in Bitrix24 as a task assigned to themselves (bitrix/methods.ts
// CREATE_FIELDS). Data only through getDataset(req), and only the person's own tasks.
import {
  dailyClock,
  dailyDay,
  dailyState,
  dailySuggestions,
  dailyUpcoming,
  isPlannable,
  type DailyState,
  slackPlan,
  slackWrap,
  wrapState,
  type DailyItem,
  type WorkCalendar,
  type WrapItem,
} from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset, Viewer } from '../auth/roles';
import { sessionUserOf } from '../auth/routes';
import type { Dataset } from '../data/dataset';
import type { Slack } from '../integrations/slack';
import { prepare, type taskWriter } from './actions';
import { contextOf, taskRow, taskUrl } from './context';

export interface DailyPlan {
  items: DailyItem[];
  note: string;
}
export interface DailyWrap {
  items: WrapItem[];
  note: string;
}

export interface DailyRow {
  userId: number;
  day: string;
  plan: DailyPlan | null;
  plannedAt: Date | null;
  wrap: DailyWrap | null;
  wrappedAt: Date | null;
  /** Where the plan was posted; the wrap-up replies in its thread. */
  slackChannel: string | null;
  slackTs: string | null;
}

export interface DailyStore {
  get(userId: number, day: string): Promise<DailyRow | null>;
  /** Insert or replace the person's row for the day. */
  save(row: DailyRow): Promise<void>;
  /** The person's latest days, newest first. */
  history(userId: number, limit: number): Promise<DailyRow[]>;
}

/** Settings admins change in the dashboard (app_settings). */
export interface SettingsStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, by: number): Promise<void>;
}

export interface DailySetting {
  /** Slack channel ID (or #name) of the daily work update group. */
  channel: string | null;
}
export const DAILY_SETTING = 'dailyUpdate';

export function memoryDailyStore(): DailyStore {
  const rows = new Map<string, DailyRow>();
  const key = (u: number, d: string) => `${u}:${d}`;
  return {
    get: async (u, d) => structuredClone(rows.get(key(u, d)) ?? null),
    async save(r) {
      rows.set(key(r.userId, r.day), structuredClone(r));
    },
    history: async (u, limit) =>
      [...rows.values()]
        .filter((r) => r.userId === u)
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, limit)
        .map((r) => structuredClone(r)),
  };
}

export function memorySettingsStore(): SettingsStore {
  const values = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => (values.has(k) ? (structuredClone(values.get(k)) as T) : null),
    async set(k, v) {
      values.set(k, structuredClone(v));
    },
  };
}

export interface DailyDeps {
  store: DailyStore;
  settings: SettingsStore;
  slack: Slack;
  writer: ReturnType<typeof taskWriter>;
  tz: string;
  calendar: WorkCalendar;
  now?: () => Date;
}

const planBody = z.object({
  taskIds: z.array(z.coerce.number().int().positive()).max(50),
  note: z.string().trim().max(1000).default(''),
});

const wrapBody = z.object({
  items: z
    .array(z.object({ taskId: z.coerce.number().int().positive(), done: z.boolean() }))
    .max(50),
  extra: z
    .array(
      z.object({
        title: z.string().trim().min(3, 'Give the work a short title.').max(200),
        groupId: z.coerce.number().int().min(0),
        done: z.boolean(),
      }),
    )
    .max(20)
    .default([]),
  note: z.string().trim().max(1000).default(''),
});

const channelBody = z.object({
  channel: z
    .string()
    .trim()
    .regex(/^#?[\w.-]{1,80}$/, 'Slack channel: an ID or #name')
    .nullable(),
});

/** "Wed 14 Oct". */
const dayLabelOf = (now: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(now);

export function dailyRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  deps: DailyDeps,
) {
  const now = () => deps.now?.() ?? new Date();
  const projectOf = (ds: Dataset) => (g: number) =>
    g ? (ds.projects.get(g)?.name ?? `Project ${g}`) : 'No project';
  const urlOf = (ds: Dataset) => (id: number) => {
    const t = ds.byId.get(id);
    return t ? taskUrl(ds, t) : `${ds.portalOrigin}/company/personal/tasks/task/view/${id}/`;
  };
  const channelOf = async () =>
    (await deps.settings.get<DailySetting>(DAILY_SETTING))?.channel ?? null;

  /** The person as the Slack post names them, with a mention when Slack knows their email. */
  async function whoOf(req: FastifyRequest, ds: Dataset, userId: number) {
    const u = ds.users.get(userId);
    const name = u?.name ?? sessionUserOf(req)?.name ?? 'Someone';
    const mention = u?.email ? await deps.slack.mention(u.email) : null;
    return { name, mention };
  }

  /** Posts (or re-posts) to the group; the reason when it could not. */
  async function post(
    row: DailyRow,
    send: (channel: string) => Promise<{ channel: string; ts: string } | void>,
  ): Promise<{ posted: boolean; reason?: string }> {
    const channel = row.slackChannel ?? (await channelOf());
    if (!deps.slack.connected) return { posted: false, reason: 'Slack is not connected yet.' };
    if (!channel) {
      return { posted: false, reason: 'No daily work update channel is set (Connections).' };
    }
    try {
      const at = await send(channel);
      if (at && !row.slackTs) {
        row.slackChannel = at.channel;
        row.slackTs = at.ts;
      }
      return { posted: true };
    } catch (e) {
      return { posted: false, reason: e instanceof Error ? e.message : 'Slack failed.' };
    }
  }

  /**
   * The ids of the last plan before today (to carry over what is still pending or WIP). The
   * latest earlier day with a plan, within the person's recent days.
   */
  async function lastPlanned(userId: number, day: string): Promise<number[]> {
    const rows = await deps.store.history(userId, 10);
    const last = rows.find((r) => r.day < day && r.plan);
    return (last?.plan?.items ?? []).map((i) => i.taskId).filter((id) => id > 0);
  }

  /**
   * Full task rows (as the task lists show them, so the dialog edits them in place), each one's
   * Daily state, and the Kanban columns of their projects.
   */
  function rowsOf(ds: Dataset, ids: Iterable<number>, at: Date) {
    const ctx = contextOf(ds, { tz: deps.tz, now: () => at });
    const rows: Record<string, ReturnType<typeof taskRow>> = {};
    const states: Record<string, DailyState> = {};
    const boards: Record<string, unknown> = {};
    for (const id of new Set(ids)) {
      const t = ds.byId.get(id);
      if (!t) continue;
      rows[id] = taskRow(ds, ctx, t);
      states[id] = dailyState(t, ds.testers);
      if (t.groupId > 0 && !boards[t.groupId]) boards[t.groupId] = ds.boards?.get(t.groupId) ?? [];
    }
    return { rows, states, boards };
  }

  const empty = (userId: number, day: string): DailyRow => ({
    userId,
    day,
    plan: null,
    plannedAt: null,
    wrap: null,
    wrappedAt: null,
    slackChannel: null,
    slackTs: null,
  });

  app.get('/api/daily/today', async (req) => {
    const v = await viewer(req);
    const ds = await getDataset(req);
    const at = now();
    const day = dailyDay(at, deps.tz);
    const row = await deps.store.get(v.userId, day);
    const ctx = { now: at, tz: deps.tz, testers: ds.testers };
    const project = projectOf(ds);
    // The evening view: the morning plan with each task's state in Bitrix24 now.
    const wrapItems: WrapItem[] = (row?.plan?.items ?? []).map((i) => ({
      taskId: i.taskId,
      title: ds.byId.get(i.taskId)?.title ?? i.title,
      project: i.project,
      state: wrapState(ds.byId.get(i.taskId), ds.testers),
    }));
    const suggestions = dailySuggestions(
      ds.tasks,
      v.userId,
      ctx,
      project,
      await lastPlanned(v.userId, day),
    );
    const upcoming = dailyUpcoming(ds.tasks, v.userId, ctx, project);
    const extra = (row?.wrap?.items ?? []).map((i) => i.taskId);
    const live = rowsOf(
      ds,
      [
        ...(row?.plan?.items ?? []).map((i) => i.taskId),
        ...suggestions.map((i) => i.taskId),
        ...upcoming.map((i) => i.taskId),
        ...extra,
      ],
      at,
    );
    const who = await deps.writer.actor(req);
    return {
      day,
      dayLabel: dayLabelOf(at, deps.tz),
      ...dailyClock(at, deps.calendar),
      plan: row?.plan ?? null,
      plannedAt: row?.plannedAt ?? null,
      wrap: row?.wrap ?? null,
      wrappedAt: row?.wrappedAt ?? null,
      posted: !!row?.slackTs,
      suggestions,
      upcoming,
      wrapItems,
      /** Each listed task as the task lists show it, its Daily state, and its board's columns. */
      ...live,
      channel: await channelOf(),
      slack: deps.slack.connected,
      /** False without a Bitrix24 sign-in token: Done and new tasks cannot reach Bitrix24. */
      canWrite: !('error' in who),
    };
  });

  // The person's own open tasks, to add one to the plan.
  app.get('/api/daily/mine', async (req) => {
    const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(req.query);
    const v = await viewer(req);
    const ds = await getDataset(req);
    const project = projectOf(ds);
    const needle = q.toLowerCase();
    return {
      tasks: ds.tasks
        .filter((t) => isPlannable(t, v.userId))
        .filter((t) => !needle || `${t.id} ${t.title}`.toLowerCase().includes(needle))
        .sort(
          (a, b) =>
            (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) ||
            b.changedAt.getTime() - a.changedAt.getTime(),
        )
        .slice(0, 30)
        .map((t) => ({
          id: t.id,
          title: t.title,
          project: project(t.groupId),
          deadline: t.deadline,
        })),
    };
  });

  // Projects for unplanned work: those the person has tasks in, most used first.
  app.get('/api/daily/projects', async (req) => {
    const v = await viewer(req);
    const ds = await getDataset(req);
    const count = new Map<number, number>();
    for (const t of ds.tasks) {
      if (t.groupId && (t.responsibleId === v.userId || t.createdBy === v.userId))
        count.set(t.groupId, (count.get(t.groupId) ?? 0) + 1);
    }
    return {
      projects: [...count]
        .filter(([g]) => ds.projects.get(g)?.active !== false)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => ({ id, name: projectOf(ds)(id) })),
    };
  });

  app.post('/api/daily/plan', async (req, reply) => {
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan.' });
    const v = await viewer(req);
    const ds = await getDataset(req);
    const at = now();
    const day = dailyDay(at, deps.tz);
    const project = projectOf(ds);
    const pctx = { now: at, tz: deps.tz, testers: ds.testers };
    const suggested = new Map(
      [
        ...dailySuggestions(ds.tasks, v.userId, pctx, project, await lastPlanned(v.userId, day)),
        ...dailyUpcoming(ds.tasks, v.userId, pctx, project, 500),
      ].map((s) => [s.taskId, s]),
    );
    const items: DailyItem[] = [];
    for (const id of [...new Set(parsed.data.taskIds)]) {
      const t = ds.byId.get(id);
      if (!t || t.responsibleId !== v.userId) {
        return reply.code(400).send({ error: `Task ${id} is not one of your tasks.` });
      }
      items.push(
        suggested.get(id) ?? {
          taskId: id,
          title: t.title,
          project: project(t.groupId),
          why: 'added',
        },
      );
    }
    const row = (await deps.store.get(v.userId, day)) ?? empty(v.userId, day);
    row.plan = { items, note: parsed.data.note };
    row.plannedAt = at;
    const msg = slackPlan(
      await whoOf(req, ds, v.userId),
      dayLabelOf(at, deps.tz),
      items,
      parsed.data.note,
      urlOf(ds),
    );
    // Posted again the same day: the earlier message is changed, not repeated.
    const result = await post(row, (channel) =>
      row.slackTs && row.slackChannel
        ? deps.slack.update(row.slackChannel, row.slackTs, msg)
        : deps.slack.toChannel(channel, msg),
    );
    await deps.store.save(row);
    return { ok: true, ...result };
  });

  app.post('/api/daily/wrap', async (req, reply) => {
    const parsed = wrapBody.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid wrap-up.' });
    const v = await viewer(req);
    const ds = await getDataset(req);
    const at = now();
    const day = dailyDay(at, deps.tz);
    const project = projectOf(ds);
    const row = (await deps.store.get(v.userId, day)) ?? empty(v.userId, day);
    const planned = new Map((row.plan?.items ?? []).map((i) => [i.taskId, i]));
    const failures: { title: string; message: string }[] = [];

    // Every task must be the person's own, or on their plan this morning.
    for (const i of parsed.data.items) {
      const t = ds.byId.get(i.taskId);
      if (!planned.has(i.taskId) && (!t || t.responsibleId !== v.userId)) {
        return reply.code(400).send({ error: `Task ${i.taskId} is not one of your tasks.` });
      }
    }
    const needsBitrix =
      parsed.data.extra.length > 0 ||
      parsed.data.items.some(
        (i) => i.done && wrapState(ds.byId.get(i.taskId), ds.testers) !== 'done',
      );
    const who = needsBitrix ? await deps.writer.actor(req) : null;
    const writeError = who && 'error' in who ? who.error : null;
    const full = await deps.writer.isFull(req);

    const items: WrapItem[] = [];
    for (const i of parsed.data.items) {
      const t = ds.byId.get(i.taskId);
      const base = {
        taskId: i.taskId,
        title: t?.title ?? planned.get(i.taskId)?.title ?? `Task ${i.taskId}`,
        project: t ? project(t.groupId) : (planned.get(i.taskId)?.project ?? ''),
      };
      let state = wrapState(t, ds.testers);
      if (i.done && state !== 'done' && t) {
        // Ticked Done: complete it in Bitrix24 as the person (the same as the status dropdown).
        const p = prepare(ds, full, t, { kind: 'status', status: 'completed' }, at);
        if (p.state === 'ok') {
          const r =
            who && !('error' in who)
              ? await deps.writer.run(who, t.id, p)
              : { ok: false as const, message: writeError ?? 'Sign in again with Bitrix24.' };
          if (r.ok) state = 'done';
          else failures.push({ title: base.title, message: r.message });
        } else if (p.state === 'skip') state = 'done';
        else failures.push({ title: base.title, message: p.reason });
      } else if (!i.done && state === 'done') state = 'wip';
      items.push({ ...base, state });
    }

    // Unplanned work: a new Bitrix24 task assigned to the person, completed if they did it.
    for (const x of parsed.data.extra) {
      const projectName = x.groupId ? project(x.groupId) : 'No project';
      if (!who || 'error' in who) {
        failures.push({ title: x.title, message: writeError ?? 'Sign in again with Bitrix24.' });
        items.push({ taskId: 0, title: x.title, project: projectName, state: 'wip', extra: true });
        continue;
      }
      const made = await deps.writer.create(who, { title: x.title, groupId: x.groupId });
      if (!made.ok) {
        failures.push({ title: x.title, message: made.message });
        items.push({ taskId: 0, title: x.title, project: projectName, state: 'wip', extra: true });
        continue;
      }
      let state: WrapItem['state'] = 'wip';
      if (x.done) {
        const r = await deps.writer.run(who, made.taskId, {
          state: 'ok',
          calls: [{ method: 'tasks.task.complete', params: { taskId: made.taskId } }],
          audit: { action: 'status', fromValue: 'pending', toValue: 'completed' },
          label: 'Completed',
        });
        if (r.ok) state = 'done';
        else failures.push({ title: x.title, message: r.message });
      }
      items.push({ taskId: made.taskId, title: x.title, project: projectName, state, extra: true });
    }

    row.wrap = { items, note: parsed.data.note };
    row.wrappedAt = at;
    const msg = slackWrap(
      await whoOf(req, ds, v.userId),
      dayLabelOf(at, deps.tz),
      items,
      parsed.data.note,
      urlOf(ds),
    );
    // In the morning post's thread (also shown in the channel), else on its own.
    const thread = row.slackTs;
    const result = await post(row, (channel) =>
      deps.slack.toChannel(row.slackChannel ?? channel, msg, thread ? { threadTs: thread } : {}),
    );
    await deps.store.save(row);
    return { ok: true, ...result, failures, items };
  });

  app.get('/api/daily/history', async (req) => {
    const v = await viewer(req);
    return { rows: await deps.store.history(v.userId, 30) };
  });

  // The daily work update channel (Integration › Connections).
  app.get('/api/integrations/daily-channel', async () => ({ channel: await channelOf() }));
  app.put('/api/integrations/daily-channel', async (req, reply) => {
    const v = await viewer(req);
    if (!v.connections)
      return reply.code(403).send({ error: 'You have no access to Connections.' });
    const parsed = channelBody.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid channel.' });
    await deps.settings.set(DAILY_SETTING, { channel: parsed.data.channel }, v.userId);
    return { ok: true, channel: parsed.data.channel };
  });
}

/** Postgres-backed stores (tables daily_updates and app_settings). */
export async function dbDailyStores(): Promise<{ store: DailyStore; settings: SettingsStore }> {
  const { db, schema } = await import('../db/client');
  const { and, desc, eq } = await import('drizzle-orm');
  const t = schema.dailyUpdates;
  const s = schema.appSettings;
  const toRow = (r: typeof t.$inferSelect): DailyRow => ({
    userId: r.userId,
    day: r.day,
    plan: (r.plan as DailyPlan | null) ?? null,
    plannedAt: r.plannedAt,
    wrap: (r.wrap as DailyWrap | null) ?? null,
    wrappedAt: r.wrappedAt,
    slackChannel: r.slackChannel,
    slackTs: r.slackTs,
  });
  return {
    store: {
      async get(userId, day) {
        const [r] = await db
          .select()
          .from(t)
          .where(and(eq(t.userId, userId), eq(t.day, day)));
        return r ? toRow(r) : null;
      },
      async save(row) {
        const values = { ...row, updatedAt: new Date() };
        await db
          .insert(t)
          .values(values)
          .onConflictDoUpdate({ target: [t.userId, t.day], set: values });
      },
      history: async (userId, limit) =>
        (
          await db.select().from(t).where(eq(t.userId, userId)).orderBy(desc(t.day)).limit(limit)
        ).map(toRow),
    },
    settings: {
      async get<T>(key: string) {
        const [r] = await db.select().from(s).where(eq(s.key, key));
        return r ? (r.value as T) : null;
      },
      async set(key, value, by) {
        const values = { key, value, updatedBy: by, updatedAt: new Date() };
        await db.insert(s).values(values).onConflictDoUpdate({ target: s.key, set: values });
      },
    },
  };
}
