// Report › Daily task update (2026-10-17, SRS 24): what each person planned and what they actually
// did, day by day, with each task's fields now and its Kanban stage moves that day; who has and
// has not planned and wrapped up. Scope (NFR-4): a person with full data scope (admins, PM, team
// leads) sees everyone expected to post; anyone else only their own days. Data only through
// getDataset(req) (a member's scoped dataset holds only their own tasks).
import {
  dailyCompliance,
  dailyState,
  dayKey,
  isWorkingDay,
  type DailyState,
  type WorkCalendar,
} from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset, Viewer } from '../auth/roles';
import type { Dataset } from '../data/dataset';
import type { DailyRow, DailyStore } from './daily';

export interface DailyReportDeps {
  store: DailyStore;
  calendar: WorkCalendar;
  tz: string;
  /** Everyone expected to post (active, Daily update right on, not a placeholder). */
  expected: (ds: Dataset) => number[];
  now?: () => Date;
}

const DAY_MS = 86_400_000;
const dayParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const ids = z.preprocess(
  (v) =>
    v === undefined || v === ''
      ? undefined
      : String(Array.isArray(v) ? v.join(',') : v)
          .split(',')
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
  z.array(z.number()).max(500).optional(),
);
const query = z.object({
  from: dayParam,
  to: dayParam,
  assignee: ids,
  dept: z.enum(['all', 'dev', 'qa', 'support', 'ba', 'other']).default('all'),
});

/** A task in a person's day, view only: what was planned, what was reported, what it is now. */
export interface ReportTask {
  taskId: number;
  title: string;
  project: string;
  /** On the morning plan (and why), or added in the evening. */
  planned: boolean;
  why: string | null;
  /** As reported in the wrap-up, if wrapped up. */
  reported: DailyState | null;
  /** Its Daily state now. */
  now: DailyState | null;
  stage: string | null;
  status: string | null;
  priority: string | null;
  tags: string[];
  deadline: string | null;
  /** Kanban moves that day: from → to and when. */
  moves: { from: string | null; to: string | null; at: string }[];
}

const STATUS = [
  '',
  'New',
  'Pending',
  'In progress',
  'Supposedly completed',
  'Completed',
  'Deferred',
  'Declined',
];
const PRIORITY = ['Low', 'Normal', 'High'];

export function dailyReportRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  deps: DailyReportDeps,
) {
  const now = () => deps.now?.() ?? new Date();

  /** Working days from `from` to `to` (inclusive, YYYY-MM-DD). */
  function workingDays(from: string, to: string): string[] {
    const out: string[] = [];
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
      if (isWorkingDay(Math.floor(t / DAY_MS), deps.calendar))
        out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
  }

  function tasksOf(ds: Dataset, row: DailyRow): ReportTask[] {
    const planned = new Map((row.plan?.items ?? []).map((i) => [i.taskId, i]));
    const reported = new Map((row.wrap?.items ?? []).map((i) => [i.taskId, i]));
    const all = [...new Set([...planned.keys(), ...reported.keys()])];
    return all.map((id) => {
      const p = planned.get(id);
      const r = reported.get(id);
      const t = id > 0 ? ds.byId.get(id) : undefined;
      return {
        taskId: id,
        title: t?.title ?? p?.title ?? r?.title ?? `Task ${id}`,
        project: p?.project ?? r?.project ?? '',
        planned: !!p,
        why: p?.why ?? null,
        reported: (r?.state as DailyState | undefined) ?? null,
        now: t ? dailyState(t, ds.testers) : null,
        stage: t?.stageTitle ?? t?.stage ?? null,
        status: t ? (STATUS[t.status] ?? null) : null,
        priority: t ? (PRIORITY[t.priority] ?? null) : null,
        tags: t?.tags ?? [],
        deadline: t?.deadline?.toISOString() ?? null,
        moves: (t?.events ?? [])
          .filter((e) => dayKey(e.at, deps.tz) === row.day)
          .map((e) => ({ from: e.from, to: e.to, at: e.at.toISOString() })),
      };
    });
  }

  app.get('/api/report/daily', async (req, reply) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid filters.' });
    const q = parsed.data;
    const v = await viewer(req);
    const ds = await getDataset(req);
    const today = dayKey(now(), deps.tz);
    const to = q.to ?? today;
    const from = q.from ?? to;
    if (from > to) return reply.code(400).send({ error: 'From is after To.' });
    if (Date.parse(to) - Date.parse(from) > 62 * DAY_MS)
      return reply.code(400).send({ error: 'Pick at most two months.' });

    // Who is in the report: everyone expected (full data scope) or only the person.
    let people = v.full ? deps.expected(ds) : [v.userId];
    const rows = (await deps.store.range(from, to)).filter((r) =>
      v.full ? true : r.userId === v.userId,
    );
    if (v.full) people = [...new Set([...people, ...rows.map((r) => r.userId)])];
    if (q.assignee?.length) people = people.filter((id) => q.assignee!.includes(id));
    if (q.dept !== 'all')
      people = people.filter((id) => (ds.kpiDept?.get(id) ?? 'other') === q.dept);
    const inView = new Set(people);
    const byKey = new Map(
      rows.filter((r) => inView.has(r.userId)).map((r) => [`${r.userId}:${r.day}`, r]),
    );
    const days = workingDays(from, to);
    const name = (id: number) => ds.users.get(id)?.name ?? `User ${id}`;

    const lines = days.flatMap((day) =>
      people.map((userId) => {
        const r = byKey.get(`${userId}:${day}`);
        const tasks = r ? tasksOf(ds, r) : [];
        const count = (s: DailyState) => tasks.filter((t) => (t.reported ?? t.now) === s).length;
        return {
          userId,
          name: name(userId),
          dept: ds.kpiDept?.get(userId) ?? 'other',
          day,
          plannedAt: r?.plannedAt ?? null,
          wrappedAt: r?.wrappedAt ?? null,
          planned: tasks.filter((t) => t.planned).length,
          added: tasks.filter((t) => !t.planned).length,
          done: count('done'),
          wip: count('wip'),
          pending: count('pending'),
          hold: count('hold'),
          planNote: r?.plan?.note ?? '',
          wrapNote: r?.wrap?.note ?? '',
          tasks,
        };
      }),
    );
    // The tiles: the last working day in the range.
    const last = days[days.length - 1] ?? to;
    const c = dailyCompliance(
      people,
      people.map((userId) => {
        const r = byKey.get(`${userId}:${last}`);
        return { userId, plannedAt: r?.plannedAt ?? null, wrappedAt: r?.wrappedAt ?? null };
      }),
    );
    const named = (list: number[]) => list.map((id) => ({ id, name: name(id) }));
    return {
      from,
      to,
      days,
      day: last,
      full: v.full,
      summary: {
        expected: c.expected.length,
        planned: named(c.planned),
        notPlanned: named(c.notPlanned),
        wrapped: named(c.wrapped),
        notWrapped: named(c.notWrapped),
      },
      people: named(people).sort((a, b) => a.name.localeCompare(b.name)),
      lines,
    };
  });
}
