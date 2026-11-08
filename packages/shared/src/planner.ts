// Tasks in hand planner (2026-11-08, SRS 25; mockup docs/tasks-in-hand-planner.html). A task shows
// only on a day it was planned for: its deadline day, or a day its assignee took it into their
// Daily update plan ahead of the deadline. Overdue work is not repeated on later days: it stays on
// the day it was missed, in red. Past days keep a log of where a task went when its deadline was
// moved after the day had come; moves made before the day arrived simply clear that future slot.
// Pure functions, shared by the API and the tests. Days are YYYY-MM-DD in APP_TIMEZONE.
import { completedAt, isOnHold, isOverdue, isPending, type GroupBy } from './metrics';
import { dayKey, daysBetweenKeys } from './time';
import type { MetricContext, MetricTask } from './types';

// ---------------------------------------------------------------- days and columns

export const PLANNER_VIEWS = ['day', 'week', 'month'] as const;
export type PlannerView = (typeof PLANNER_VIEWS)[number];
/** Columns per view: the 7 days of a week, 6 weeks or 6 months. */
export const PLANNER_SPAN: Record<PlannerView, number> = { day: 7, week: 6, month: 6 };

export const dayPlus = (key: string, days: number): string => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const isoDow = (key: string) => ((new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
/** Monday of the week the day is in. */
export const mondayOf = (key: string): string => dayPlus(key, 1 - isoDow(key));
const monthPlus = (key: string, months: number): string => {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
};
const monthLast = (first: string): string => dayPlus(monthPlus(first, 1), -1);
const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number) as [number, number];
  const [yb, mb] = b.split('-').map(Number) as [number, number];
  return (yb - ya) * 12 + (mb - ma);
};

/** A column: a day, a week (Monday to Sunday) or a month; `from` and `to` inclusive. */
export interface PlannerColumn {
  key: string;
  from: string;
  to: string;
}

/** The first column's first day for any day in it (Monday of the week, or the 1st of the month). */
export function plannerStart(view: PlannerView, day: string): string {
  return view === 'month' ? monthPlus(day, 0) : mondayOf(day);
}

/**
 * Where a view opens: Day on this week; Week with 4 weeks before this one and 1 after; Month with
 * 4 months before this one and 1 after.
 */
export function defaultStart(view: PlannerView, today: string): string {
  if (view === 'day') return mondayOf(today);
  if (view === 'week') return dayPlus(mondayOf(today), -28);
  return monthPlus(today, -4);
}

/** The ‹ › arrows: a week, six weeks or six months back (dir −1) or forward (dir 1). */
export function shiftStart(view: PlannerView, start: string, dir: number): string {
  const s = plannerStart(view, start);
  if (view === 'day') return dayPlus(s, 7 * dir);
  if (view === 'week') return dayPlus(s, 42 * dir);
  return monthPlus(s, 6 * dir);
}

export function plannerColumns(view: PlannerView, start: string): PlannerColumn[] {
  const s = plannerStart(view, start);
  const n = PLANNER_SPAN[view];
  return Array.from({ length: n }, (_, i) => {
    if (view === 'day') {
      const k = dayPlus(s, i);
      return { key: k, from: k, to: k };
    }
    if (view === 'week') {
      const from = dayPlus(s, 7 * i);
      return { key: from, from, to: dayPlus(from, 6) };
    }
    const from = monthPlus(s, i);
    return { key: from.slice(0, 7), from, to: monthLast(from) };
  });
}

/** Index of the column holding the day, or −1. */
function columnIndex(view: PlannerView, columns: readonly PlannerColumn[], day: string): number {
  const first = columns[0]!;
  if (day < first.from || day > columns[columns.length - 1]!.to) return -1;
  if (view === 'day') return daysBetweenKeys(first.from, day);
  if (view === 'week') return Math.floor(daysBetweenKeys(first.from, day) / 7);
  return monthsBetween(first.from, day);
}

// ---------------------------------------------------------------- one task's plan

/** One deadline value and the day it was set (`on`), oldest first; dl null = no deadline. */
export interface DeadlineStep {
  dl: string | null;
  on: string;
  at: Date;
  by: number | null;
}

/**
 * The deadline log: the deadline at creation (the first change's old value, else the deadline now),
 * then every change to another day (a time-only change on the same day is not a move). When the
 * deadline now differs from the last logged one (its history not read yet), the change is added at
 * the task's last change time.
 */
export function deadlineSteps(t: MetricTask, tz: string): DeadlineStep[] {
  const evs = t.deadlineEvents ?? [];
  const first = evs.length ? evs[0]!.from : t.deadline;
  const steps: DeadlineStep[] = [
    {
      dl: first ? dayKey(first, tz) : null,
      on: dayKey(t.createdAt, tz),
      at: t.createdAt,
      by: t.createdBy,
    },
  ];
  const add = (dl: string | null, at: Date, by: number | null) => {
    if (steps[steps.length - 1]!.dl === dl) return;
    steps.push({ dl, on: dayKey(at, tz), at, by });
  };
  for (const e of evs) add(e.to ? dayKey(e.to, tz) : null, e.at, e.by);
  add(t.deadline ? dayKey(t.deadline, tz) : null, t.changedAt, null);
  return steps;
}

/**
 * When the task was done: the first time it left the open set (pending), i.e. its first move into
 * QA Backlog, else its Bitrix24 closed date, else its last stage move or change. Null while it is
 * pending or on hold.
 */
export function doneAt(t: MetricTask): Date | null {
  if (isPending(t) || isOnHold(t)) return null;
  const last = t.events.length ? t.events[t.events.length - 1]!.at : null;
  return completedAt(t) ?? t.closedAt ?? last ?? t.changedAt;
}

export interface PlanTask {
  t: MetricTask;
  steps: DeadlineStep[];
  /** Days it was taken into its assignee's day plan ahead of its deadline then, oldest first. */
  plans: string[];
  /** Day it was done (doneAt), or null. */
  done: string | null;
  created: string;
  /** Current deadline day. */
  cur: string | null;
}

/** The deadline in force at the end of a day. */
const deadlineOn = (steps: readonly DeadlineStep[], day: string): string | null => {
  let dl: string | null = null;
  for (const s of steps) if (s.on <= day) dl = s.dl;
  return dl;
};

/**
 * A task with its deadline log and day plans. `planDays` are the days it was on its assignee's
 * posted Daily update plan; only those ahead of the deadline then count as day plans (on the
 * deadline day it is the deadline entry; an overdue carry-over stays on the day it was missed).
 */
export function planTask(t: MetricTask, tz: string, planDays: Iterable<string> = []): PlanTask {
  const steps = deadlineSteps(t, tz);
  const created = dayKey(t.createdAt, tz);
  const plans = [...new Set(planDays)]
    .filter((p) => {
      if (p < created) return false;
      const dl = deadlineOn(steps, p);
      return !!dl && dl > p;
    })
    .sort();
  const d = doneAt(t);
  return {
    t,
    steps,
    plans,
    done: d ? dayKey(d, tz) : null,
    created,
    cur: steps[steps.length - 1]!.dl,
  };
}

/**
 * Deadlines missed: changes made after the previous deadline day had ended (moved, or removed,
 * once the day had passed undone). Moves made in advance, same-day re-plans and pull-forwards do
 * not count. `upto`: only changes made on or before that day.
 */
export function missedCount(p: PlanTask, upto?: string): number {
  let c = 0;
  for (let k = 1; k < p.steps.length; k++) {
    const s = p.steps[k]!;
    if (upto !== undefined && s.on > upto) break;
    const prev = p.steps[k - 1]!.dl;
    if (prev && s.on > prev) c++;
  }
  return c;
}

export type ChangeKind = 'set' | 'removed' | 'missed' | 'pull' | 'replan';

/** What a deadline change was: set from none, removed, after a missed day, pulled forward, re-planned. */
export function changeKind(prev: DeadlineStep, next: DeadlineStep): ChangeKind {
  if (!prev.dl) return 'set';
  if (next.on > prev.dl) return 'missed';
  if (!next.dl) return 'removed';
  if (next.dl < prev.dl) return 'pull';
  return 'replan';
}

// ---------------------------------------------------------------- entries

export type EntryKind = 'deadline' | 'moved' | 'replan' | 'dayplan';
export type EntryStatus = 'done' | 'missed' | 'due' | 'planned' | 'moved' | 'replan';

/** One appearance of a task in one day cell. */
export interface PlanEntry {
  taskId: number;
  day: string;
  kind: EntryKind;
  status: EntryStatus;
  /** Counts as planned for the day (a same-day re-plan is shown, not counted). */
  counts: boolean;
  /** "Nth deadline missed" (0 = none): on a moved entry, the count at that move. */
  missed: number;
  /** Moved or re-planned entry: the new deadline (null = removed) and who changed it. */
  to?: string | null;
  by?: number | null;
  /** Deadline entry: the last change pulled the deadline forward from this day, by this person. */
  pulledFrom?: { day: string; by: number | null };
  /** Deadline entry: the last change moved it here from this day before that day came. */
  replannedFrom?: string;
  /** Deadline entry: the last day plan before the deadline that was not finished. */
  notDoneInPlan?: string;
  /** Day-plan entry: the deadline now. */
  deadline?: string | null;
  /** Missed entry: the day it was done after all. */
  doneDay?: string | null;
}

const RANK: Record<EntryStatus, number> = {
  missed: 0,
  due: 1,
  planned: 1,
  done: 2,
  moved: 3,
  replan: 4,
};
/** Cell order: missed, due or planned, done, moved, re-planned. */
export const byEntryRank = (a: PlanEntry, b: PlanEntry) =>
  RANK[a.status] - RANK[b.status] || a.taskId - b.taskId;

/** The task's entries on one day (rules 1 to 4 of SRS 25). */
export function entriesOn(p: PlanTask, day: string, today: string): PlanEntry[] {
  if (day < p.created) return [];
  const out: PlanEntry[] = [];
  const { steps, plans, done } = p;
  const last = steps.length - 1;
  steps.forEach((s, k) => {
    if (s.dl !== day) return;
    if (k === last) {
      // Shown on its day-plan day instead: in today's plan (for a later deadline day), or done
      // on an earlier day-plan day.
      if (plans.some((dp) => dp < day && dp === today && day > today && done === null)) return;
      if (done !== null && done < day && plans.includes(done)) return;
      const status: EntryStatus =
        done !== null && done <= day
          ? 'done'
          : day < today
            ? 'missed'
            : day === today
              ? 'due'
              : 'planned';
      const e: PlanEntry = {
        taskId: p.t.id,
        day,
        kind: 'deadline',
        status,
        counts: true,
        missed: missedCount(p),
      };
      if (k > 0) {
        const kind = changeKind(steps[k - 1]!, s);
        if (kind === 'pull') e.pulledFrom = { day: steps[k - 1]!.dl!, by: s.by };
        else if (kind === 'replan') e.replannedFrom = steps[k - 1]!.dl!;
      }
      const notDone = plans.filter((dp) => dp < day && dp !== done);
      if (notDone.length) e.notDoneInPlan = notDone[notDone.length - 1];
      if (status === 'missed') e.doneDay = done;
      out.push(e);
      return;
    }
    const next = steps[k + 1]!;
    // Moved before the day arrived: the slot is simply cleared.
    if (next.on < day) return;
    if (next.on > day)
      out.push({
        taskId: p.t.id,
        day,
        kind: 'moved',
        status: 'moved',
        counts: true,
        missed: missedCount(p, next.on),
        to: next.dl,
        by: next.by,
      });
    else
      out.push({
        taskId: p.t.id,
        day,
        kind: 'replan',
        status: 'replan',
        counts: false,
        missed: 0,
        to: next.dl,
        by: next.by,
      });
  });
  if (plans.includes(day) && !steps.some((s) => s.dl === day)) {
    const status: EntryStatus =
      done !== null && done <= day ? 'done' : day < today ? 'missed' : 'due';
    out.push({
      taskId: p.t.id,
      day,
      kind: 'dayplan',
      status,
      counts: true,
      missed: missedCount(p),
      deadline: p.cur,
      ...(status === 'missed' ? { doneDay: done } : {}),
    });
  }
  return out;
}

/** The days the task can appear on: its deadlines (now and before) and its day plans. */
export function candidateDays(p: PlanTask): string[] {
  const s = new Set<string>(p.plans);
  for (const st of p.steps) if (st.dl) s.add(st.dl);
  return [...s].sort();
}

// ---------------------------------------------------------------- the grid

export interface Progress {
  planned: number;
  done: number;
}
export interface PlannerDayCell extends Progress {
  entries: PlanEntry[];
}
export interface PlannerPeriodCell extends Progress {
  /** Only the days up to today. */
  plannedToDate: number;
  doneToDate: number;
  /** Split the other way (projects for a person, people for a project), most planned first. */
  groups: (Progress & { id: number })[];
  /** Moved entries in the period (each a deadline missed). */
  missedDeadlines: number;
  /** Deadline entries in the period whose deadline was pulled forward. */
  pulledForward: number;
}
export type PlannerCell = PlannerDayCell | PlannerPeriodCell;
export interface PlannerColumnTotal extends Progress {
  plannedToDate: number;
  doneToDate: number;
}
export interface PlannerRow {
  id: number;
  /** Open tasks now (the tab's rule). */
  open: number;
  /** Open with the deadline passed (the tab's rule). */
  overdueNow: number;
  /** Planned vs done over the visible columns up to today. */
  progress: Progress;
  cells: Record<string, PlannerCell>;
}
export interface PlannerGrid {
  view: PlannerView;
  groupBy: GroupBy;
  start: string;
  today: string;
  columns: PlannerColumn[];
  rows: PlannerRow[];
  columnTotals: Record<string, PlannerColumnTotal>;
  totals: { open: number; overdueNow: number };
}

export interface PlannerOptions {
  view: PlannerView;
  /** Any day in the first column. */
  start: string;
  by: GroupBy;
  /** Task id → days it was on its assignee's posted Daily update plan. */
  dayPlans?: ReadonlyMap<number, readonly string[]>;
  /** The tab's rules (default: pending, and pending past the deadline). */
  open?: (t: MetricTask) => boolean;
  overdue?: (t: MetricTask) => boolean;
}

const keyOf = (by: GroupBy) =>
  by === 'project' ? (t: MetricTask) => t.groupId : (t: MetricTask) => t.responsibleId;

/**
 * The planner: one row per assignee (or project), one column per day, week or month. In one
 * pass over the tasks, each placed only on the days it touches (never day by day). Week and month
 * cells count each task once: planned = at least one counted entry in the period, done = a done
 * entry there.
 */
export function plannerGrid(
  list: readonly MetricTask[],
  ctx: MetricContext,
  opts: PlannerOptions,
): PlannerGrid {
  const { view, by } = opts;
  const today = dayKey(ctx.now, ctx.tz);
  const open = opts.open ?? isPending;
  const overdue = opts.overdue ?? ((t: MetricTask) => isOverdue(t, ctx));
  const start = plannerStart(view, opts.start);
  const columns = plannerColumns(view, start);
  const rowKey = keyOf(by);
  const otherKey = keyOf(by === 'project' ? 'assignee' : 'project');

  interface Acc {
    open: number;
    overdueNow: number;
    days: Map<number, PlannerDayCell>;
    // column → task → [counted, done, countedToDate, doneToDate]
    periods: Map<number, Map<number, [boolean, boolean, boolean, boolean, number]>>;
    moved: Map<number, number>;
    pulled: Map<number, number>;
  }
  const rows = new Map<number, Acc>();
  const acc = (id: number): Acc => {
    let a = rows.get(id);
    if (!a) {
      a = {
        open: 0,
        overdueNow: 0,
        days: new Map(),
        periods: new Map(),
        moved: new Map(),
        pulled: new Map(),
      };
      rows.set(id, a);
    }
    return a;
  };

  for (const t of list) {
    const isOpen = open(t);
    if (isOpen) acc(rowKey(t)).open++;
    if (isOpen && overdue(t)) acc(rowKey(t)).overdueNow++;
    if (!t.deadline && !t.deadlineEvents?.length && !opts.dayPlans?.has(t.id)) continue;
    const p = planTask(t, ctx.tz, opts.dayPlans?.get(t.id) ?? []);
    for (const day of candidateDays(p)) {
      const ci = columnIndex(view, columns, day);
      if (ci < 0) continue;
      const entries = entriesOn(p, day, today);
      if (!entries.length) continue;
      const a = acc(rowKey(t));
      if (view === 'day') {
        const cell = a.days.get(ci) ?? { planned: 0, done: 0, entries: [] };
        for (const e of entries) {
          cell.entries.push(e);
          if (e.counts) {
            cell.planned++;
            if (e.status === 'done') cell.done++;
          }
        }
        a.days.set(ci, cell);
        continue;
      }
      const per = a.periods.get(ci) ?? new Map();
      const s = per.get(t.id) ?? [false, false, false, false, otherKey(t)];
      for (const e of entries) {
        if (e.kind === 'moved') a.moved.set(ci, (a.moved.get(ci) ?? 0) + 1);
        if (e.pulledFrom) a.pulled.set(ci, (a.pulled.get(ci) ?? 0) + 1);
        if (!e.counts) continue;
        s[0] = true;
        if (e.status === 'done') s[1] = true;
        if (day <= today) {
          s[2] = true;
          if (e.status === 'done') s[3] = true;
        }
      }
      per.set(t.id, s);
      a.periods.set(ci, per);
    }
  }

  const columnTotals: Record<string, PlannerColumnTotal> = Object.fromEntries(
    columns.map((c) => [c.key, { planned: 0, done: 0, plannedToDate: 0, doneToDate: 0 }]),
  );
  const out: PlannerRow[] = [];
  for (const [id, a] of rows) {
    const cells: Record<string, PlannerCell> = {};
    const progress: Progress = { planned: 0, done: 0 };
    columns.forEach((c, ci) => {
      const tot = columnTotals[c.key]!;
      if (view === 'day') {
        const cell = a.days.get(ci) ?? { planned: 0, done: 0, entries: [] };
        cell.entries.sort(byEntryRank);
        cells[c.key] = cell;
        tot.planned += cell.planned;
        tot.done += cell.done;
        if (c.from <= today) {
          tot.plannedToDate += cell.planned;
          tot.doneToDate += cell.done;
          progress.planned += cell.planned;
          progress.done += cell.done;
        }
        return;
      }
      const per =
        a.periods.get(ci) ?? new Map<number, [boolean, boolean, boolean, boolean, number]>();
      const cell: PlannerPeriodCell = {
        planned: 0,
        done: 0,
        plannedToDate: 0,
        doneToDate: 0,
        groups: [],
        missedDeadlines: a.moved.get(ci) ?? 0,
        pulledForward: a.pulled.get(ci) ?? 0,
      };
      const groups = new Map<number, Progress>();
      for (const [counted, done, countedToDate, doneToDate, other] of per.values()) {
        if (!counted) continue;
        cell.planned++;
        if (done) cell.done++;
        if (countedToDate) cell.plannedToDate++;
        if (doneToDate) cell.doneToDate++;
        const g = groups.get(other) ?? { planned: 0, done: 0 };
        g.planned++;
        if (done) g.done++;
        groups.set(other, g);
      }
      cell.groups = [...groups]
        .map(([gid, g]) => ({ id: gid, ...g }))
        .sort((x, y) => y.planned - x.planned || x.id - y.id);
      cells[c.key] = cell;
      tot.planned += cell.planned;
      tot.done += cell.done;
      tot.plannedToDate += cell.plannedToDate;
      tot.doneToDate += cell.doneToDate;
      progress.planned += cell.plannedToDate;
      progress.done += cell.doneToDate;
    });
    const any = Object.values(cells).some(
      (c) => c.planned > 0 || ('entries' in c && c.entries.length),
    );
    if (!any && !a.open) continue;
    out.push({ id, open: a.open, overdueNow: a.overdueNow, progress, cells });
  }
  out.sort(
    (x, y) =>
      y.overdueNow - x.overdueNow ||
      y.open - x.open ||
      y.progress.planned - x.progress.planned ||
      x.id - y.id,
  );
  return {
    view,
    groupBy: by,
    start,
    today,
    columns,
    rows: out,
    columnTotals,
    totals: {
      open: out.reduce((n, r) => n + r.open, 0),
      overdueNow: out.reduce((n, r) => n + r.overdueNow, 0),
    },
  };
}

/** All entries of one row in one period, by day (a week or month cell's drawer). */
export function periodEntries(
  list: readonly MetricTask[],
  ctx: MetricContext,
  from: string,
  to: string,
  dayPlans?: ReadonlyMap<number, readonly string[]>,
): { day: string; planned: number; done: number; entries: PlanEntry[] }[] {
  const today = dayKey(ctx.now, ctx.tz);
  const days = new Map<string, PlannerDayCell>();
  for (const t of list) {
    const p = planTask(t, ctx.tz, dayPlans?.get(t.id) ?? []);
    for (const day of candidateDays(p)) {
      if (day < from || day > to) continue;
      for (const e of entriesOn(p, day, today)) {
        const c = days.get(day) ?? { planned: 0, done: 0, entries: [] };
        c.entries.push(e);
        if (e.counts) {
          c.planned++;
          if (e.status === 'done') c.done++;
        }
        days.set(day, c);
      }
    }
  }
  return [...days]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, c]) => ({ day, ...c, entries: c.entries.sort(byEntryRank) }));
}

// ---------------------------------------------------------------- task log and overdue list

export type PlanLogItem =
  | { type: 'created'; day: string; deadline: string | null; by: number | null }
  | {
      type: 'change';
      day: string;
      at: Date;
      from: string | null;
      to: string | null;
      by: number | null;
      kind: ChangeKind;
      /** The missed count after this change (kind 'missed'). */
      nth: number;
    }
  | { type: 'dayplan'; day: string; done: boolean; past: boolean }
  | { type: 'completed'; day: string; lateDays: number }
  | { type: 'open'; overdueDays: number };

export interface PlanLog {
  deadline: string | null;
  missed: number;
  done: string | null;
  log: PlanLogItem[];
  /** Every day the task shows on the planner, and as what. */
  shownOn: { day: string; kinds: EntryKind[] }[];
}

/** The task drawer's Plan log: created, each deadline change, each day plan, done or still open. */
export function planLog(
  t: MetricTask,
  ctx: MetricContext,
  planDays: Iterable<string> = [],
): PlanLog {
  const today = dayKey(ctx.now, ctx.tz);
  const p = planTask(t, ctx.tz, planDays);
  const order: Record<PlanLogItem['type'], number> = {
    created: 0,
    change: 1,
    dayplan: 2,
    completed: 3,
    open: 3,
  };
  const log: PlanLogItem[] = [
    { type: 'created', day: p.created, deadline: p.steps[0]!.dl, by: p.steps[0]!.by },
  ];
  p.steps.forEach((s, k) => {
    if (!k) return;
    const kind = changeKind(p.steps[k - 1]!, s);
    log.push({
      type: 'change',
      day: s.on,
      at: s.at,
      from: p.steps[k - 1]!.dl,
      to: s.dl,
      by: s.by,
      kind,
      nth: missedCount(p, s.on),
    });
  });
  for (const dp of p.plans)
    log.push({ type: 'dayplan', day: dp, done: p.done === dp, past: dp < today });
  if (p.done !== null)
    log.push({
      type: 'completed',
      day: p.done,
      lateDays: p.cur && p.done > p.cur ? daysBetweenKeys(p.cur, p.done) : 0,
    });
  else
    log.push({
      type: 'open',
      overdueDays: p.cur && p.cur < today ? daysBetweenKeys(p.cur, today) : 0,
    });
  const dayOf = (i: PlanLogItem) => (i.type === 'open' ? today : i.day);
  log.sort((a, b) =>
    dayOf(a) < dayOf(b) ? -1 : dayOf(a) > dayOf(b) ? 1 : order[a.type] - order[b.type],
  );
  const shownOn = candidateDays(p)
    .map((day) => ({ day, kinds: entriesOn(p, day, today).map((e) => e.kind) }))
    .filter((d) => d.kinds.length);
  return { deadline: p.cur, missed: missedCount(p), done: p.done, log, shownOn };
}

/** Open tasks past their deadline now, oldest deadline first, with the days overdue. */
export function overdueNowList(
  list: readonly MetricTask[],
  ctx: MetricContext,
  overdue: (t: MetricTask) => boolean = (t) => isOverdue(t, ctx),
): { t: MetricTask; deadline: string; daysOverdue: number; missed: number }[] {
  const today = dayKey(ctx.now, ctx.tz);
  return list
    .filter((t) => t.deadline && overdue(t))
    .map((t) => {
      const deadline = dayKey(t.deadline!, ctx.tz);
      return {
        t,
        deadline,
        daysOverdue: daysBetweenKeys(deadline, today),
        missed: missedCount(planTask(t, ctx.tz)),
      };
    })
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : a.t.id - b.t.id));
}
