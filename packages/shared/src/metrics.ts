// Every dashboard number (SRS sections 3, 4 and 5) as pure functions over MetricTask.
// No I/O and no clock: `now` and the time zone come in through MetricContext.
import {
  DEPLOYED_STAGE,
  QA_STAGES,
  READY_FOR_DEPLOYMENT_STAGE,
  SENT_TO_QA_STAGES,
  STAGE_TITLES,
  stageGroupOf,
  type StageGroup,
  type StageTitle,
} from './stages';
import { hasReopenTag, isTestingTag, normalizeTag } from './tags';
import { dayKey, daysBetween, diffDays } from './time';
import type { Filters, IssueType, MetricContext, MetricTask } from './types';

// ---------------------------------------------------------------- selection

/** Development tab: workgroup tasks that are not issues and not assigned to testers. */
/** Development tab switch: All, Dev (tasks) or Issues (bug and feedback). */
export const DEV_SCOPES = ['all', 'dev', 'issues'] as const;
export type DevScope = (typeof DEV_SCOPES)[number];

/** Assignee is in the Development department (or, without that list, not a tester). */
const isDeveloperTask = (t: MetricTask, ctx: MetricContext) =>
  ctx.developers ? ctx.developers.has(t.responsibleId) : !ctx.testers.has(t.responsibleId);

/**
 * Development tab: work in a workgroup assigned to the Development department. `dev` = tasks
 * (not bug or feedback), `issues` = bugs and feedback, `all` = both.
 */
export const devTasks = (
  tasks: readonly MetricTask[],
  ctx: MetricContext,
  scope: DevScope = 'dev',
): MetricTask[] =>
  tasks.filter(
    (t) =>
      t.groupId !== 0 &&
      isDeveloperTask(t, ctx) &&
      (scope === 'all' || (scope === 'issues') === t.isIssue),
  );

/** QA tab: tasks tagged bug or feedback (or Re-Open). */
export const issues = (tasks: readonly MetricTask[]): MetricTask[] =>
  tasks.filter((t) => t.isIssue);

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

export const isPending = (t: MetricTask) => stageGroup(t) === 'pending';
export const isSentToQa = (t: MetricTask) => stageGroup(t) === 'sentToQa';
export const isReady = (t: MetricTask) => t.stage === READY_FOR_DEPLOYMENT_STAGE;
export const isDeployed = (t: MetricTask) => t.stage === DEPLOYED_STAGE;
/** Issue not in Done or LIVE (unmapped stages count as open). */
export const isOpenIssue = (t: MetricTask) => !isReady(t) && !isDeployed(t);

/**
 * When the task was completed: first move into any Sent-to-QA stage (Complete pressed),
 * else the Bitrix24 closed date. Many boards skip QA Backlog, hence "any" stage.
 */
export function completedAt(t: MetricTask): Date | null {
  const first = t.events.find((e) => e.to && SENT_TO_QA_STAGES.includes(e.to));
  return first?.at ?? t.closedAt ?? null;
}

/** Pending (except On Hold, open question 6) with the deadline passed. */
export const isOverdue = (t: MetricTask, ctx: MetricContext): boolean =>
  isPending(t) && t.stage !== 'On Hold' && !!t.deadline && t.deadline < ctx.now;

/** Deadline date is today in the app time zone, any stage group except Deployed. */
export const isDueToday = (t: MetricTask, ctx: MetricContext): boolean =>
  !!t.deadline && !isDeployed(t) && dayKey(t.deadline, ctx.tz) === dayKey(ctx.now, ctx.tz);

export function isCompletedToday(t: MetricTask, ctx: MetricContext): boolean {
  const at = completedAt(t);
  return !!at && dayKey(at, ctx.tz) === dayKey(ctx.now, ctx.tz);
}

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

/** Moves from a QA stage back to To do or In progress (retest failed, reopened). */
export const reopenEvents = (t: MetricTask) =>
  t.events.filter(
    (e) => e.from && QA_STAGES.includes(e.from) && (e.to === 'To do' || e.to === 'In progress'),
  );

export type TaskIndex = ReadonlyMap<number, MetricTask>;

export const indexTasks = (tasks: readonly MetricTask[]): Map<number, MetricTask> =>
  new Map(tasks.map((t) => [t.id, t]));

/** An issue raised on an issue: its parent or a related task is itself an issue. */
export const isRaisedOnIssue = (t: MetricTask, byId: TaskIndex): boolean =>
  [t.parentId, ...t.relatedIds].some((id) => id != null && id !== t.id && !!byId.get(id)?.isIssue);

/**
 * Rework count for an issue (SRS 5): each reopen move counts 1, being raised on an
 * issue counts 1, and a Re-Open tag counts 1 only when neither already counted it.
 */
export function reworkCount(t: MetricTask, byId: TaskIndex): number {
  if (!t.isIssue) return 0;
  const moves = reopenEvents(t).length;
  const onIssue = isRaisedOnIssue(t, byId) ? 1 : 0;
  const tag = moves === 0 && onIssue === 0 && hasReopenTag(t.tags) ? 1 : 0;
  return moves + onIssue + tag;
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

function groupBy<K>(tasks: readonly MetricTask[], key: (t: MetricTask) => K): Map<K, MetricTask[]> {
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

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- Development tab

export interface DevSummary {
  total: number;
  completed: number;
  pending: number;
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
    ready: tasks.filter(isReady).length,
    deployed: tasks.filter(isDeployed).length,
    overdue: tasks.filter((t) => isOverdue(t, ctx)).length,
    doneToday: tasks.filter((t) => isCompletedToday(t, ctx)).length,
    unmapped: tasks.filter((t) => t.stage === null).length,
    split,
  };
}

export interface AssigneeRow {
  id: number;
  total: number;
  pending: number;
  done: number;
  dueToday: number;
  completedToday: number;
}

function assigneeRow(id: number, list: readonly MetricTask[], ctx: MetricContext): AssigneeRow {
  return {
    id,
    total: list.length,
    pending: list.filter(isPending).length,
    done: list.filter(isSentToQa).length,
    dueToday: list.filter((t) => isDueToday(t, ctx)).length,
    completedToday: list.filter((t) => isCompletedToday(t, ctx)).length,
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
export function speedRanking(
  tasks: readonly MetricTask[],
  { minTasks = 3, eligible }: { minTasks?: number; eligible?: ReadonlySet<number> } = {},
): RankingRow[] {
  const done = tasks
    .map((t) => ({ t, at: completedAt(t) }))
    .filter(
      (x): x is { t: MetricTask; at: Date } =>
        !!x.at &&
        !!x.t.deadline &&
        isSentToQa(x.t) &&
        (!eligible || eligible.has(x.t.responsibleId)),
    );

  const rows = [
    ...groupBy(
      done.map((x) => x.t),
      (t) => t.responsibleId,
    ),
  ].map(([id, list]) => {
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
        cells[t.stage]++;
        if (ctx && isOverdue(t, ctx)) overdue[t.stage]++;
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

/** QA-01 tiles. Pass issues already filtered. `byId` must index all tasks (for rework links). */
export function qaSummary(list: readonly MetricTask[], ctx: MetricContext, byId: TaskIndex) {
  const resolved = list.filter((t) => !isOpenIssue(t)).length;
  const rework = list.map((t) => reworkCount(t, byId));
  const reworkIssues = rework.filter((n) => n > 0).length;
  return {
    total: list.length,
    open: list.length - resolved,
    resolved,
    resolvedPct: pct(resolved, list.length),
    openPct: list.length ? round1(100 - pct(resolved, list.length)) : 0,
    lastFiled: lastFiled(list, ctx),
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
      return {
        id,
        total: l.length,
        open,
        resolved: l.length - open,
        bug: l.filter((t) => t.issueType === 'bug').length,
        feedback: l.filter((t) => t.issueType === 'feedback').length,
      };
    })
    .sort((a, b) => b.total - a.total || a.id - b.id);
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

/** QA-05: rework count and % of each developer's (or project's) issues that are rework. */
export function reworkByDeveloper(
  list: readonly MetricTask[],
  byId: TaskIndex,
  by: GroupBy = 'assignee',
) {
  return [...groupBy(list, groupKey(by))]
    .map(([id, l]) => {
      const counts = l.map((t) => reworkCount(t, byId));
      const reworkIssues = counts.filter((n) => n > 0).length;
      return {
        id,
        issues: l.length,
        rework: counts.reduce((a, b) => a + b, 0),
        reworkIssues,
        reworkPct: pct(reworkIssues, l.length),
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

const RETEST_STAGES: readonly StageTitle[] = ['QA Backlog', 'In QA'];

export const isWaitingForRetest = (t: MetricTask) => !!t.stage && RETEST_STAGES.includes(t.stage);

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

// ---------------------------------------------------------------- lists

export const DEV_PRESETS = [
  'total',
  'completed',
  'pending',
  'ready',
  'deployed',
  'overdue',
  'doneToday',
  'dueToday',
] as const;
export const ISSUE_PRESETS = ['all', 'open', 'resolved', 'lastFiled', 'rework', 'retest'] as const;
export type DevPreset = (typeof DEV_PRESETS)[number];
export type IssuePreset = (typeof ISSUE_PRESETS)[number];

/** Row predicate for a tile click / accordion (DEV-06..08, QA-08, QA-09). */
export function presetPredicate(
  preset: DevPreset | IssuePreset,
  ctx: MetricContext,
  { byId, lastFiledDate }: { byId?: TaskIndex; lastFiledDate?: string | null } = {},
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
    case 'dueToday':
      return (t) => isDueToday(t, ctx);
    case 'open':
      return isOpenIssue;
    case 'resolved':
      return (t) => !isOpenIssue(t);
    case 'lastFiled':
      return (t) => !!lastFiledDate && dayKey(t.createdAt, ctx.tz) === lastFiledDate;
    case 'rework':
      return (t) => !!byId && reworkCount(t, byId) > 0;
    case 'retest':
      return isWaitingForRetest;
  }
}
