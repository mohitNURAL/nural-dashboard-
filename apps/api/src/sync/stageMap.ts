// Resolves a task's Kanban stage by title (never by ID: IDs differ per workgroup).
import { DEFAULT_STAGE_ID, canonicalStage, type StageTitle } from '@nural/shared';

export interface StageInfo {
  id: number;
  groupId: number;
  title: string;
  sort: number;
}

export interface ResolvedStage {
  /** Raw column title on the board, or null when unknown. */
  title: string | null;
  /** Canonical stage, or null when the title is not in the stage map. */
  stage: StageTitle | null;
}

export interface StageMap {
  byId: Map<string, StageInfo>;
  /** First column (lowest sort) of each group: where Bitrix24 shows stage "0" tasks. */
  firstByGroup: Map<number, StageInfo>;
}

export function buildStageMap(stages: StageInfo[]): StageMap {
  const byId = new Map<string, StageInfo>();
  const firstByGroup = new Map<number, StageInfo>();
  for (const s of stages) {
    byId.set(String(s.id), s);
    const first = firstByGroup.get(s.groupId);
    if (!first || s.sort < first.sort) firstByGroup.set(s.groupId, s);
  }
  return { byId, firstByGroup };
}

// Tasks outside any workgroup have no Kanban; derive the stage from the Bitrix24 status.
const STATUS_STAGE: Record<number, StageTitle> = {
  1: 'To do', // new
  2: 'To do', // pending
  3: 'In progress',
  4: 'Done', // supposedly completed, awaiting control
  5: 'Done', // completed
  6: 'On Hold', // deferred
};

export function resolveTaskStage(
  task: { groupId: number; stageId: string; status: number },
  map: StageMap,
): ResolvedStage {
  if (task.groupId === 0) {
    return { title: null, stage: STATUS_STAGE[task.status] ?? null };
  }
  if (task.stageId === DEFAULT_STAGE_ID) {
    return { title: map.firstByGroup.get(task.groupId)?.title ?? null, stage: 'To do' };
  }
  const info = map.byId.get(task.stageId);
  if (!info) return { title: null, stage: null };
  return { title: info.title, stage: canonicalStage(info.title) };
}
