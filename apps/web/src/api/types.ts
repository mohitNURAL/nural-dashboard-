// Response shapes of apps/api (routes/*.ts). Dates arrive as ISO strings.
import type { IssueType, StageGroup, StageTitle } from '@nural/shared';
import type { DeptGroup } from './queries';

export interface Person {
  id: number;
  name: string;
  deptGroup: DeptGroup;
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
  asOf: string;
}

export interface AssigneeRow {
  id: number;
  total: number;
  pending: number;
  done: number;
  dueToday: number;
  completedToday: number;
  person: Person;
}

export const AGEING_BUCKETS = ['notDue', '0-2', '3-7', '8-14', '15+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export type AgeingCounts = Record<AgeingBucket | 'noDeadline', number>;

export interface DevAssignees {
  rows: AssigneeRow[];
  totals: Omit<AssigneeRow, 'person'>;
  ageing: {
    rows: { id: number; total: number; buckets: AgeingCounts; person: Person }[];
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
  stages: { stage: StageTitle; color: string }[];
  rows: { id: number; total: number; cells: Record<StageTitle, number>; person: Person }[];
  max: number;
  tags: { value: string; count: number }[];
}
