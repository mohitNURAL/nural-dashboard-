// Core models shared by apps/api and apps/web. Expanded in milestones 3 and 4.
import type { StageGroup, StageTitle } from './stages';

export type { StageGroup, StageTitle };

export type Priority = 'low' | 'normal' | 'high';
export type IssueType = 'bug' | 'feedback';

export interface Task {
  id: number;
  title: string;
  groupId: number;
  stageId: string;
  stage: StageTitle | null;
  priority: Priority;
  responsibleId: number;
  createdBy: number;
  createdAt: string;
  deadline: string | null;
  closedAt: string | null;
  parentId: number | null;
  tags: string[];
  isIssue: boolean;
  issueType: IssueType | null;
  changedAt: string;
}

export interface Issue extends Task {
  isIssue: true;
  issueType: IssueType;
}

export interface Filters {
  projectIds?: number[];
  assigneeIds?: number[];
  tags?: string[];
  dateField?: 'created' | 'deadline';
  from?: string;
  to?: string;
}
