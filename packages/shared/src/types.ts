// Models shared by apps/api and apps/web.
import type { StageGroup, StageTitle } from './stages';

export type { StageGroup, StageTitle };

export type IssueType = 'bug' | 'feedback';

/** A stage move, from the history backfill or (milestone 5) live webhooks. */
export interface StageEvent {
  from: StageTitle | null;
  to: StageTitle | null;
  at: Date;
  by: number | null;
}

/** A task as the metric functions see it (packages/shared/src/metrics.ts). */
export interface MetricTask {
  id: number;
  title: string;
  /** 0 = outside any workgroup (testing team tasks). */
  groupId: number;
  /** Canonical stage, null when the board column is not in the stage map. */
  stage: StageTitle | null;
  stageTitle: string | null;
  status: number;
  /** Bitrix24 priority: 0 low, 1 normal, 2 high. */
  priority: number;
  responsibleId: number;
  createdBy: number;
  createdAt: Date;
  changedAt: Date;
  deadline: Date | null;
  closedAt: Date | null;
  parentId: number | null;
  relatedIds: number[];
  tags: string[];
  isIssue: boolean;
  issueType: IssueType | null;
  /** Stage moves, oldest first. */
  events: StageEvent[];
  /** Bitrix24 planned start and first start (KPI tab, SRS 13.2); absent in older fixtures. */
  startDatePlan?: Date | null;
  dateStart?: Date | null;
}

export interface MetricContext {
  now: Date;
  /** IANA zone for "today" and "overdue" (APP_TIMEZONE). */
  tz: string;
  /** User IDs in the QA Testing department. */
  testers: ReadonlySet<number>;
  /**
   * User IDs in the Development department. When set, the Development tab only counts tasks
   * assigned to them; when absent (older callers, tests), anyone but testers counts.
   */
  developers?: ReadonlySet<number>;
  /** Head of the QA Testing department (QA lead), for alerts on issues waiting in QA. */
  qaLead?: number | null;
}

export interface Filters {
  projectIds?: number[];
  assigneeIds?: number[];
  tags?: string[];
  issueType?: IssueType;
  dateField?: 'created' | 'deadline';
  /** Inclusive calendar dates (YYYY-MM-DD) in the app time zone. */
  from?: string;
  to?: string;
}
