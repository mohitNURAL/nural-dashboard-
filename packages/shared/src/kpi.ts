// KPI tab (SRS section 13), counts first: open and overdue work, delivery and on-time %,
// project health, workload, activity and silent projects, for every task in every workgroup.
// Hours, efficiency and scores wait for real effort data (section 12 stage clocks).
import { addWorkingHours, dayHours, workingHours, type WorkCalendar } from './calendar';
import { groupBy, pct } from './metrics';
import { isReworkMove } from './stages';
import { dayKey, daysBetween } from './time';
import type { MetricTask } from './types';

export type Dept = 'dev' | 'qa' | 'support' | 'other';
export const DEPTS: readonly Dept[] = ['dev', 'qa', 'support', 'other'];
export type Period = 'day' | 'week' | 'month';

export interface KpiContext {
  now: Date;
  tz: string;
  cal: WorkCalendar;
  /** Department of a user (the task's assignee decides the task's department). */
  deptOf: (userId: number) => Dept;
  /** Comment events (task ID, time); the last 15 days are enough. */
  comments?: readonly { taskId: number; at: Date }[];
}

/** SRS 13 constants. */
export const KPI = {
  /** Workload window: due within this many working days. */
  soonWorkingDays: 10,
  /** Bulk close: this many tasks of one project closed the same day. */
  bulkCloseMin: 30,
  /** Silent: open tasks and no action for this many working days. */
  silentWorkingDays: 10,
  /** Active project: an action within this many calendar days. */
  activeDays: 30,
  hotDays: 7,
  sparkDays: 14,
  sparkPeriods: 8,
} as const;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- per task (SRS 13.2)

export interface KpiTask {
  t: MetricTask;
  dept: Dept;
  /** First move into QA Backlog, else the Bitrix24 closed date ("closed" on this tab). */
  actualEnd: Date | null;
  /** Actual end came from the closed date (not QA Backlog). */
  endFromClose: boolean;
  open: boolean;
  overdue: boolean;
  /** Calendar days past the deadline (open, overdue tasks). */
  daysOverdue: number;
  /** Closed tasks with a deadline: closed on or before it. */
  onTime: boolean | null;
  reworkCycles: number;
}

export function kpiTask(t: MetricTask, ctx: KpiContext): KpiTask {
  const qaBacklog = t.events.find((e) => e.to === 'QA Backlog')?.at ?? null;
  const actualEnd = qaBacklog ?? t.closedAt ?? null;
  const open = actualEnd === null;
  const overdue = open && !!t.deadline && t.deadline < ctx.now;
  return {
    t,
    dept: ctx.deptOf(t.responsibleId),
    actualEnd,
    endFromClose: !open && !qaBacklog,
    open,
    overdue,
    daysOverdue: overdue ? Math.max(0, daysBetween(t.deadline!, ctx.now, ctx.tz)) : 0,
    onTime: !open && t.deadline ? actualEnd! <= t.deadline : null,
    reworkCycles: t.events.filter((e) => isReworkMove(e.from, e.to)).length,
  };
}

/**
 * Tasks closed in bulk: 30 or more tasks of one project closed (Bitrix24 closed date) the same
 * day. That is a clean-up, not delivery, so they stay out of closed counts and on-time %.
 */
export function bulkClosedIds(list: readonly KpiTask[], tz: string): Set<number> {
  const byDay = new Map<string, number[]>();
  for (const k of list) {
    if (!k.endFromClose || !k.t.groupId) continue;
    const key = `${k.t.groupId}|${dayKey(k.actualEnd!, tz)}`;
    byDay.set(key, [...(byDay.get(key) ?? []), k.t.id]);
  }
  const out = new Set<number>();
  for (const ids of byDay.values()) {
    if (ids.length >= KPI.bulkCloseMin) ids.forEach((id) => out.add(id));
  }
  return out;
}

// ---------------------------------------------------------------- periods

/** Start and end (exclusive) of the period `back` periods before the current one (IST). */
export function periodBounds(now: Date, period: Period, cal: WorkCalendar, back = 0) {
  const off = cal.offsetMin * 60_000;
  const local = new Date(now.getTime() + off);
  let start: number;
  let end: number;
  if (period === 'month') {
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth() - back;
    start = Date.UTC(y, m, 1);
    end = Date.UTC(y, m + 1, 1);
  } else {
    const today = Math.floor(local.getTime() / DAY_MS) * DAY_MS;
    if (period === 'day') {
      start = today - back * DAY_MS;
      end = start + DAY_MS;
    } else {
      const isoDow = ((local.getUTCDay() + 6) % 7) + 1;
      start = today - (isoDow - 1) * DAY_MS - back * 7 * DAY_MS;
      end = start + 7 * DAY_MS;
    }
  }
  return { start: new Date(start - off), end: new Date(end - off) };
}

type Range = { start: Date; end: Date };
const inRange = (d: Date | null, r: Range) => !!d && d >= r.start && d < r.end;

// ---------------------------------------------------------------- rates

export interface Rates {
  /** Closed in the period (bulk clean-ups left out). */
  closed: number;
  /** Of those, with a deadline. */
  withDeadline: number;
  onTime: number;
  /** Rounded %, null when nothing closed with a deadline. */
  onTimePct: number | null;
  open: number;
  overdue: number;
  overduePct: number;
  /** Send-backs on the tasks closed in the period. */
  reworkCycles: number;
}

export function rates(list: readonly KpiTask[], range: Range, bulk: Set<number>): Rates {
  const closed = list.filter((k) => inRange(k.actualEnd, range) && !bulk.has(k.t.id));
  const withDeadline = closed.filter((k) => k.onTime !== null);
  const onTime = withDeadline.filter((k) => k.onTime).length;
  const open = list.filter((k) => k.open);
  const overdue = open.filter((k) => k.overdue).length;
  return {
    closed: closed.length,
    withDeadline: withDeadline.length,
    onTime,
    onTimePct: withDeadline.length ? Math.round((onTime / withDeadline.length) * 100) : null,
    open: open.length,
    overdue,
    overduePct: pct(overdue, open.length),
    reworkCycles: closed.reduce((a, k) => a + k.reworkCycles, 0),
  };
}

// ---------------------------------------------------------------- scope

export interface KpiScope {
  /** Every task in scope (filters and department applied). */
  all: KpiTask[];
  /** Tasks in a workgroup (project and workload figures). */
  inProjects: KpiTask[];
  /** Tasks outside any workgroup (callout only). */
  noProject: KpiTask[];
  bulk: Set<number>;
}

export function kpiScope(
  tasks: readonly MetricTask[],
  ctx: KpiContext,
  dept: Dept | 'all' = 'all',
): KpiScope {
  const all = tasks.map((t) => kpiTask(t, ctx)).filter((k) => dept === 'all' || k.dept === dept);
  return {
    all,
    inProjects: all.filter((k) => k.t.groupId > 0),
    noProject: all.filter((k) => k.t.groupId <= 0),
    bulk: bulkClosedIds(all, ctx.tz),
  };
}

const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Last comment per task. */
function lastComments(ctx: KpiContext): Map<number, Date> {
  const out = new Map<number, Date>();
  for (const c of ctx.comments ?? []) {
    const prev = out.get(c.taskId);
    if (!prev || c.at > prev) out.set(c.taskId, c.at);
  }
  return out;
}

const idleDays = (from: Date, ctx: KpiContext) =>
  workingHours(from, ctx.now, ctx.cal) / dayHours(ctx.cal);

// ---------------------------------------------------------------- project health (KPI-02)

export type Health = 'red' | 'amber' | 'green';

/**
 * Red: over a quarter of open tasks overdue (at least 3 tasks), or an overdue task more than
 * 30 days late. Amber: any overdue task, or silent (no action for 10+ working days). Green:
 * neither.
 */
export function projectStatus(p: {
  open: number;
  overdue: number;
  oldestOverdueDays: number;
  silent: boolean;
}): Health {
  if ((p.overdue >= 3 && p.overdue / Math.max(p.open, 1) > 0.25) || p.oldestOverdueDays > 30) {
    return 'red';
  }
  if (p.overdue > 0 || p.silent) return 'amber';
  return 'green';
}

export interface ProjectRow {
  id: number;
  ownerId: number | null;
  total: number;
  open: number;
  overdue: number;
  oldestOverdueDays: number;
  noDeadline: number;
  /** Closed tasks / all tasks. */
  completionPct: number;
  rates: Rates;
  lastAction: string | null;
  /** Working days since the last action (task change or comment). */
  idleWorkingDays: number | null;
  silent: boolean;
  status: Health;
}

const healthRank = (h: Health) => (h === 'red' ? 0 : h === 'amber' ? 1 : 2);

export function projectHealth(
  scope: KpiScope,
  ctx: KpiContext,
  period: Period,
  ownerOf: (groupId: number) => number | null,
): ProjectRow[] {
  const range = periodBounds(ctx.now, period, ctx.cal);
  const comments = lastComments(ctx);
  const byGroup = new Map<number, KpiTask[]>();
  for (const k of scope.inProjects) {
    const list = byGroup.get(k.t.groupId) ?? [];
    list.push(k);
    byGroup.set(k.t.groupId, list);
  }
  return [...byGroup]
    .map(([id, list]): ProjectRow => {
      const r = rates(list, range, scope.bulk);
      let lastAction: Date | null = null;
      for (const k of list) {
        lastAction = later(lastAction, later(k.t.changedAt, comments.get(k.t.id) ?? null));
      }
      const idle = lastAction ? idleDays(lastAction, ctx) : null;
      const silent = r.open > 0 && idle !== null && idle >= KPI.silentWorkingDays;
      const oldestOverdueDays = Math.max(0, ...list.map((k) => k.daysOverdue));
      const closed = list.filter((k) => !k.open).length;
      return {
        id,
        ownerId: ownerOf(id),
        total: list.length,
        open: r.open,
        overdue: r.overdue,
        oldestOverdueDays,
        noDeadline: list.filter((k) => k.open && !k.t.deadline).length,
        completionPct: pct(closed, list.length),
        rates: r,
        lastAction: lastAction?.toISOString() ?? null,
        idleWorkingDays: idle === null ? null : Math.round(idle * 10) / 10,
        silent,
        status: projectStatus({ open: r.open, overdue: r.overdue, oldestOverdueDays, silent }),
      };
    })
    .sort(
      (a, b) =>
        healthRank(a.status) - healthRank(b.status) || b.overdue - a.overdue || b.open - a.open,
    );
}

// ---------------------------------------------------------------- people (KPI-04, KPI-05)

export interface PersonRow {
  id: number;
  dept: Dept;
  rates: Rates;
  /** Closed in the previous period (for the arrow). */
  closedPrev: number;
  /** Closed per period, oldest first (8 periods). */
  spark: number[];
}

export function peoplePerformance(scope: KpiScope, ctx: KpiContext, period: Period): PersonRow[] {
  const ranges = Array.from({ length: KPI.sparkPeriods }, (_, i) =>
    periodBounds(ctx.now, period, ctx.cal, KPI.sparkPeriods - 1 - i),
  );
  const current = ranges[ranges.length - 1]!;
  const previous = ranges[ranges.length - 2]!;
  const byPerson = new Map<number, KpiTask[]>();
  for (const k of scope.all) {
    const list = byPerson.get(k.t.responsibleId) ?? [];
    list.push(k);
    byPerson.set(k.t.responsibleId, list);
  }
  return [...byPerson]
    .map(([id, mine]) => {
      const counted = mine.filter((k) => !scope.bulk.has(k.t.id));
      return {
        id,
        dept: ctx.deptOf(id),
        rates: rates(mine, current, scope.bulk),
        closedPrev: counted.filter((k) => inRange(k.actualEnd, previous)).length,
        spark: ranges.map((p) => counted.filter((k) => inRange(k.actualEnd, p)).length),
      };
    })
    .filter((r) => r.rates.open > 0 || r.spark.some((n) => n > 0))
    .sort((a, b) => b.rates.closed - a.rates.closed || b.rates.open - a.rates.open || a.id - b.id);
}

export interface WorkloadRow {
  id: number;
  open: number;
  /** Open, past deadline. */
  overdue: number;
  /** Open, due within the next 10 working days. */
  dueSoon: number;
  /** Open, due later. */
  later: number;
  noDeadline: number;
  projects: number;
}

/** Open work per person in task counts (project tasks only). */
export function workload(scope: KpiScope, ctx: KpiContext): WorkloadRow[] {
  const soon = addWorkingHours(ctx.now, KPI.soonWorkingDays * dayHours(ctx.cal), ctx.cal);
  const byPerson = new Map<number, KpiTask[]>();
  for (const k of scope.inProjects) {
    if (!k.open) continue;
    const list = byPerson.get(k.t.responsibleId) ?? [];
    list.push(k);
    byPerson.set(k.t.responsibleId, list);
  }
  return [...byPerson]
    .map(([id, mine]) => {
      const due = mine.filter((k) => !k.overdue && k.t.deadline);
      return {
        id,
        open: mine.length,
        overdue: mine.filter((k) => k.overdue).length,
        dueSoon: due.filter((k) => k.t.deadline! <= soon).length,
        later: due.filter((k) => k.t.deadline! > soon).length,
        noDeadline: mine.filter((k) => !k.t.deadline).length,
        projects: new Set(mine.map((k) => k.t.groupId)).size,
      };
    })
    .sort((a, b) => b.open - a.open || a.id - b.id);
}

// ---------------------------------------------------------------- overdue (KPI-06)

export const OVERDUE_BUCKETS = ['1-2', '3-7', '8-30', '30+'] as const;
export type OverdueBucket = (typeof OVERDUE_BUCKETS)[number];

/** Days past deadline → chip. A deadline earlier today counts as 1 to 2. */
export const overdueBucket = (days: number): OverdueBucket =>
  days <= 2 ? '1-2' : days <= 7 ? '3-7' : days <= 30 ? '8-30' : '30+';

const zeroBuckets = (): Record<OverdueBucket, number> => ({
  '1-2': 0,
  '3-7': 0,
  '8-30': 0,
  '30+': 0,
});

export interface OverdueGroup {
  id: number;
  total: number;
  buckets: Record<OverdueBucket, number>;
}

function overdueGroups(list: readonly KpiTask[], key: (k: KpiTask) => number): OverdueGroup[] {
  const map = new Map<number, OverdueGroup>();
  for (const k of list) {
    const id = key(k);
    const g = map.get(id) ?? { id, total: 0, buckets: zeroBuckets() };
    g.total += 1;
    g.buckets[overdueBucket(k.daysOverdue)] += 1;
    map.set(id, g);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.id - b.id);
}

export function overdueBreakdown(scope: KpiScope) {
  const overdue = scope.all.filter((k) => k.overdue);
  const buckets = zeroBuckets();
  for (const k of overdue) buckets[overdueBucket(k.daysOverdue)] += 1;
  return {
    total: overdue.length,
    buckets,
    byProject: overdueGroups(
      overdue.filter((k) => k.t.groupId > 0),
      (k) => k.t.groupId,
    ),
    byAssignee: overdueGroups(overdue, (k) => k.t.responsibleId),
  };
}

// ---------------------------------------------------------------- activity (KPI-07)

export interface ActivityParts {
  newTasks: number;
  bugs: number;
  moves: number;
  comments: number;
}

/** Ranking weight: new tasks × 2 + bugs raised × 3 + stage moves + comments (SRS 13.3). */
export const heatOf = (p: ActivityParts) => p.newTasks * 2 + p.bugs * 3 + p.moves + p.comments;

export interface HotProject {
  id: number;
  /** Last 7 days, in counts. */
  parts: ActivityParts;
  /** Daily actions (new tasks + moves + comments), oldest first (14 days). */
  spark: number[];
}

/** The 5 busiest projects of the last 7 days, ranked by heat, shown in counts. */
export function hotProjects(scope: KpiScope, ctx: KpiContext, limit = 5): HotProject[] {
  const days = Array.from({ length: KPI.sparkDays }, (_, i) =>
    dayKey(new Date(ctx.now.getTime() - (KPI.sparkDays - 1 - i) * DAY_MS), ctx.tz),
  );
  const index = new Map(days.map((d, i) => [d, i]));
  const recent = new Set(days.slice(-KPI.hotDays));
  const groupOf = new Map(scope.inProjects.map((k) => [k.t.id, k.t.groupId]));
  const acc = new Map<number, { parts: ActivityParts; spark: number[] }>();
  const add = (gid: number, at: Date, part: keyof ActivityParts) => {
    const day = dayKey(at, ctx.tz);
    const i = index.get(day);
    if (i === undefined) return;
    const a = acc.get(gid) ?? {
      parts: { newTasks: 0, bugs: 0, moves: 0, comments: 0 },
      spark: days.map(() => 0),
    };
    if (recent.has(day)) a.parts[part] += 1;
    if (part !== 'bugs') a.spark[i]! += 1;
    acc.set(gid, a);
  };
  const since = new Date(ctx.now.getTime() - KPI.sparkDays * DAY_MS);
  // Bulk clean-ups are not activity: 30+ identical moves (same person, project, day, from and
  // to stage) are left out, with the automatic comments Bitrix24 adds to those tasks that day.
  const moveKey = (gid: number, day: string, e: MetricTask['events'][number]) =>
    `${gid}|${day}|${e.by ?? 0}|${e.from ?? ''}>${e.to ?? ''}`;
  const moveCount = new Map<string, number>();
  for (const k of scope.inProjects) {
    for (const e of k.t.events) {
      if (e.at < since) continue;
      const key = moveKey(k.t.groupId, dayKey(e.at, ctx.tz), e);
      moveCount.set(key, (moveCount.get(key) ?? 0) + 1);
    }
  }
  const bulkTaskDays = new Set<string>();
  for (const k of scope.inProjects) {
    if (k.t.createdAt >= since) {
      add(k.t.groupId, k.t.createdAt, 'newTasks');
      if (k.t.issueType === 'bug') add(k.t.groupId, k.t.createdAt, 'bugs');
    }
    for (const e of k.t.events) {
      if (e.at < since) continue;
      const day = dayKey(e.at, ctx.tz);
      if ((moveCount.get(moveKey(k.t.groupId, day, e)) ?? 0) >= KPI.bulkCloseMin) {
        bulkTaskDays.add(`${k.t.id}|${day}`);
      } else add(k.t.groupId, e.at, 'moves');
    }
  }
  for (const c of ctx.comments ?? []) {
    const gid = groupOf.get(c.taskId);
    if (!gid || c.at < since || bulkTaskDays.has(`${c.taskId}|${dayKey(c.at, ctx.tz)}`)) continue;
    add(gid, c.at, 'comments');
  }
  return [...acc]
    .map(([id, a]) => ({ id, ...a }))
    .filter((p) => heatOf(p.parts) > 0)
    .sort((a, b) => heatOf(b.parts) - heatOf(a.parts) || a.id - b.id)
    .slice(0, limit);
}

// ---------------------------------------------------------------- summary (KPI-01)

export function kpiSummary(
  scope: KpiScope,
  ctx: KpiContext,
  period: Period,
  projects: readonly ProjectRow[],
) {
  const cur = periodBounds(ctx.now, period, ctx.cal);
  const prev = periodBounds(ctx.now, period, ctx.cal, 1);
  const now = rates(scope.all, cur, scope.bulk);
  const before = rates(scope.all, prev, scope.bulk);
  const activeCut = new Date(ctx.now.getTime() - KPI.activeDays * DAY_MS);
  const openByDept = Object.fromEntries(DEPTS.map((d) => [d, 0])) as Record<Dept, number>;
  for (const k of scope.all) if (k.open) openByDept[k.dept] += 1;
  return {
    period,
    range: { start: cur.start.toISOString(), end: cur.end.toISOString() },
    open: now.open,
    openByDept,
    overdue: now.overdue,
    overduePct: now.overduePct,
    overdueOver30: scope.all.filter((k) => k.overdue && k.daysOverdue > 30).length,
    closed: now.closed,
    closedPrev: before.closed,
    onTimePct: now.onTimePct,
    onTimePrevPct: before.onTimePct,
    activeProjects: projects.filter(
      (p) => p.open > 0 && p.lastAction && new Date(p.lastAction) >= activeCut,
    ).length,
    silentProjects: projects.filter((p) => p.silent).length,
    noDeadline: scope.all.filter((k) => k.open && !k.t.deadline).length,
    noProject: { open: scope.noProject.filter((k) => k.open).length },
    bulkClosed: scope.bulk.size,
  };
}

// ---------------------------------------------------------------- insights (KPI-09)

export interface Insight {
  id: string;
  text: string;
  /** Task-list parameters behind the finding. */
  params: Record<string, string>;
}

/** In progress for more than 2 working days. */
export function isLongInProgress(k: KpiTask, ctx: KpiContext): boolean {
  if (!k.open || k.t.stage !== 'In progress') return false;
  const entered = [...k.t.events].reverse().find((e) => e.to === 'In progress')?.at;
  return !!entered && idleDays(entered, ctx) > 2;
}

export function insights(
  scope: KpiScope,
  ctx: KpiContext,
  projects: readonly ProjectRow[],
  names: { person: (id: number) => string; project: (id: number) => string },
): Insight[] {
  const out: Insight[] = [];
  const open = scope.all.filter((k) => k.open);
  const overdue = open.filter((k) => k.overdue);
  // 1. Who holds the biggest share of open work.
  const top = [
    ...groupBy(
      open.map((k) => k.t),
      (t) => t.responsibleId,
    ),
  ].sort((a, b) => b[1].length - a[1].length)[0];
  if (top && open.length >= 10 && top[1].length / open.length >= 0.1) {
    const projectsOf = new Set(top[1].map((t) => t.groupId).filter((g) => g > 0)).size;
    out.push({
      id: 'topHolder',
      text: `${names.person(top[0])} holds ${Math.round((top[1].length / open.length) * 100)} % of all open work (${top[1].length} tasks) across ${projectsOf} projects`,
      params: { kpi: 'open', assignee: String(top[0]) },
    });
  }
  // 2. Overdue concentrated in one project.
  const worst = [
    ...groupBy(
      overdue.filter((k) => k.t.groupId > 0).map((k) => k.t),
      (t) => t.groupId,
    ),
  ].sort((a, b) => b[1].length - a[1].length)[0];
  if (worst && overdue.length >= 5 && worst[1].length / overdue.length >= 0.25) {
    out.push({
      id: 'overdueConcentrated',
      text: `${names.project(worst[0])} has ${worst[1].length} overdue tasks, ${Math.round((worst[1].length / overdue.length) * 100)} % of all overdue work`,
      params: { kpi: 'overdue', project: String(worst[0]) },
    });
  }
  // 3. Long overdue.
  const old = overdue.filter((k) => k.daysOverdue > 30).length;
  if (old) {
    out.push({
      id: 'longOverdue',
      text: `${old} tasks are more than 30 days past their deadline`,
      params: { kpi: 'overdue', kpiAgeing: '30+' },
    });
  }
  // 4. In progress for more than 2 working days (replaces "timers running").
  const stuck = open.filter((k) => isLongInProgress(k, ctx)).length;
  if (stuck) {
    out.push({
      id: 'longInProgress',
      text: `${stuck} tasks have been In progress for over 2 working days`,
      params: { kpi: 'longInProgress' },
    });
  }
  // 5. Missing deadlines.
  const noDeadline = open.filter((k) => !k.t.deadline).length;
  if (open.length && noDeadline / open.length >= 0.05) {
    out.push({
      id: 'noDeadline',
      text: `${Math.round((noDeadline / open.length) * 100)} % of open tasks have no deadline (${noDeadline} tasks)`,
      params: { kpi: 'noDeadline' },
    });
  }
  // 6. Silent projects.
  const silent = projects.filter((p) => p.silent);
  if (silent.length) {
    out.push({
      id: 'silent',
      text: `${silent.length} projects have open tasks and no action for ${KPI.silentWorkingDays}+ working days`,
      params: { kpi: 'silent' },
    });
  }
  return out.slice(0, 6);
}

// ---------------------------------------------------------------- drill-down lists

export const KPI_LIST_PRESETS = [
  'all',
  'open',
  'overdue',
  'closed',
  'noDeadline',
  'longInProgress',
  'silent',
  'dueSoon',
  'dueLater',
] as const;
export type KpiListPreset = (typeof KPI_LIST_PRESETS)[number];

/** The tasks behind a KPI number: same scope and rules as the cards. */
export function kpiList(
  tasks: readonly MetricTask[],
  ctx: KpiContext,
  o: {
    preset?: KpiListPreset;
    dept?: Dept | 'all';
    period?: Period;
    ageing?: OverdueBucket;
    noProject?: boolean;
  },
): MetricTask[] {
  const scope = kpiScope(tasks, ctx, o.dept ?? 'all');
  const period = o.period ?? 'week';
  let list = o.noProject ? scope.noProject : scope.all;
  switch (o.preset) {
    case 'open':
      list = list.filter((k) => k.open);
      break;
    case 'overdue':
      list = list.filter((k) => k.overdue);
      break;
    case 'closed': {
      const range = periodBounds(ctx.now, period, ctx.cal);
      list = list.filter((k) => inRange(k.actualEnd, range) && !scope.bulk.has(k.t.id));
      break;
    }
    case 'noDeadline':
      list = list.filter((k) => k.open && !k.t.deadline);
      break;
    case 'longInProgress':
      list = list.filter((k) => isLongInProgress(k, ctx));
      break;
    case 'dueSoon': {
      const soon = addWorkingHours(ctx.now, KPI.soonWorkingDays * dayHours(ctx.cal), ctx.cal);
      list = list.filter((k) => k.open && !k.overdue && !!k.t.deadline && k.t.deadline <= soon);
      break;
    }
    case 'dueLater': {
      const soon = addWorkingHours(ctx.now, KPI.soonWorkingDays * dayHours(ctx.cal), ctx.cal);
      list = list.filter((k) => k.open && !k.overdue && !!k.t.deadline && k.t.deadline > soon);
      break;
    }
    case 'silent': {
      const silent = new Set(
        projectHealth(scope, ctx, period, () => null)
          .filter((p) => p.silent)
          .map((p) => p.id),
      );
      list = list.filter((k) => k.open && silent.has(k.t.groupId));
      break;
    }
  }
  if (o.ageing) list = list.filter((k) => k.overdue && overdueBucket(k.daysOverdue) === o.ageing);
  return list.map((k) => k.t);
}
