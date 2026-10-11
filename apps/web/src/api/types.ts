// Response shapes of apps/api (routes/*.ts). Dates arrive as ISO strings.
import type {
  GroupBy,
  IssueType,
  QaSummaryPart,
  StageGroup,
  StageTitle,
  SummaryPart,
} from '@nural/shared';
import type { DeptGroup } from './queries';

export interface Person {
  id: number;
  name: string;
  deptGroup: DeptGroup;
}

export type { GroupBy } from '@nural/shared';

/**
 * A breakdown row keyed by assignee or project (Assignee / Project switch). `id` is the user
 * or workgroup id (0 = no project); `person` is set only when grouped by assignee.
 */
export interface Named {
  id: number;
  name: string;
  person: Person | null;
}

export type Priority = 'low' | 'normal' | 'high';

/** One task row (routes/context.ts taskRow). */
export interface TaskRow {
  id: number;
  title: string;
  url: string;
  project: { id: number; name: string } | null;
  assignee: Person;
  creator: Person;
  stage: StageTitle | null;
  stageTitle: string | null;
  stageColor: string | null;
  stageGroup: StageGroup | null;
  /** Completed (QA Backlog, In QA, Done, LIVE) or pending (any stage behind). */
  status: 'completed' | 'pending' | 'hold';
  /** Bitrix24 column ID (0 = never moved, To do) and Bitrix24's own task status. */
  stageId: number;
  bitrixStatus: BitrixStatus;
  tags: string[];
  priority: Priority;
  deadline: string | null;
  createdAt: string;
  closedAt: string | null;
  /** Days past deadline for pending tasks (negative = not yet due). */
  ageingDays: number | null;
  overdue: boolean;
  isIssue: boolean;
  issueType: IssueType | null;
  ageDays?: number | null;
  rework?: number;
  linkedTaskId?: number | null;
}

/** Bitrix24 task status: the status dropdown's values, plus two it can show but not set. */
export type BitrixStatus =
  'pending' | 'inProgress' | 'deferred' | 'completed' | 'supposedlyCompleted' | 'declined';

/** One column of a board, in board order (the stage dropdown). */
export interface BoardStage {
  id: number;
  title: string;
  stage: StageTitle | null;
  color: string | null;
}

export interface TaskPage {
  total: number;
  page: number;
  pageSize: number;
  rows: TaskRow[];
  /** Columns of every board on this page, by workgroup ID. */
  boards: Record<string, BoardStage[]>;
}

export interface StageMove {
  from: StageTitle | null;
  to: StageTitle | null;
  at: string;
  by: Person | null;
}

export interface TaskDetail {
  task: TaskRow;
  /** Its board's columns (none for a task outside a workgroup). */
  board: BoardStage[];
  description: string | null;
  timeline: StageMove[];
  reopens: StageMove[];
  parent: TaskRow | null;
  linkedIssues: TaskRow[];
  related: TaskRow[];
}

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
  unmapped: number;
  split: {
    by: 'project' | 'assignee';
    items: { id: number; count: number; name?: string }[];
  } | null;
  /** Tile breakdown: Dev and Issues (All), Bug and Feedback (Issues), none (Dev). */
  parts: SummaryPart[];
  asOf: string;
}

export interface AssigneeRow extends Named {
  total: number;
  pending: number;
  done: number;
  dueToday: number;
  completedToday: number;
  completedYesterday: number;
  /** Pending and Done split into dev tasks, bugs and feedback. */
  pendingSplit: WorkSplit;
  doneSplit: WorkSplit;
}

/** Rework of one issue type: send-backs, issues with any, and the issues of that type. */
export interface ReworkSplit {
  rework: number;
  reworkIssues: number;
  issues: number;
}

/** Per day: bugs and feedback filed, and bugs and feedback resolved (pushed to QA Backlog). */
export interface TrendSeries {
  bug: number[];
  feedback: number[];
  bugResolved: number[];
  feedbackResolved: number[];
}

export interface WorkSplit {
  dev: number;
  bug: number;
  feedback: number;
}

export const AGEING_BUCKETS = ['notDue', '0-2', '3-7', '8-14', '15-30', '30+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export type AgeingCounts = Record<AgeingBucket | 'noDeadline', number>;

export interface DevAssignees {
  groupBy: GroupBy;
  rows: AssigneeRow[];
  totals: Omit<AssigneeRow, 'person' | 'name'>;
  ageing: {
    rows: (Named & { total: number; buckets: AgeingCounts })[];
    totals: AgeingCounts;
  };
}

export interface RankingRow {
  id: number;
  completed: number;
  avgDaysEarly: number;
  onTimePct: number;
  rank: number | null;
  badge: boolean;
  person: Person;
}

export interface DevRanking {
  minTasks: number;
  rows: RankingRow[];
}

export interface DevMatrix {
  groupBy: GroupBy;
  stages: { stage: StageTitle; color: string }[];
  rows: (Named & {
    total: number;
    cells: Record<StageTitle, number>;
    /** Overdue part of each cell. */
    overdue: Record<StageTitle, number>;
  })[];
  max: number;
  tags: { value: string; count: number }[];
}

// ---------------------------------------------------------------- QA tab (routes/qa.ts)

export interface QaSummary {
  total: number;
  open: number;
  resolved: number;
  /** Issues in On Hold: neither open nor resolved. */
  hold: number;
  resolvedPct: number;
  openPct: number;
  lastFiled: { date: string; isToday: boolean; count: number } | null;
  /** Latest day issues were pushed to QA Backlog, and how many that day. */
  lastResolved: { date: string; isToday: boolean; count: number } | null;
  /** Issues with at least one rework; reworkTotal counts every reopen. */
  reworkIssues: number;
  reworkPct: number;
  reworkTotal: number;
  /** Every tile split into Bug and Feedback. */
  parts: QaSummaryPart[];
  asOf: string;
}

export type IssueAgeBucket = '0-2' | '3-7' | '8-14' | '15+';

export interface IssueStageCounts {
  total: number;
  bug: number;
  feedback: number;
  cells: Record<StageTitle, number>;
}

export interface QaIssues {
  groupBy: GroupBy;
  byAssignee: (Named & {
    total: number;
    open: number;
    resolved: number;
    bug: number;
    feedback: number;
    openBug: number;
    openFeedback: number;
    resolvedBug: number;
    resolvedFeedback: number;
  })[];
  /** QA-02 table view: the DEV-02 assignee-wise table, for issues. */
  table: { rows: AssigneeRow[]; totals: Omit<AssigneeRow, 'person' | 'name'> };
  /** Issue ageing (as DEV-03): open issues by days past deadline, per assignee or project. */
  ageing: {
    rows: (Named & { total: number; buckets: AgeingCounts })[];
    totals: AgeingCounts;
  };
  /** QA-03 heat matrix (as DEV-05): per assignee or project, overdue part of each cell. */
  matrix: {
    stages: { stage: StageTitle; color: string }[];
    rows: (Named & {
      total: number;
      cells: Record<StageTitle, number>;
      overdue: Record<StageTitle, number>;
    })[];
    max: number;
  };
  /** QA-03 table: per assignee (or project), stage columns, bug / feedback split. */
  stageTable: {
    stages: { stage: StageTitle; color: string }[];
    rows: (Named & IssueStageCounts)[];
    totals: IssueStageCounts;
  };
  byStage: { stages: { stage: StageTitle; count: number; color: string }[]; unmapped: number };
  age: {
    rows: (Named & { total: number; buckets: Record<IssueAgeBucket, number> })[];
    totals: Record<IssueAgeBucket, number>;
  };
  rework: (Named & {
    issues: number;
    rework: number;
    reworkIssues: number;
    reworkPct: number;
    bug: ReworkSplit;
    feedback: ReworkSplit;
  })[];
  /** Issues filed and resolved on each of the last 7 days (YYYY-MM-DD, oldest first). */
  trend: {
    days: string[];
    totals: TrendSeries;
    rows: (Named & TrendSeries & { total: number })[];
  };
  waitingForRetest: {
    total: number;
    byCreator: { id: number; count: number; oldestDays: number; person: Person }[];
  };
}

export interface TestingRow {
  id: number;
  isTester: boolean;
  total: number;
  pending: number;
  done: number;
  dueToday: number;
  overdue: number;
  nextDeadline: string | null;
  person: Person;
}

export interface QaTesting {
  total: number;
  rows: TestingRow[];
}

// ---------------------------------------------------------------- header alerts (routes/alerts.ts)

export type AlertRole = 'assignee' | 'tester' | 'qaLead';

interface AlertBase {
  personId: number;
  role: AlertRole;
  person: Person;
  projectId: number;
  project: { id: number; name: string } | null;
  /** The project's task board in Bitrix24. */
  boardUrl: string | null;
  count: number;
  oldestDays: number;
}

export interface AlertsResponse {
  stuckDays: number;
  overdue: AlertBase[];
  /** boardCount: what the Bitrix24 link shows (the whole stage, any age). */
  stuck: (AlertBase & { stage: StageTitle; boardCount: number })[];
  total: number;
}

// ---------------------------------------------------------------- KPI tab (SRS 13)

export type KpiDeptKey = 'dev' | 'qa' | 'support' | 'other';
export type Health = 'red' | 'amber' | 'green';
export type OverdueBucket = '1-2' | '3-7' | '8-30' | '30+';

export interface KpiRates {
  closed: number;
  withDeadline: number;
  onTime: number;
  onTimePct: number | null;
  open: number;
  overdue: number;
  overduePct: number;
  reworkCycles: number;
}

export interface KpiSummary {
  period: 'day' | 'week' | 'month';
  range: { start: string; end: string };
  open: number;
  openByDept: Record<KpiDeptKey, number>;
  overdue: number;
  overduePct: number;
  overdueOver30: number;
  closed: number;
  closedPrev: number;
  onTimePct: number | null;
  onTimePrevPct: number | null;
  activeProjects: number;
  silentProjects: number;
  noDeadline: number;
  hold: number;
  noProject: { open: number };
  bulkClosed: number;
  asOf: string;
}

export interface KpiProject {
  id: number;
  name: string;
  owner: Person | null;
  total: number;
  open: number;
  overdue: number;
  oldestOverdueDays: number;
  noDeadline: number;
  completionPct: number;
  rates: KpiRates;
  lastAction: string | null;
  idleWorkingDays: number | null;
  silent: boolean;
  status: Health;
}

export interface KpiWorkload {
  id: number;
  name: string;
  person: Person;
  open: number;
  overdue: number;
  dueSoon: number;
  later: number;
  noDeadline: number;
  projects: number;
}

export interface KpiPerson {
  id: number;
  name: string;
  person: Person;
  dept: KpiDeptKey;
  rates: KpiRates;
  closedPrev: number;
  spark: number[];
  workload: Omit<KpiWorkload, 'name' | 'person'> | null;
}

export interface KpiOverdueGroup {
  id: number;
  name: string;
  total: number;
  buckets: Record<OverdueBucket, number>;
}

export interface KpiOverdue {
  total: number;
  buckets: Record<OverdueBucket, number>;
  byProject: KpiOverdueGroup[];
  byAssignee: KpiOverdueGroup[];
}

export interface KpiActivity {
  hot: {
    id: number;
    name: string;
    owner: Person | null;
    parts: { newTasks: number; bugs: number; moves: number; comments: number };
    spark: number[];
  }[];
  silent: {
    id: number;
    name: string;
    owner: Person | null;
    open: number;
    overdue: number;
    idleWorkingDays: number | null;
    lastAction: string | null;
  }[];
}

export interface KpiInsights {
  insights: { id: string; text: string; params: Record<string, string> }[];
}

/** QA tab "Retesting awaited": tasks in QA Backlog or In QA, dev tasks and issues. */
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

export interface QaRetest {
  groupBy: GroupBy;
  totals: RetestCounts;
  rows: (Named & RetestCounts)[];
}
