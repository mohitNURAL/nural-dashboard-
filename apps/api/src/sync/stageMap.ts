// Resolves a task's Kanban stage by title (never by ID: IDs differ per workgroup).
import {
  DEFAULT_STAGE_ID,
  canonicalStage,
  type StageTitle,
  holdStage,
  stageWithRole,
  type StageRole,
} from '@nural/shared';

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
const STATUS_ROLE: Record<number, StageRole | 'hold'> = {
  // Roles of the workflow (stages.ts), resolved when used.
  1: 'start', // new
  2: 'start', // pending
  3: 'working',
  4: 'ready', // supposedly completed, awaiting control
  5: 'ready', // completed
  6: 'hold', // deferred
};

export function resolveTaskStage(
  task: { groupId: number; stageId: string; status: number },
  map: StageMap,
): ResolvedStage {
  if (task.groupId === 0) {
    const role = STATUS_ROLE[task.status];
    const stage = !role ? null : role === 'hold' ? holdStage() : stageWithRole(role);
    return { title: null, stage };
  }
  if (task.stageId === DEFAULT_STAGE_ID) {
    return {
      title: map.firstByGroup.get(task.groupId)?.title ?? null,
      stage: stageWithRole('start'),
    };
  }
  const info = map.byId.get(task.stageId);
  if (!info) return { title: null, stage: null };
  return { title: info.title, stage: canonicalStage(info.title) };
}
