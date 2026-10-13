// Every dashboard number (SRS sections 3, 4 and 5) as pure functions over MetricTask.
// No I/O and no clock: `now` and the time zone come in through MetricContext.
import {
  hasRole,
  isHoldStage,
  isReworkMove,
  STAGE_TITLES,
  stageGroupOf,
  stageWithRole,
  type StageGroup,
  type StageTitle,
} from './stages';
import { isTestingTag, normalizeTag } from './tags';
import { dayKey, daysBetween, diffDays } from './time';
import type { Filters, IssueType, MetricContext, MetricTask } from './types';

// ---------------------------------------------------------------- selection

/** Development tab switch: All, Dev (tasks) or Issues (bug and feedback). */
export const DEV_SCOPES = ['all', 'dev', 'issues'] as const;
export type DevScope = (typeof DEV_SCOPES)[number];

/** Assignee is in the Development department (or, without that list, not a tester). */
const isDeveloperTask = (t: MetricTask, ctx: MetricContext) =>
  ctx.developers ? ctx.developers.has(t.responsibleId) : !ctx.testers.has(t.responsibleId);

/**
 * Work the dashboard counts: in a workgroup and assigned to the Development department. Bugs and
 * feedback are only ever assigned to developers, so this one rule picks the issues for both the
 * Development and the QA tab, and their counts match.
 */
const isDevelopmentWork = (t: MetricTask, ctx: MetricContext) =>
  t.groupId !== 0 && isDeveloperTask(t, ctx);

/**
 * Development tab, Development department only. `dev` = tasks (not bug or feedback), `issues` =
 * bugs and feedback (the same set as the QA tab), `all` = both.
 */
export const devTasks = (
  tasks: readonly MetricTask[],
  ctx: MetricContext,
  scope: DevScope = 'dev',
): MetricTask[] =>
  tasks.filter(
    (t) => isDevelopmentWork(t, ctx) && (scope === 'all' || (scope === 'issues') === t.isIssue),
  );

/**
 * QA tab: tasks tagged bug or feedback (or Re-Open). With a context, only those assigned to the
 * Development department (as on the Development tab, so both tabs' issue counts match); without
 * one, every issue (used where the assignee does not matter, e.g. linked issues).
 */
export const issues = (tasks: readonly MetricTask[], ctx?: MetricContext): MetricTask[] =>
  tasks.filter((t) => t.isIssue && (!ctx || isDevelopmentWork(t, ctx)));

/** QA-06: tagged testing / re-testing, or assigned to the QA Testing department. */
export const testingTasks = (tasks: readonly MetricTask[], ctx: MetricContext): MetricTask[] =>
  tasks.filter(
    (t) => !t.isIssue && (ctx.testers.has(t.responsibleId) || t.tags.some(isTestingTag)),
  );

type FilterKey = 'project' | 'assignee' | 'tag' | 'issueType' | 'date';

function matches(t: MetricTask, f: Filters, tz: string, skip?: FilterKey): boolean {
  if (skip !== 'project' && f.projectIds?.length && !f.projectIds.includes(t.groupId)) return false;
  if (skip !== 'assignee' && f.assigneeIds?.length && !f.assigneeIds.includes(t.responsibleId)) {
    return false;
  }
  if (skip !== 'tag' && f.tags?.length) {
    const wanted = new Set(f.tags.map(normalizeTag));
    if (!t.tags.some((tag) => wanted.has(normalizeTag(tag)))) return false;
  }
  // Bug/Feedback filter applies to issues only; other tasks pass through.
  if (skip !== 'issueType' && f.issueType && t.isIssue && t.issueType !== f.issueType) return false;
  if (skip !== 'date' && (f.from || f.to)) {
    const d = f.dateField === 'deadline' ? t.deadline : t.createdAt;
    if (!d) return false;
    const key = dayKey(d, tz);
    if (f.from && key < f.from) return false;
    if (f.to && key > f.to) return false;
  }
  return true;
}

export const applyFilters = (tasks: readonly MetricTask[], f: Filters, tz: string): MetricTask[] =>
  tasks.filter((t) => matches(t, f, tz));

export interface FacetOption<K> {
  value: K;
  count: number;
}

export interface FilterOptions {
  projects: FacetOption<number>[];
  assignees: FacetOption<number>[];
  tags: FacetOption<string>[];
  issueTypes: FacetOption<IssueType>[];
}

function facet<K>(tasks: readonly MetricTask[], keys: (t: MetricTask) => K[]): FacetOption<K>[] {
  const counts = new Map<K, number>();
  for (const t of tasks) for (const k of keys(t)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

/**
 * Contextual dropdown options: each facet is computed with every other filter applied,
 * so picking a project narrows assignees to people with tasks there (DEV-00).
 */
export function filterOptions(tasks: readonly MetricTask[], f: Filters, tz: string): FilterOptions {
  const without = (k: FilterKey) => tasks.filter((t) => matches(t, f, tz, k));
  // Tags are grouped case-insensitively; the most common spelling is shown.
  const spelling = new Map<string, Map<string, number>>();
  const tagged = without('tag');
  for (const t of tagged) {
    for (const tag of t.tags) {
      const n = normalizeTag(tag) || tag;
      const m = spelling.get(n) ?? new Map<string, number>();
      m.set(tag, (m.get(tag) ?? 0) + 1);
      spelling.set(n, m);
    }
  }
  const tags = [...spelling.values()]
    .map((m) => {
      const [value] = [...m].sort((a, b) => b[1] - a[1])[0]!;
      return { value, count: [...m.values()].reduce((a, b) => a + b, 0) };
    })
    .sort((a, b) => b.count - a.count);

  return {
    projects: facet(without('project'), (t) => (t.groupId ? [t.groupId] : [])),
    assignees: facet(without('assignee'), (t) => [t.responsibleId]),
    tags,
    issueTypes: facet(without('issueType'), (t) => (t.issueType ? [t.issueType] : [])),
  };
}

// ---------------------------------------------------------------- per task

export const stageGroup = (t: MetricTask): StageGroup | null =>
  t.stage ? stageGroupOf(t.stage) : null;

/**
 * Completed (SRS 5): in QA Backlog, In QA, Done or LIVE. On a board without QA stages (e.g.
 * New / In progress / Finished), a task closed in Bitrix24 is completed too, wherever its card.
 */
export const isSentToQa = (t: MetricTask) =>
  stageGroup(t) === 'sentToQa' || (t.qaFlow === false && !!t.closedAt);
export const isCompleted = isSentToQa;
/** On hold: in On Hold and not completed; neither pending nor completed (SRS 5). */
export const isOnHold = (t: MetricTask) => isHoldStage(t.stage) && !isSentToQa(t);
/** Pending: neither completed nor on hold, so pending + completed + hold = total. */
export const isPending = (t: MetricTask) => !isSentToQa(t) && !isOnHold(t);
export const isReady = (t: MetricTask) => hasRole(t.stage, 'ready');
export const isDeployed = (t: MetricTask) => hasRole(t.stage, 'live');
/** An open issue is a pending one (QA tab "Open"); resolved = completed. Same rule as tasks. */
export const isOpenIssue = isPending;
/** "completed" / "pending" / "hold", shown in every task list (SRS 5). */
export const taskStatus = (t: MetricTask): 'completed' | 'pending' | 'hold' =>
  isSentToQa(t) ? 'completed' : isOnHold(t) ? 'hold' : 'pending';

/**
 * When the task was completed (SRS 5): its first move into QA Backlog (the developer pressed
 * Complete). Only a task with no recorded stage moves at all falls back to its Bitrix24 closed
 * date; one whose history skips QA Backlog (e.g. a bulk clean-up straight to Done) is not a
 * completion (changed 2026-10-10; it used to accept any sent-to-QA stage).
 */
export function completedAt(t: MetricTask): Date | null {
  // The workflow's QA entry stage (QA Backlog by default).
  const qa = stageWithRole('qaEntry');
  const first = t.events.find((e) => e.to === qa);
  if (first) return first.at;
  return t.events.length === 0 ? t.closedAt : null;
}

/** Pending (except On Hold, open question 6) with the deadline passed. */
export const isOverdue = (t: MetricTask, ctx: MetricContext): boolean =>
  isPending(t) && !isHoldStage(t.stage) && !!t.deadline && t.deadline < ctx.now;

/** Deadline date is today in the app time zone, any stage group except Deployed. */
export const isDueToday = (t: MetricTask, ctx: MetricContext): boolean =>
  !!t.deadline && !isDeployed(t) && dayKey(t.deadline, ctx.tz) === dayKey(ctx.now, ctx.tz);

export function isCompletedToday(t: MetricTask, ctx: MetricContext): boolean {
  const at = completedAt(t);
  return !!at && dayKey(at, ctx.tz) === dayKey(ctx.now, ctx.tz);
}

/** Calendar day before today in the app time zone (YYYY-MM-DD). */
const yesterdayKey = (ctx: MetricContext) =>
  dayKey(new Date(ctx.now.getTime() - 86_400_000), ctx.tz);

/** Reached QA Backlog for the first time yesterday (IST): DEV-02 "Comp. yesterday". */
export function isCompletedYesterday(t: MetricTask, ctx: MetricContext): boolean {
  const at = completedAt(t);
  return !!at && dayKey(at, ctx.tz) === yesterdayKey(ctx);
}

/**
 * Spill of yesterday (2026-10-13): the deadline was yesterday (IST) and the task was not completed
 * (pushed to QA Backlog) by the end of yesterday: still pending or on hold, or completed today.
 */
export const isSpillYesterday = (t: MetricTask, ctx: MetricContext): boolean =>
  isSpill(t, ctx, 'day');

/** Day, week (Monday to Sunday) or month, in the app time zone (Projects at work switch). */
export type WorkPeriod = 'day' | 'week' | 'month';
export const WORK_PERIODS = ['day', 'week', 'month'] as const;

const keyPlusDays = (key: string, days: number) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** First and last day (YYYY-MM-DD, inclusive) of the current period, or `back` periods before. */
export function periodDays(
  ctx: MetricContext,
  period: WorkPeriod,
  back = 0,
): { from: string; to: string } {
  const today = dayKey(ctx.now, ctx.tz);
  if (period === 'day') {
    const d = keyPlusDays(today, -back);
    return { from: d, to: d };
  }
  if (period === 'week') {
    const isoDow = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const monday = keyPlusDays(today, 1 - isoDow - 7 * back);
    return { from: monday, to: keyPlusDays(monday, 6) };
  }
  const [y, m] = today.split('-').map(Number) as [number, number];
  return {
    from: new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(y, m - back, 0)).toISOString().slice(0, 10),
  };
}

const inDays = (d: Date | null, r: { from: string; to: string }, tz: string) => {
  if (!d) return false;
  const k = dayKey(d, tz);
  return k >= r.from && k <= r.to;
};

/** Pushed to QA Backlog in the previous day, week or month (day = "done yesterday"). */
export const isDonePrev = (t: MetricTask, ctx: MetricContext, period: WorkPeriod): boolean =>
  inDays(completedAt(t), periodDays(ctx, period, 1), ctx.tz);

/** Overdue now, with the deadline in the current day, week or month ("overdue today"). */
export const isOverdueInPeriod = (t: MetricTask, ctx: MetricContext, period: WorkPeriod): boolean =>
  isOverdue(t, ctx) && inDays(t.deadline, periodDays(ctx, period), ctx.tz);

/**
 * Spill of the previous day, week or month: the deadline was in it and the task was not pushed to
 * QA Backlog by its end (still pending or on hold, or completed later).
 */
export function isSpill(t: MetricTask, ctx: MetricContext, period: WorkPeriod): boolean {
  const prev = periodDays(ctx, period, 1);
  if (!inDays(t.deadline, prev, ctx.tz)) return false;
  const at = completedAt(t);
  return at ? dayKey(at, ctx.tz) > prev.to : !isSentToQa(t);
}

/** Days (YYYY-MM-DD, app time zone) on which the task was pushed to QA Backlog. */
const qaBacklogDays = (t: MetricTask, tz: string) =>
  t.events.filter((e) => e.to === stageWithRole('qaEntry')).map((e) => dayKey(e.at, tz));

/** Today minus deadline in calendar days; negative = not yet due; null without deadline. */
export const ageingDays = (t: MetricTask, ctx: MetricContext): number | null =>
  t.deadline ? daysBetween(t.deadline, ctx.now, ctx.tz) : null;

export const AGEING_BUCKETS = [
  'noDeadline',
  'notDue',
  '0-2',
  '3-7',
  '8-14',
  '15-30',
  '30+',
] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

const dayBucket = (days: number): '0-2' | '3-7' | '8-14' | '15+' =>
  days <= 2 ? '0-2' : days <= 7 ? '3-7' : days <= 14 ? '8-14' : '15+';

/** DEV-03 bucket for an open task, by days past deadline (15 to 30 and over 30 split). */
export function ageingBucket(t: MetricTask, ctx: MetricContext): AgeingBucket {
  if (!t.deadline) return 'noDeadline';
  if (t.deadline >= ctx.now) return 'notDue';
  const days = Math.max(0, ageingDays(t, ctx) ?? 0);
  if (days > 30) return '30+';
  if (days >= 15) return '15-30';
  return dayBucket(days) as AgeingBucket;
}

export const ISSUE_AGE_BUCKETS = ['0-2', '3-7', '8-14', '15+'] as const;
export type IssueAgeBucket = (typeof ISSUE_AGE_BUCKETS)[number];

/** Today minus created date, in calendar days. */
export const issueAgeDays = (t: MetricTask, ctx: MetricContext): number =>
  Math.max(0, daysBetween(t.createdAt, ctx.now, ctx.tz));

export const issueAgeBucket = (t: MetricTask, ctx: MetricContext): IssueAgeBucket =>
  dayBucket(issueAgeDays(t, ctx));

// ---------------------------------------------------------------- rework

/** QA send-backs: moves from QA Backlog, In QA or Done back to Issue Raised, To do or In progress. */
export const reopenEvents = (t: MetricTask) => t.events.filter((e) => isReworkMove(e.from, e.to));

export type TaskIndex = ReadonlyMap<number, MetricTask>;

export const indexTasks = (tasks: readonly MetricTask[]): Map<number, MetricTask> =>
  new Map(tasks.map((t) => [t.id, t]));

/**
 * Rework count for an issue (SRS 5): the number of QA send-backs in its stage history (from QA
 * Backlog, In QA or Done back to Issue Raised, To do or In progress). Only the stage flow counts:
 * linked or related issues and Re-Open tags do not.
 */
export function reworkCount(t: MetricTask): number {
  return t.isIssue ? reopenEvents(t).length : 0;
}

// ---------------------------------------------------------------- helpers

export interface CountById {
  id: number;
  count: number;
}

function countBy(tasks: readonly MetricTask[], key: (t: MetricTask) => number): CountById[] {
  const m = new Map<number, number>();
  for (const t of tasks) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return [...m].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

export function groupBy<K>(
  tasks: readonly MetricTask[],
  key: (t: MetricTask) => K,
): Map<K, MetricTask[]> {
  const m = new Map<K, MetricTask[]>();
  for (const t of tasks) {
    const k = key(t);
    const list = m.get(k);
    if (list) list.push(t);
    else m.set(k, [t]);
  }
  return m;
}

/** Rows of the people-or-project breakdowns (DEV-02, 03, 05; QA-02, 04, 05). */
export type GroupBy = 'assignee' | 'project';
export const GROUP_BY = ['assignee', 'project'] as const;

/** Row key: the assignee's user id, or the workgroup id (0 = no project). */
const groupKey = (by: GroupBy) =>
  by === 'project' ? (t: MetricTask) => t.groupId : (t: MetricTask) => t.responsibleId;

export const pct = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 1000) / 10 : 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- Development tab

export interface DevSummary {
  total: number;
  completed: number;
  pending: number;
  /** In On Hold: neither pending nor completed. */
  hold: number;
  ready: number;
  deployed: number;
  overdue: number;
  doneToday: number;
  /** Tasks in board columns that are not in the stage map. */
  unmapped: number;
  /** Sub-line of the Total tile: by employee when assignees are filtered, else by project. */
  split: { by: 'project' | 'assignee'; items: CountById[] } | null;
}

/** DEV-01: the 7 summary tiles. Pass tasks already narrowed by devTasks + applyFilters. */
export function devSummary(
  tasks: readonly MetricTask[],
  ctx: MetricContext,
  f: Filters = {},
): DevSummary {
  const split = f.assigneeIds?.length
    ? { by: 'assignee' as const, items: countBy(tasks, (t) => t.responsibleId) }
    : f.projectIds?.length
      ? { by: 'project' as const, items: countBy(tasks, (t) => t.groupId) }
      : null;
  return {
    total: tasks.length,
    completed: tasks.filter(isSentToQa).length,
    pending: tasks.filter(isPending).length,
    hold: tasks.filter(isOnHold).length,
    ready: tasks.filter(isReady).length,
    deployed: tasks.filter(isDeployed).length,
    overdue: tasks.filter((t) => isOverdue(t, ctx)).length,
    doneToday: tasks.filter((t) => isCompletedToday(t, ctx)).length,
    unmapped: tasks.filter((t) => t.stage === null).length,
    split,
  };
}

/** One part of the DEV-01 tile breakdown. */
export interface SummaryPart {
  key: 'dev' | 'issues' | 'bug' | 'feedback';
  total: number;
  completed: number;
  pending: number;
  hold: number;
  ready: number;
  deployed: number;
  overdue: number;
  doneToday: number;
}

/**
 * DEV-01 tile breakdown by the All / Dev / Issues switch: All splits each tile into Dev and
 * Issues, Issues into Bug and Feedback, Dev has no split. Pass the same tasks as devSummary.
 */
export function devSummaryParts(tasks: readonly MetricTask[], ctx: MetricContext, scope: DevScope) {
  const part = (key: SummaryPart['key'], list: MetricTask[]): SummaryPart => {
    const { total, completed, pending, hold, ready, deployed, overdue, doneToday } = devSummary(
      list,
      ctx,
    );
    return { key, total, completed, pending, hold, ready, deployed, overdue, doneToday };
  };
  if (scope === 'all') {
    return [
      part(
        'dev',
        tasks.filter((t) => !t.isIssue),
      ),
      part(
        'issues',
        tasks.filter((t) => t.isIssue),
      ),
    ];
  }
  if (scope === 'issues') {
    return [
      part(
        'bug',
        tasks.filter((t) => t.issueType === 'bug'),
      ),
      part(
        'feedback',
        tasks.filter((t) => t.issueType === 'feedback'),
      ),
    ];
  }
  return [];
}

export interface AssigneeRow {
  id: number;
  total: number;
  pending: number;
  done: number;
  dueToday: number;
  completedToday: number;
  completedYesterday: number;
  /** Pending and Done split into dev tasks, bugs and feedback (the Pending vs Done tooltip). */
  pendingSplit: WorkSplit;
  doneSplit: WorkSplit;
}

export interface WorkSplit {
  dev: number;
  bug: number;
  feedback: number;
}

const workSplit = (list: readonly MetricTask[]): WorkSplit => ({
  dev: list.filter((t) => !t.isIssue).length,
  bug: list.filter((t) => t.isIssue && t.issueType === 'bug').length,
  feedback: list.filter((t) => t.isIssue && t.issueType === 'feedback').length,
});

function assigneeRow(id: number, list: readonly MetricTask[], ctx: MetricContext): AssigneeRow {
  const pending = list.filter(isPending);
  const done = list.filter(isSentToQa);
  return {
    id,
    total: list.length,
    pending: pending.length,
    done: done.length,
    pendingSplit: workSplit(pending),
    doneSplit: workSplit(done),
    dueToday: list.filter((t) => isDueToday(t, ctx)).length,
    completedToday: list.filter((t) => isCompletedToday(t, ctx)).length,
    completedYesterday: list.filter((t) => isCompletedYesterday(t, ctx)).length,
  };
}

/** DEV-02: one row per assignee (or project), sorted by total, plus a totals row. */
export function assigneeTable(
  tasks: readonly MetricTask[],
  ctx: MetricContext,
  by: GroupBy = 'assignee',
) {
  const rows = [...groupBy(tasks, groupKey(by))]
    .map(([id, list]) => assigneeRow(id, list, ctx))
    .sort((a, b) => b.total - a.total || a.id - b.id);
  return { rows, totals: { ...assigneeRow(0, tasks, ctx), id: 0 } };
}

export type BucketCounts<B extends string> = Record<B, number>;

const zeroBuckets = <B extends string>(keys: readonly B[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as BucketCounts<B>;

/** DEV-03: open (pending) tasks per assignee (or project) by days past deadline. */
export function ageingByAssignee(
  tasks: readonly MetricTask[],
  ctx: MetricContext,
  by: GroupBy = 'assignee',
) {
  const open = tasks.filter(isPending);
  const totals = zeroBuckets(AGEING_BUCKETS);
  const rows = [...groupBy(open, groupKey(by))]
    .map(([id, list]) => {
      const buckets = zeroBuckets(AGEING_BUCKETS);
      for (const t of list) {
        const b = ageingBucket(t, ctx);
        buckets[b]++;
        totals[b]++;
      }
      return { id, total: list.length, buckets };
    })
    .sort((a, b) => b.total - a.total || a.id - b.id);
  return { rows, totals };
}

export interface RankingRow {
  id: number;
  completed: number;
  /** Mean of (deadline - completed) in days; positive = early. */
  avgDaysEarly: number;
  onTimePct: number;
  /** 1-based rank; null when below the minimum number of tasks. */
  rank: number | null;
  badge: boolean;
}

/**
 * DEV-04 speed ranking: lead time = deadline - completedAt for completed tasks with a
 * deadline. Rank by on-time % then average days early; fewer than `minTasks` = unranked.
 * `eligible` limits it to those assignees (the Development department group).
 */
/** DEV-04: a task the speed ranking counts: sent to QA, with a completion time and a deadline. */
export const isRankedTask = (t: MetricTask): boolean =>
  !!t.deadline && isSentToQa(t) && !!completedAt(t);

export function speedRanking(
  tasks: readonly MetricTask[],
  { minTasks = 3, eligible }: { minTasks?: number; eligible?: ReadonlySet<number> } = {},
): RankingRow[] {
  const done = tasks.filter((t) => isRankedTask(t) && (!eligible || eligible.has(t.responsibleId)));

  const rows = [...groupBy(done, (t) => t.responsibleId)].map(([id, list]) => {
    const leads = list.map((t) => diffDays(t.deadline!, completedAt(t)!));
    const onTime = leads.filter((d) => d >= 0).length;
    return {
      id,
      completed: list.length,
      avgDaysEarly: round1(leads.reduce((a, b) => a + b, 0) / leads.length),
      onTimePct: pct(onTime, list.length),
      rank: null as number | null,
      badge: false,
    };
  });

  const order = (a: RankingRow, b: RankingRow) =>
    b.onTimePct - a.onTimePct ||
    b.avgDaysEarly - a.avgDaysEarly ||
    b.completed - a.completed ||
    a.id - b.id;
  const ranked = rows.filter((r) => r.completed >= minTasks).sort(order);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
    r.badge = i < 3;
  });
  const unranked = rows.filter((r) => r.completed < minTasks).sort(order);
  return [...ranked, ...unranked];
}

/**
 * DEV-05: assignee (or project) x stage counts, optionally narrowed to one tag; tags listed
 * for the toggle.
 */
export function stageMatrix(
  tasks: readonly MetricTask[],
  { tag, by = 'assignee', ctx }: { tag?: string; by?: GroupBy; ctx?: MetricContext } = {},
) {
  const tagCounts = new Map<string, { value: string; count: number }>();
  for (const t of tasks) {
    for (const raw of t.tags) {
      const n = normalizeTag(raw) || raw;
      const e = tagCounts.get(n) ?? { value: raw, count: 0 };
      e.count++;
      tagCounts.set(n, e);
    }
  }
  const scoped = tag
    ? tasks.filter((t) => t.tags.some((x) => normalizeTag(x) === normalizeTag(tag)))
    : tasks;

  const rows = [...groupBy(scoped, groupKey(by))]
    .map(([id, list]) => {
      const zero = () =>
        Object.fromEntries(STAGE_TITLES.map((s) => [s, 0])) as Record<StageTitle, number>;
      const cells = zero();
      // Part of each cell that is overdue (only pending stages can be).
      const overdue = zero();
      for (const t of list) {
        if (!t.stage) continue;
        cells[t.stage] = (cells[t.stage] ?? 0) + 1;
        if (ctx && isOverdue(t, ctx)) overdue[t.stage] = (overdue[t.stage] ?? 0) + 1;
      }
      return { id, total: list.length, cells, overdue };
    })
    .sort((a, b) => b.total - a.total || a.id - b.id);
  const max = Math.max(0, ...rows.flatMap((r) => Object.values(r.cells)));
  return {
    stages: STAGE_TITLES,
    rows,
    max,
    tags: [...tagCounts.values()].sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------- QA tab

/** QA-01 "Last filed": the latest created date of the issues and how many were filed on it. */
export function lastFiled(list: readonly MetricTask[], ctx: MetricContext) {
  if (!list.length) return null;
  let latest = list[0]!.createdAt;
  for (const t of list) if (t.createdAt > latest) latest = t.createdAt;
  const date = dayKey(latest, ctx.tz);
  return {
    date,
    isToday: date === dayKey(ctx.now, ctx.tz),
    count: list.filter((t) => dayKey(t.createdAt, ctx.tz) === date).length,
  };
}

/**
 * The issue trend lines, one value per day: bugs and feedback filed (created) that day, and bugs
 * and feedback resolved that day (pushed to QA Backlog, as Last resolved; once per issue per day).
 */
export interface TrendSeries {
  bug: number[];
  feedback: number[];
  bugResolved: number[];
  feedbackResolved: number[];
}

const trendOf = (list: readonly MetricTask[], days: readonly string[], tz: string): TrendSeries => {
  const zero = () => days.map(() => 0);
  const out: TrendSeries = {
    bug: zero(),
    feedback: zero(),
    bugResolved: zero(),
    feedbackResolved: zero(),
  };
  for (const t of list) {
    if (!t.issueType) continue;
    const i = days.indexOf(dayKey(t.createdAt, tz));
    if (i >= 0) out[t.issueType][i]! += 1;
    const resolved = t.issueType === 'bug' ? out.bugResolved : out.feedbackResolved;
    for (const d of qaBacklogDays(t, tz)) {
      const j = days.indexOf(d);
      if (j >= 0) resolved[j]! += 1;
    }
  }
  return out;
};

/**
 * QA issue trend: bugs and feedback filed, and issues resolved, on each of the last `n` days, today
 * included (APP_TIMEZONE), overall and per assignee (or project). Rows with neither are left out.
 */
export function issueTrend(
  list: readonly MetricTask[],
  ctx: MetricContext,
  by: GroupBy = 'assignee',
  n = 7,
) {
  const days = Array.from({ length: n }, (_, i) =>
    dayKey(new Date(ctx.now.getTime() - (n - 1 - i) * 86_400_000), ctx.tz),
  );
  const rows = [...groupBy(list, groupKey(by))]
    .map(([id, l]) => ({ id, ...trendOf(l, days, ctx.tz) }))
    .map((r) => ({
      ...r,
      total: [...r.bug, ...r.feedback, ...r.bugResolved, ...r.feedbackResolved].reduce(
        (a, b) => a + b,
        0,
      ),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.id - b.id);
  return { days, totals: trendOf(list, days, ctx.tz), rows };
}

/**
 * QA-01 Last resolved: the latest day issues were pushed to QA Backlog (a developer's fix handed to
 * QA), and how many issues were pushed that day (re-pushes after a send-back included).
 */
export function lastResolved(list: readonly MetricTask[], ctx: MetricContext) {
  let date: string | null = null;
  for (const t of list) for (const d of qaBacklogDays(t, ctx.tz)) if (!date || d > date) date = d;
  if (!date) return null;
  return {
    date,
    isToday: date === dayKey(ctx.now, ctx.tz),
    count: list.filter((t) => qaBacklogDays(t, ctx.tz).includes(date)).length,
  };
}

/** QA-01 tiles. Pass issues already filtered. */
/** One part of the QA-01 tile breakdown. */
export interface QaSummaryPart {
  key: IssueType;
  total: number;
  open: number;
  /** Issues of this type filed on the overall Last filed day (not this type's own latest day). */
  lastFiled: number;
  /** Issues of this type pushed to QA Backlog on the overall Last resolved day. */
  lastResolved: number;
  rework: number;
  hold: number;
}

/** QA-01 tile breakdown: every tile split into Bug and Feedback; the parts add up to the tile. */
export function qaSummaryParts(list: readonly MetricTask[], ctx: MetricContext): QaSummaryPart[] {
  const day = lastFiled(list, ctx)?.date;
  const resolvedDay = lastResolved(list, ctx)?.date;
  return (['bug', 'feedback'] as const).map((key) => {
    const sub = list.filter((t) => t.issueType === key);
    return {
      key,
      total: sub.length,
      open: sub.filter(isOpenIssue).length,
      hold: sub.filter(isOnHold).length,
      lastFiled: day ? sub.filter((t) => dayKey(t.createdAt, ctx.tz) === day).length : 0,
      lastResolved: resolvedDay
        ? sub.filter((t) => qaBacklogDays(t, ctx.tz).includes(resolvedDay)).length
        : 0,
      rework: sub.filter((t) => reworkCount(t) > 0).length,
    };
  });
}

export function qaSummary(list: readonly MetricTask[], ctx: MetricContext) {
  const resolved = list.filter(isSentToQa).length;
  const hold = list.filter(isOnHold).length;
  const rework = list.map((t) => reworkCount(t));
  const reworkIssues = rework.filter((n) => n > 0).length;
  return {
    total: list.length,
    open: list.length - resolved - hold,
    resolved,
    hold,
    resolvedPct: pct(resolved, list.length),
    openPct: pct(list.length - resolved - hold, list.length),
    lastFiled: lastFiled(list, ctx),
    lastResolved: lastResolved(list, ctx),
    reworkIssues,
    reworkPct: pct(reworkIssues, list.length),
    reworkTotal: rework.reduce((a, b) => a + b, 0),
  };
}

/** QA-02: open vs resolved and bug vs feedback per developer (or project). */
export function issuesByAssignee(list: readonly MetricTask[], by: GroupBy = 'assignee') {
  return [...groupBy(list, groupKey(by))]
    .map(([id, l]) => {
      const open = l.filter(isOpenIssue).length;
      // Open = pending, resolved = completed; on-hold issues are in neither.
      const n = (o: boolean, type: IssueType) =>
        l.filter((t) => (o ? isOpenIssue(t) : isSentToQa(t)) && t.issueType === type).length;
      return {
        id,
        total: l.length,
        open,
        resolved: l.filter(isSentToQa).length,
        hold: l.filter(isOnHold).length,
        bug: l.filter((t) => t.issueType === 'bug').length,
        feedback: l.filter((t) => t.issueType === 'feedback').length,
        // Cross split, so the chart can show bug / feedback inside open / resolved and back.
        openBug: n(true, 'bug'),
        openFeedback: n(true, 'feedback'),
        resolvedBug: n(false, 'bug'),
        resolvedFeedback: n(false, 'feedback'),
      };
    })
    .sort((a, b) => b.total - a.total || a.id - b.id);
}

/** QA-03 table: one row per assignee (or project): bug, feedback, total and a count per stage. */
export interface IssueStageRow {
  id: number;
  total: number;
  bug: number;
  feedback: number;
  cells: Record<StageTitle, number>;
}

/** QA-03 as a table, like the assignee-wise table: rows by assignee or project, totals row. */
export function issueStageTable(list: readonly MetricTask[], by: GroupBy = 'assignee') {
  const row = (id: number, l: readonly MetricTask[]): IssueStageRow => {
    const cells = Object.fromEntries(STAGE_TITLES.map((s) => [s, 0])) as Record<StageTitle, number>;
    for (const t of l) if (t.stage) cells[t.stage] = (cells[t.stage] ?? 0) + 1;
    return {
      id,
      total: l.length,
      bug: l.filter((t) => t.issueType === 'bug').length,
      feedback: l.filter((t) => t.issueType === 'feedback').length,
      cells,
    };
  };
  const rows = [...groupBy(list, groupKey(by))]
    .map(([id, l]) => row(id, l))
    .sort((a, b) => b.total - a.total || a.id - b.id);
  const totals = row(0, list);
  // Only stages that hold issues, in board order, so the table stays narrow.
  const stages = STAGE_TITLES.filter((s) => (totals.cells[s] ?? 0) > 0);
  return { stages, rows, totals };
}

/** QA-03: issues per stage in board order, plus unmapped. */
export function issuesByStage(list: readonly MetricTask[]) {
  const stages = STAGE_TITLES.map((stage) => ({
    stage,
    count: list.filter((t) => t.stage === stage).length,
  }));
  return { stages, unmapped: list.filter((t) => t.stage === null).length };
}

/** QA-04: open issues per assignee (or project) by days since created. */
export function issueAgeByAssignee(
  list: readonly MetricTask[],
  ctx: MetricContext,
  by: GroupBy = 'assignee',
) {
  const totals = zeroBuckets(ISSUE_AGE_BUCKETS);
  const rows = [...groupBy(list.filter(isOpenIssue), groupKey(by))]
    .map(([id, l]) => {
      const buckets = zeroBuckets(ISSUE_AGE_BUCKETS);
      for (const t of l) {
        const b = issueAgeBucket(t, ctx);
        buckets[b]++;
        totals[b]++;
      }
      return { id, total: l.length, buckets };
    })
    .sort((a, b) => b.total - a.total || a.id - b.id);
  return { rows, totals };
}

/** Rework of one issue type: send-backs, issues with any, and the issues of that type. */
function reworkOf(l: readonly MetricTask[]) {
  const counts = l.map((t) => reworkCount(t));
  return {
    rework: counts.reduce((a, b) => a + b, 0),
    reworkIssues: counts.filter((n) => n > 0).length,
    issues: l.length,
  };
}

/**
 * QA-05: rework count and % of each developer's (or project's) issues that are rework, with the
 * same numbers split into bugs and feedback.
 */
export function reworkByDeveloper(list: readonly MetricTask[], by: GroupBy = 'assignee') {
  return [...groupBy(list, groupKey(by))]
    .map(([id, l]) => {
      const all = reworkOf(l);
      return {
        id,
        ...all,
        reworkPct: pct(all.reworkIssues, all.issues),
        bug: reworkOf(l.filter((t) => t.issueType === 'bug')),
        feedback: reworkOf(l.filter((t) => t.issueType === 'feedback')),
      };
    })
    .filter((r) => r.rework > 0)
    .sort((a, b) => b.rework - a.rework || a.id - b.id);
}

/** QA-06: testing team workload per assignee. Pass testingTasks(...) after filters. */
export function testingWorkload(list: readonly MetricTask[], ctx: MetricContext) {
  return [...groupBy(list, (t) => t.responsibleId)]
    .map(([id, l]) => {
      const upcoming = l
        .filter((t) => isPending(t) && t.deadline && t.deadline >= ctx.now)
        .map((t) => t.deadline!)
        .sort((a, b) => a.getTime() - b.getTime());
      return {
        id,
        isTester: ctx.testers.has(id),
        total: l.length,
        pending: l.filter(isPending).length,
        done: l.filter(isSentToQa).length,
        dueToday: l.filter((t) => isDueToday(t, ctx)).length,
        overdue: l.filter((t) => isOverdue(t, ctx)).length,
        nextDeadline: upcoming[0] ?? null,
      };
    })
    .sort((a, b) => Number(b.isTester) - Number(a.isTester) || b.total - a.total || a.id - b.id);
}

/** Waiting for QA: in the QA entry stage or in testing (QA Backlog, In QA by default). */
export const isWaitingForRetest = (t: MetricTask) =>
  hasRole(t.stage, 'qaEntry') || hasRole(t.stage, 'testing');

/** Days an issue has waited in its current QA stage (since it last entered it). */
export function waitingDays(t: MetricTask, ctx: MetricContext): number {
  const entered = [...t.events].reverse().find((e) => e.to === t.stage)?.at ?? t.changedAt;
  return Math.max(0, daysBetween(entered, ctx.now, ctx.tz));
}

/** QA-07: issues in QA Backlog / In QA, grouped by creator (who retests them). */
export function waitingForRetest(list: readonly MetricTask[], ctx: MetricContext) {
  const waiting = list.filter(isWaitingForRetest);
  const byCreator = [...groupBy(waiting, (t) => t.createdBy)]
    .map(([id, l]) => ({
      id,
      count: l.length,
      oldestDays: Math.max(...l.map((t) => waitingDays(t, ctx))),
    }))
    .sort((a, b) => b.count - a.count || b.oldestDays - a.oldestDays || a.id - b.id);
  return { total: waiting.length, byCreator };
}

/** Retest counts of one row: dev tasks and issues, in QA Backlog and in In QA. */
export interface RetestCounts {
  total: number;
  dev: number;
  issues: number;
  qaBacklog: number;
  inQa: number;
  qaBacklogDev: number;
  qaBacklogIssues: number;
  inQaDev: number;
  inQaIssues: number;
}

function retestCounts(list: readonly MetricTask[]): RetestCounts {
  const c = (stage: StageTitle, issue: boolean) =>
    list.filter((t) => t.stage === stage && t.isIssue === issue).length;
  const qa = stageWithRole('qaEntry');
  const testing = stageWithRole('testing');
  const qaBacklogDev = qa ? c(qa, false) : 0;
  const qaBacklogIssues = qa ? c(qa, true) : 0;
  const inQaDev = testing ? c(testing, false) : 0;
  const inQaIssues = testing ? c(testing, true) : 0;
  return {
    total: qaBacklogDev + qaBacklogIssues + inQaDev + inQaIssues,
    dev: qaBacklogDev + inQaDev,
    issues: qaBacklogIssues + inQaIssues,
    qaBacklog: qaBacklogDev + qaBacklogIssues,
    inQa: inQaDev + inQaIssues,
    qaBacklogDev,
    qaBacklogIssues,
    inQaDev,
    inQaIssues,
  };
}

/**
 * QA tab "Retesting awaited": every task waiting for QA (QA Backlog or In QA), dev tasks and
 * issues, in total and per assignee or project.
 */
export function retestBreakdown(tasks: readonly MetricTask[], by: GroupBy = 'assignee') {
  const waiting = tasks.filter(isWaitingForRetest);
  const rows = [...groupBy(waiting, groupKey(by))]
    .map(([id, l]) => ({ id, ...retestCounts(l) }))
    .sort((a, b) => b.total - a.total || a.id - b.id);
  return { totals: retestCounts(waiting), rows };
}

// ---------------------------------------------------------------- alerts

/** A task sitting longer than this many days in one stage (LIVE aside) raises an alert. */
export const STUCK_DAYS = 5;

/**
 * When the task entered its current stage: the last move into it from the stage log. A task
 * never moved on the board has been in To do since it was created; with no matching move
 * (history not recorded), the last change is the best guess.
 */
export function stageEnteredAt(t: MetricTask): Date {
  for (let i = t.events.length - 1; i >= 0; i--) {
    if (t.events[i]!.to === t.stage) return t.events[i]!.at;
  }
  return hasRole(t.stage, 'start') ? t.createdAt : t.changedAt;
}

/** Whole calendar days in the current stage (app time zone). */
export const daysInStage = (t: MetricTask, ctx: MetricContext): number =>
  Math.max(0, daysBetween(stageEnteredAt(t), ctx.now, ctx.tz));

/** In a stage other than LIVE for more than STUCK_DAYS days. */
export const isStuck = (t: MetricTask, ctx: MetricContext): boolean =>
  t.stage !== null && !hasRole(t.stage, 'live') && daysInStage(t, ctx) > STUCK_DAYS;

/** Who an alert names: the assignee, or for work waiting in QA the tester who must act. */
export interface AlertOwner {
  id: number;
  role: 'assignee' | 'tester' | 'qaLead';
}

/**
 * In QA Backlog or In QA the next step is the tester's: the creator when they are in the QA
 * Testing team, otherwise the QA lead. In every other stage it is the assignee.
 */
export function alertOwner(t: MetricTask, ctx: MetricContext): AlertOwner {
  if (isWaitingForRetest(t)) {
    if (ctx.testers.has(t.createdBy)) return { id: t.createdBy, role: 'tester' };
    if (ctx.qaLead) return { id: ctx.qaLead, role: 'qaLead' };
  }
  return { id: t.responsibleId, role: 'assignee' };
}

export interface OverdueAlert {
  /** The assignee (overdue tasks are always in developer stages). */
  personId: number;
  role: AlertOwner['role'];
  projectId: number;
  count: number;
  /** Days past deadline of the latest task in the group. */
  oldestDays: number;
}

export interface StuckAlert {
  /** alertOwner(): the assignee, or the tester / QA lead for QA Backlog and In QA. */
  personId: number;
  /** 'qaLead' when any task in the group reached this person as QA lead. */
  role: AlertOwner['role'];
  projectId: number;
  stage: StageTitle;
  count: number;
  /** Days in the stage of the longest-waiting task. */
  oldestDays: number;
}

/**
 * Header alerts: overdue tasks per assignee and project, and tasks stuck more than STUCK_DAYS
 * days in a stage (LIVE aside) per person (alertOwner), project and stage. Largest groups first.
 */
export function alerts(tasks: readonly MetricTask[], ctx: MetricContext) {
  const key = (...parts: (string | number)[]) => parts.join('|');
  const overdue = new Map<string, OverdueAlert>();
  const stuck = new Map<string, StuckAlert>();
  for (const t of tasks) {
    if (isOverdue(t, ctx)) {
      const k = key(t.responsibleId, t.groupId);
      const a = overdue.get(k) ?? {
        personId: t.responsibleId,
        role: 'assignee' as const,
        projectId: t.groupId,
        count: 0,
        oldestDays: 0,
      };
      a.count++;
      a.oldestDays = Math.max(a.oldestDays, ageingDays(t, ctx) ?? 0);
      overdue.set(k, a);
    }
    if (isStuck(t, ctx)) {
      const owner = alertOwner(t, ctx);
      // One line per person: a QA lead who also filed some of the issues is listed once.
      const k = key(owner.id, t.groupId, t.stage!);
      const a = stuck.get(k) ?? {
        personId: owner.id,
        role: owner.role,
        projectId: t.groupId,
        stage: t.stage!,
        count: 0,
        oldestDays: 0,
      };
      a.count++;
      a.oldestDays = Math.max(a.oldestDays, daysInStage(t, ctx));
      if (owner.role === 'qaLead') a.role = 'qaLead';
      stuck.set(k, a);
    }
  }
  const order = <A extends { count: number; oldestDays: number }>(list: A[]) =>
    list.sort((a, b) => b.count - a.count || b.oldestDays - a.oldestDays);
  return { overdue: order([...overdue.values()]), stuck: order([...stuck.values()]) };
}

/**
 * What the alert's filtered Bitrix24 board shows: every task in the project and stage (of any
 * age, since Bitrix24 cannot filter by days in a stage), narrowed by responsible person or
 * creator like the link. Lets the alert say e.g. "479 over 5 days, 508 in Done in Bitrix24".
 */
export function boardStageCount(
  tasks: readonly MetricTask[],
  projectId: number,
  stage: StageTitle,
  { responsibleId, createdBy }: { responsibleId?: number; createdBy?: number } = {},
): number {
  return tasks.filter(
    (t) =>
      t.groupId === projectId &&
      t.stage === stage &&
      (!responsibleId || t.responsibleId === responsibleId) &&
      (!createdBy || t.createdBy === createdBy),
  ).length;
}

// ---------------------------------------------------------------- lists

export const DEV_PRESETS = [
  'total',
  'completed',
  'pending',
  'ready',
  'deployed',
  'overdue',
  'doneToday',
  'doneYesterday',
  'dueToday',
  'hold',
  'spill',
  'donePrev',
  'overduePeriod',
] as const;
export const ISSUE_PRESETS = [
  'all',
  'open',
  'resolved',
  'lastFiled',
  'lastResolved',
  'rework',
  'retest',
  'hold',
] as const;
export type DevPreset = (typeof DEV_PRESETS)[number];
export type IssuePreset = (typeof ISSUE_PRESETS)[number];

/** Row predicate for a tile click / accordion (DEV-06..08, QA-08, QA-09). */
export function presetPredicate(
  preset: DevPreset | IssuePreset,
  ctx: MetricContext,
  {
    lastFiledDate,
    lastResolvedDate,
    period = 'day',
  }: {
    lastFiledDate?: string | null;
    lastResolvedDate?: string | null;
    /** For spill, donePrev and overduePeriod (Projects at work Day / Week / Month). */
    period?: WorkPeriod;
  } = {},
): (t: MetricTask) => boolean {
  switch (preset) {
    case 'total':
    case 'all':
      return () => true;
    case 'completed':
      return isSentToQa;
    case 'pending':
      return isPending;
    case 'ready':
      return isReady;
    case 'deployed':
      return isDeployed;
    case 'overdue':
      return (t) => isOverdue(t, ctx);
    case 'doneToday':
      return (t) => isCompletedToday(t, ctx);
    case 'doneYesterday':
      return (t) => isCompletedYesterday(t, ctx);
    case 'spill':
      return (t) => isSpill(t, ctx, period);
    case 'donePrev':
      return (t) => isDonePrev(t, ctx, period);
    case 'overduePeriod':
      return (t) => isOverdueInPeriod(t, ctx, period);
    case 'dueToday':
      return (t) => isDueToday(t, ctx);
    case 'open':
      return isOpenIssue;
    case 'resolved':
      return isSentToQa;
    case 'hold':
      return isOnHold;
    case 'lastFiled':
      return (t) => !!lastFiledDate && dayKey(t.createdAt, ctx.tz) === lastFiledDate;
    case 'lastResolved':
      return (t) => !!lastResolvedDate && qaBacklogDays(t, ctx.tz).includes(lastResolvedDate);
    case 'rework':
      return (t) => reworkCount(t) > 0;
    case 'retest':
      return isWaitingForRetest;
  }
}

// ---------------------------------------------------------------- tasks in hand (2026-10-12)

/**
 * Tasks in hand: open tasks whose deadline is still ahead, by when they are planned (deadline in
 * the app time zone). The windows overlap on purpose: tomorrow is also in the rest of this week,
 * and next week can be in the rest of this month. "ahead" is all of them (deadline from now on).
 */
export const DUE_WINDOWS = [
  'ahead',
  'tomorrow',
  'restWeek',
  'restMonth',
  'nextWeek',
  'nextMonth',
] as const;
export type DueWindow = (typeof DUE_WINDOWS)[number];

const keyPlus = (key: string, days: number) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** The window's first and last day (YYYY-MM-DD, inclusive); null for "ahead". */
export function dueWindowRange(
  w: DueWindow,
  ctx: MetricContext,
): { from: string; to: string } | null {
  const today = dayKey(ctx.now, ctx.tz);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const isoDow = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const sunday = keyPlus(today, 7 - isoDow);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const tomorrow = keyPlus(today, 1);
  switch (w) {
    case 'ahead':
      return null;
    case 'tomorrow':
      return { from: tomorrow, to: tomorrow };
    case 'restWeek':
      return { from: tomorrow, to: sunday };
    case 'restMonth':
      return { from: tomorrow, to: monthEnd };
    case 'nextWeek':
      return { from: keyPlus(sunday, 1), to: keyPlus(sunday, 7) };
    case 'nextMonth':
      return {
        from: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
        to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10),
      };
  }
}

/** The deadline is still ahead and falls in the window (openness is the caller's rule). */
export function isDueIn(t: MetricTask, ctx: MetricContext, w: DueWindow): boolean {
  if (!t.deadline || t.deadline < ctx.now) return false;
  const r = dueWindowRange(w, ctx);
  if (!r) return true;
  const k = dayKey(t.deadline, ctx.tz);
  return k >= r.from && k <= r.to;
}

/** Counts per window of the open tasks (default: pending, as on the Development tab). */
export function tasksInHand(
  list: readonly MetricTask[],
  ctx: MetricContext,
  open: (t: MetricTask) => boolean = isPending,
): Record<DueWindow, number> {
  const mine = list.filter(open);
  return Object.fromEntries(
    DUE_WINDOWS.map((w) => [w, mine.filter((t) => isDueIn(t, ctx, w)).length]),
  ) as Record<DueWindow, number>;
}

/** Tasks in hand per assignee or project (rows with any in hand, most first) and the totals. */
export function inHandByGroup(
  list: readonly MetricTask[],
  ctx: MetricContext,
  by: GroupBy,
  open: (t: MetricTask) => boolean = isPending,
) {
  const mine = list.filter(open);
  const rows = [...groupBy(mine, groupKey(by))]
    .map(([id, l]) => ({ id, ...tasksInHand(l, ctx, () => true) }))
    .filter((r) => r.ahead > 0)
    .sort((a, b) => b.ahead - a.ahead || a.id - b.id);
  return { rows, totals: tasksInHand(mine, ctx, () => true) };
}

// ---------------------------------------------------------------- projects at work (2026-10-13)

/** A project is active with any task activity in this many days, else silent (2026-10-13). */
export const SILENT_PROJECT_DAYS = 30;
/** "Activity this week": tasks touched in this many days (sorts the projects). */
export const ACTIVITY_DAYS = 7;
/**
 * A minute in which this many tasks of one project were touched is a bulk change (a clean-up or a
 * bulk edit), not work: those touches count as no activity.
 */
export const BULK_TOUCH_MIN = 10;

/** Tasks whose last activity was part of a bulk change (BULK_TOUCH_MIN in one minute). */
export function bulkTouchedIds(list: readonly MetricTask[]): Set<number> {
  const byMinute = new Map<number, number[]>();
  for (const t of list) {
    const m = Math.floor(lastActivity(t).getTime() / 60_000);
    const ids = byMinute.get(m) ?? [];
    ids.push(t.id);
    byMinute.set(m, ids);
  }
  const out = new Set<number>();
  for (const ids of byMinute.values())
    if (ids.length >= BULK_TOUCH_MIN) ids.forEach((id) => out.add(id));
  return out;
}

/** The task's last activity: its last change in Bitrix24 or its last stage move. */
export function lastActivity(t: MetricTask): Date {
  const moved = t.events.length ? t.events[t.events.length - 1]!.at : null;
  return moved && moved > t.changedAt ? moved : t.changedAt;
}

export interface WorkCounts {
  /** Pending (behind QA Backlog, not on hold). */
  open: number;
  /** In On Hold (not completed). */
  hold: number;
  total: number;
  /** Pushed to QA Backlog in the previous day / week / month. */
  done: number;
  /** Overdue, with the deadline in the current day / week / month. */
  overdue: number;
  /** Due in the previous day / week / month, not completed by its end. */
  spill: number;
  /** The latest task deadline (the project's deadline on a project row). */
  lastDeadline: Date | null;
  /** Tasks touched (changed or moved) in the last ACTIVITY_DAYS days, bulk changes left out. */
  activityWeek: number;
  lastActivity: Date | null;
}

function workCounts(
  list: readonly MetricTask[],
  ctx: MetricContext,
  bulk: ReadonlySet<number>,
  period: WorkPeriod,
): WorkCounts {
  const weekCut = ctx.now.getTime() - ACTIVITY_DAYS * 86_400_000;
  let lastDeadline: Date | null = null;
  let last: Date | null = null;
  let activityWeek = 0;
  for (const t of list) {
    if (t.deadline && (!lastDeadline || t.deadline > lastDeadline)) lastDeadline = t.deadline;
    if (bulk.has(t.id)) continue;
    const a = lastActivity(t);
    if (!last || a > last) last = a;
    if (a.getTime() >= weekCut) activityWeek += 1;
  }
  return {
    open: list.filter(isPending).length,
    hold: list.filter(isOnHold).length,
    total: list.length,
    done: list.filter((t) => isDonePrev(t, ctx, period)).length,
    overdue: list.filter((t) => isOverdueInPeriod(t, ctx, period)).length,
    spill: list.filter((t) => isSpill(t, ctx, period)).length,
    lastDeadline,
    activityWeek,
    lastActivity: last,
  };
}

/**
 * Where a project stands on the Projects tile: on hold (every unfinished task is in On Hold),
 * active (open tasks and activity in the last SILENT_PROJECT_DAYS days) or silent (the rest:
 * nothing open, or no activity).
 */
export type ProjectStatus = 'active' | 'silent' | 'hold';

export interface ProjectWork extends WorkCounts {
  id: number;
  status: ProjectStatus;
  /** status === 'active' (kept for older callers). */
  active: boolean;
  /** Who works on it: one row per assignee with open tasks in it, most active this week first. */
  people: (WorkCounts & { id: number })[];
}

/**
 * Development tab "Projects" (2026-10-13): a set of projects (the caller picks them: active in
 * Bitrix24, owned by the Development or QA department or a PM), each On hold (every unfinished
 * task in On Hold), Active (open tasks and activity in the last SILENT_PROJECT_DAYS days, from all
 * its tasks, bulk changes left out) or Silent (the rest). Every project given is listed. Open, done,
 * overdue, spill and the people come from `list` (the tab's scope and filters), so a project with
 * none of them there still counts. Most active this week first, then the earliest deadline.
 */
export function projectWork(
  list: readonly MetricTask[],
  ctx: MetricContext,
  period: WorkPeriod = 'day',
  {
    projectIds,
    allTasks = list,
  }: {
    /** The projects to show (default: every project in `list`). */
    projectIds?: readonly number[];
    /** Every task of those projects, for Active / Silent and activity (default: `list`). */
    allTasks?: readonly MetricTask[];
  } = {},
): ProjectWork[] {
  const cut = ctx.now.getTime() - SILENT_PROJECT_DAYS * 86_400_000;
  const inScope = groupBy(
    list.filter((t) => t.groupId > 0),
    (t) => t.groupId,
  );
  const everything = groupBy(
    allTasks.filter((t) => t.groupId > 0),
    (t) => t.groupId,
  );
  const ids = projectIds ?? [...inScope.keys()];
  return ids
    .map((id) => {
      const l = inScope.get(id) ?? [];
      const all = everything.get(id) ?? l;
      const bulk = bulkTouchedIds(all);
      // Activity and deadline from all the project's tasks; counts from the tab's scope.
      const overall = workCounts(all, ctx, bulk, period);
      const counts = workCounts(l, ctx, bulk, period);
      // On hold: nothing open and something in On Hold. Active: open tasks and activity in the
      // window. Silent: the rest (nothing open, or no activity).
      const status: ProjectStatus =
        overall.open === 0 && overall.hold > 0
          ? 'hold'
          : overall.open > 0 && !!overall.lastActivity && overall.lastActivity.getTime() >= cut
            ? 'active'
            : 'silent';
      return {
        id,
        ...counts,
        activityWeek: overall.activityWeek,
        lastActivity: overall.lastActivity,
        lastDeadline: overall.lastDeadline,
        status,
        active: status === 'active',
        people: [...groupBy(l, (t) => t.responsibleId)]
          .map(([pid, pl]) => ({ id: pid, ...workCounts(pl, ctx, bulk, period) }))
          // Only people with open tasks in it (2026-10-13); the project line keeps every total.
          .filter((p) => p.open > 0)
          .sort(
            (a, b) =>
              b.activityWeek - a.activityWeek ||
              byDeadline(a.lastDeadline, b.lastDeadline) ||
              a.id - b.id,
          ),
      };
    })
    .sort(
      (a, b) =>
        b.activityWeek - a.activityWeek ||
        byDeadline(a.lastDeadline, b.lastDeadline) ||
        a.id - b.id,
    );
}

/** Earliest deadline first; none last. */
const byDeadline = (a: Date | null, b: Date | null) =>
  a && b ? a.getTime() - b.getTime() : a ? -1 : b ? 1 : 0;

/** The Projects tile: all of them = active + silent. */
/** The Projects tile: all of them = active + silent + on hold. */
export function projectWorkSummary(rows: readonly ProjectWork[]) {
  const count = (s: ProjectStatus) => rows.filter((r) => r.status === s).length;
  return {
    projects: rows.length,
    active: count('active'),
    silent: count('silent'),
    hold: count('hold'),
  };
}
