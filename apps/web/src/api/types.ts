// Response shapes of apps/api (routes/*.ts). Dates arrive as ISO strings.
import type { GroupBy, IssueType, StageGroup, StageTitle, SummaryPart } from '@nural/shared';
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

export interface TaskPage {
  total: number;
  page: number;
  pageSize: number;
  rows: TaskRow[];
}

export interface StageMove {
  from: StageTitle | null;
  to: StageTitle | null;
  at: string;
  by: Person | null;
}

export interface TaskDetail {
  task: TaskRow;
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
  resolvedPct: number;
  openPct: number;
  lastFiled: { date: string; isToday: boolean; count: number } | null;
  /** Issues with at least one rework; reworkTotal counts every reopen. */
  reworkIssues: number;
  reworkPct: number;
  reworkTotal: number;
  asOf: string;
}

export type IssueAgeBucket = '0-2' | '3-7' | '8-14' | '15+';

export interface QaIssues {
  groupBy: GroupBy;
  byAssignee: (Named & {
    total: number;
    open: number;
    resolved: number;
    bug: number;
    feedback: number;
  })[];
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
  })[];
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
  stuck: (AlertBase & { stage: StageTitle })[];
  total: number;
}
