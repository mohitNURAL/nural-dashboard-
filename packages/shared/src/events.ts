// Live change messages, published by the sync worker and sent to browsers over SSE.
import type { StageGroup, StageTitle } from './stages';

/** Sent to browsers as SSE `task.changed` (SRS 7, module 6). */
export interface TaskChanged {
  type: 'task.changed';
  taskId: number;
  title: string;
  projectId: number;
  stage: StageTitle | null;
  fromStage: StageTitle | null;
  stageGroup: StageGroup | null;
  isIssue: boolean;
  isNew: boolean;
  reopened: boolean;
  deleted: boolean;
  /** workflow: an admin changed the workflow (SRS 22); every page reloads its numbers. */
  source: 'webhook' | 'reconcile' | 'nightly' | 'workflow';
  at: string;
  /**
   * Who may receive it (NFR-4 scoping): assignee, creator and, after a reassignment, the
   * previous assignee. Absent only on the nightly notice (taskId 0), which carries no task.
   */
  people?: number[];
  /**
   * Whose task it is (assignee and, after a reassignment, the previous assignee): a member gets
   * the change only when named here, or as the tester who filed the issue (NFR-4, 2026-10-21).
   */
  assignees?: number[];
}
