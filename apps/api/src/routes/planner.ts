// Tasks in hand planner (2026-11-08, SRS 25): the endpoints each tab (KPI, Development, QA) mounts
// under its own guarded prefix, with its own scoped task list and open / overdue rules. Day plans
// come from the people's posted Daily update plans (daily_updates), only for tasks in that list.
import {
  dayKey,
  dayPlus,
  daysBetweenKeys,
  GROUP_BY,
  overdueNowList,
  periodEntries,
  planLog,
  plannerColumns,
  plannerGrid,
  plannerStart,
  defaultStart,
  PLANNER_VIEWS,
  type GroupBy,
  type MetricContext,
  type MetricTask,
  type PlanEntry,
} from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Dataset } from '../data/dataset';
import { assignee, project, taskUrl } from './context';
import { list } from './params';

/** What a tab gives the planner: its scoped tasks (filters applied) and its rules. */
export interface PlannerSource {
  ds: Dataset;
  ctx: MetricContext;
  list: readonly MetricTask[];
  open?: (t: MetricTask) => boolean;
  overdue?: (t: MetricTask) => boolean;
}

/** The posted Daily update plans in a range (DailyStore.range). */
export type DayPlanReader = (
  from: string,
  to: string,
) => Promise<
  { userId: number; day: string; plan: { items: { taskId?: number | null }[] } | null }[]
>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const gridQuery = z.object({
  view: z.enum(PLANNER_VIEWS).catch('day'),
  start: day.optional().catch(undefined),
  groupBy: z.enum(GROUP_BY).catch('assignee'),
  assignees: list(z.coerce.number().int().nonnegative()),
  projects: list(z.coerce.number().int().nonnegative()),
  q: z.string().trim().max(200).optional().catch(undefined),
});
const rowQuery = z.object({
  groupBy: z.enum(GROUP_BY).catch('assignee'),
  row: z.coerce.number().int().nonnegative(),
  assignees: list(z.coerce.number().int().nonnegative()),
  projects: list(z.coerce.number().int().nonnegative()),
  q: z.string().trim().max(200).optional().catch(undefined),
});
// pfrom / pto: from and to are the tab's date filter. No row: every row (the Excel and PDF).
const periodQuery = rowQuery.extend({
  row: z.coerce.number().int().nonnegative().optional(),
  pfrom: day,
  pto: day,
});

/** The planner's own params (view, period, row, its filters), not the tab's filters. */
const PLANNER_PARAMS = new Set([
  'view',
  'start',
  'groupBy',
  'assignees',
  'projects',
  'q',
  'row',
  'pfrom',
  'pto',
]);
/** The request's query without the planner's own params: the tab's filters only. */
export const tabQuery = (query: unknown): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries((query ?? {}) as Record<string, unknown>).filter(
      ([k]) => !PLANNER_PARAMS.has(k),
    ),
  );

const rowKeyOf = (by: GroupBy) => (t: MetricTask) =>
  by === 'project' ? t.groupId : t.responsibleId;
const projectName = (ds: Dataset, id: number) => project(ds, id)?.name ?? 'No project';
const rowName = (ds: Dataset, by: GroupBy, id: number) =>
  by === 'project' ? projectName(ds, id) : assignee(ds, id).name;

/**
 * The planner's own filters: the multi-select Assignee and Project, and the free-text search
 * (a row whose name matches keeps all its tasks; otherwise tasks matching title, person or project).
 */
function narrow(
  ds: Dataset,
  tasks: readonly MetricTask[],
  by: GroupBy,
  q: { assignees?: number[]; projects?: number[]; q?: string },
): MetricTask[] {
  const a = q.assignees && new Set(q.assignees);
  const p = q.projects && new Set(q.projects);
  const words = q.q?.toLowerCase();
  const key = rowKeyOf(by);
  return tasks.filter((t) => {
    if (a && !a.has(t.responsibleId)) return false;
    if (p && !p.has(t.groupId)) return false;
    if (!words) return true;
    if (rowName(ds, by, key(t)).toLowerCase().includes(words)) return true;
    return `${t.title} ${projectName(ds, t.groupId)} ${assignee(ds, t.responsibleId).name}`
      .toLowerCase()
      .includes(words);
  });
}

/** Task id → days it was on its assignee's posted plan, for the tasks in the list. */
async function dayPlansFor(
  read: DayPlanReader,
  tasks: readonly MetricTask[],
  from: string,
  to: string,
): Promise<Map<number, string[]>> {
  const ids = new Set(tasks.map((t) => t.id));
  const out = new Map<number, string[]>();
  if (from > to) return out;
  for (const r of await read(from, to))
    for (const item of r.plan?.items ?? []) {
      const id = Number(item.taskId);
      if (!ids.has(id)) continue;
      const days = out.get(id) ?? [];
      days.push(r.day);
      out.set(id, days);
    }
  return out;
}

/** The tasks and people the entries refer to, named once. */
function named(
  ds: Dataset,
  tz: string,
  tasks: readonly MetricTask[],
  entries: Iterable<PlanEntry>,
) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const taskInfo: Record<number, TaskInfo> = {};
  const people: Record<number, string> = {};
  for (const e of entries) {
    const t = byId.get(e.taskId);
    if (t && !taskInfo[t.id]) taskInfo[t.id] = info(ds, t, tz);
    for (const id of [e.by, e.pulledFrom?.by])
      if (id && !people[id]) people[id] = ds.users.get(id)?.name ?? `User ${id}`;
  }
  return { tasks: taskInfo, people };
}

/** The Assignee and Project picks: the people and projects of the tab's tasks, by name. */
function choices(ds: Dataset, tasks: readonly MetricTask[]) {
  const people = new Map<number, string>();
  const projects = new Map<number, string>();
  for (const t of tasks) {
    if (!people.has(t.responsibleId))
      people.set(t.responsibleId, assignee(ds, t.responsibleId).name);
    if (!projects.has(t.groupId)) projects.set(t.groupId, projectName(ds, t.groupId));
  }
  const sorted = (m: Map<number, string>) =>
    [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { assignees: sorted(people), projects: sorted(projects) };
}

export interface TaskInfo {
  id: number;
  title: string;
  projectId: number;
  project: string;
  assigneeId: number;
  assignee: string;
  deadline: Date | null;
  /** The deadline's day (IST), or null. */
  deadlineDay: string | null;
}
const info = (ds: Dataset, t: MetricTask, tz: string): TaskInfo => ({
  id: t.id,
  title: t.title,
  projectId: t.groupId,
  project: projectName(ds, t.groupId),
  assigneeId: t.responsibleId,
  assignee: assignee(ds, t.responsibleId).name,
  deadline: t.deadline,
  deadlineDay: t.deadline ? dayKey(t.deadline, tz) : null,
});

/**
 * Mounts the planner under `base` (e.g. /api/dev/inhand/calendar): the grid, a row's overdue-now
 * list, a row's period (a week or month cell) and a task's plan log.
 */
export function plannerRoutes(
  app: FastifyInstance,
  base: string,
  source: (req: FastifyRequest) => Promise<PlannerSource>,
  readPlans: DayPlanReader,
) {
  /** Plans are read from a month before the window, so earlier day plans still clear later days. */
  const plansFrom = (from: string) => dayPlus(from, -31);

  app.get(base, async (req) => {
    const q = gridQuery.parse(req.query ?? {});
    const src = await source(req);
    const { ds, ctx } = src;
    const today = dayKey(ctx.now, ctx.tz);
    const start = plannerStart(q.view, q.start ?? defaultStart(q.view, today));
    const columns = plannerColumns(q.view, start);
    const tasks = narrow(ds, src.list, q.groupBy, q);
    const last = columns[columns.length - 1]!.to;
    const dayPlans = await dayPlansFor(
      readPlans,
      tasks,
      plansFrom(columns[0]!.from),
      last < today ? last : today,
    );
    const grid = plannerGrid(tasks, ctx, {
      view: q.view,
      start,
      by: q.groupBy,
      dayPlans,
      open: src.open,
      overdue: src.overdue,
    });
    const other = (id: number) =>
      q.groupBy === 'project' ? assignee(ds, id).name : projectName(ds, id);
    const entries = grid.rows.flatMap((r) =>
      Object.values(r.cells).flatMap((c) => ('entries' in c ? c.entries : [])),
    );
    return {
      ...grid,
      rows: grid.rows.map((r) => ({
        ...r,
        name: rowName(ds, q.groupBy, r.id),
        cells: Object.fromEntries(
          Object.entries(r.cells).map(([k, c]) => [
            k,
            'groups' in c
              ? { ...c, groups: c.groups.map((g) => ({ ...g, name: other(g.id) })) }
              : c,
          ]),
        ),
      })),
      ...named(ds, ctx.tz, tasks, entries),
      choices: choices(ds, src.list),
    };
  });

  // "M overdue now" on a row: oldest deadline first.
  app.get(`${base}/overdue`, async (req) => {
    const q = rowQuery.parse(req.query ?? {});
    const src = await source(req);
    const key = rowKeyOf(q.groupBy);
    const tasks = narrow(src.ds, src.list, q.groupBy, q).filter((t) => key(t) === q.row);
    const open = src.open ?? (() => true);
    const items = overdueNowList(tasks.filter(open), src.ctx, src.overdue).map((o) => ({
      ...info(src.ds, o.t, src.ctx.tz),
      deadlineDay: o.deadline,
      daysOverdue: o.daysOverdue,
      missed: o.missed,
    }));
    // Named only when the row has tasks in view: a row id alone never reveals a name.
    return { row: q.row, name: tasks.length ? rowName(src.ds, q.groupBy, q.row) : null, items };
  });

  // A week or month cell: the row's entries in the period, by day.
  app.get(`${base}/period`, async (req, reply) => {
    const q = periodQuery.parse(req.query ?? {});
    if (q.pfrom > q.pto) return reply.code(400).send({ error: 'pfrom is after pto.' });
    if (daysBetweenKeys(q.pfrom, q.pto) > 200)
      return reply.code(400).send({ error: 'At most 200 days at a time.' });
    const src = await source(req);
    const today = dayKey(src.ctx.now, src.ctx.tz);
    const key = rowKeyOf(q.groupBy);
    const tasks = narrow(src.ds, src.list, q.groupBy, q).filter(
      (t) => q.row === undefined || key(t) === q.row,
    );
    const dayPlans = await dayPlansFor(
      readPlans,
      tasks,
      plansFrom(q.pfrom),
      q.pto < today ? q.pto : today,
    );
    const days = periodEntries(tasks, src.ctx, q.pfrom, q.pto, dayPlans);
    return {
      row: q.row ?? null,
      name: tasks.length && q.row !== undefined ? rowName(src.ds, q.groupBy, q.row) : null,
      today,
      days,
      ...named(
        src.ds,
        src.ctx.tz,
        tasks,
        days.flatMap((d) => d.entries),
      ),
    };
  });

  // The task's plan log (the planner's task panel). Only a task in the tab's scoped list.
  app.get<{ Params: { id: string } }>(`${base}/task/:id`, async (req, reply) => {
    const id = Number(req.params.id);
    const src = await source(req);
    const t = src.list.find((x) => x.id === id);
    if (!t) return reply.code(404).send({ error: 'Task not found.' });
    const today = dayKey(src.ctx.now, src.ctx.tz);
    const plans = await dayPlansFor(readPlans, [t], dayKey(t.createdAt, src.ctx.tz), today);
    const log = planLog(t, src.ctx, plans.get(t.id) ?? []);
    const people: Record<number, string> = {};
    for (const i of log.log)
      if ((i.type === 'change' || i.type === 'created') && i.by && !people[i.by])
        people[i.by] = src.ds.users.get(i.by)?.name ?? `User ${i.by}`;
    return {
      task: { ...info(src.ds, t, src.ctx.tz), url: taskUrl(src.ds, t) },
      today,
      ...log,
      people,
    };
  });
}
