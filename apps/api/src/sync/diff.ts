// What changed between the stored copy of a task and the one just fetched (SRS 8.3 step 4).
import { isReworkMove, type StageTitle } from '@nural/shared';

export interface StoredTask {
  id: number;
  stageId: string;
  stage: string | null;
  groupId: number;
  deleted: boolean;
  changedAt: Date;
  /** Assignee before this change (live-stream scoping: the previous owner is told too). */
  responsibleId?: number;
}

export interface NextTask {
  id: number;
  stageId: string;
  stage: StageTitle | null;
  groupId: number;
  changedAt: Date;
}

export interface TaskDiff {
  isNew: boolean;
  stageChanged: boolean;
  fromStage: StageTitle | null;
  toStage: StageTitle | null;
  /** QA Backlog / In QA / Issue Raised back to To do or In progress (retest failed). */
  reopened: boolean;
  /** Anything worth telling the browser about. */
  changed: boolean;
}

export function diffTask(old: StoredTask | undefined, next: NextTask): TaskDiff {
  const isNew = !old || old.deleted;
  const fromStage = (old?.stage ?? null) as StageTitle | null;
  const stageChanged = !isNew && (old.stageId !== next.stageId || old.groupId !== next.groupId);
  // Same rule as the rework count: sent back from QA Backlog, In QA or Done.
  const reopened = stageChanged && isReworkMove(fromStage, next.stage);
  const changed = isNew || stageChanged || old.changedAt.getTime() !== next.changedAt.getTime();
  return {
    isNew,
    stageChanged,
    fromStage: isNew ? null : fromStage,
    toStage: next.stage,
    reopened,
    changed,
  };
}
