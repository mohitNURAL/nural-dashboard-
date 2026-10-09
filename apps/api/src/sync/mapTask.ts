// Maps a Bitrix24 task (tasks.task.list / tasks.task.get, camelCase keys) to a tasks row.
// Issue rules (bug / feedback / feedbacks / Re-Open tags) live in packages/shared/src/tags.ts.
import { issueTypeOf } from '@nural/shared';
import type { schema } from '../db/client';
import { resolveTaskStage, type StageMap } from './stageMap';

/** Fields requested from tasks.task.list. */
export const TASK_SELECT = [
  'ID',
  'TITLE',
  'GROUP_ID',
  'STAGE_ID',
  'STATUS',
  'PRIORITY',
  'RESPONSIBLE_ID',
  'CREATED_BY',
  'CREATED_DATE',
  'DEADLINE',
  'CLOSED_DATE',
  'CHANGED_DATE',
  'PARENT_ID',
  'TAGS',
];

export interface BitrixTask {
  id: string;
  title: string;
  groupId?: string | null;
  stageId?: string | null;
  status: string;
  priority: string;
  responsibleId: string;
  createdBy: string;
  createdDate: string;
  deadline?: string | null;
  closedDate?: string | null;
  changedDate: string;
  parentId?: string | null;
  tags?: Record<string, { id: number; title: string }> | unknown[] | null;
  /** Only on tasks.task.get. */
  relatedTasks?: (string | number)[] | Record<string, unknown> | null;
  changedBy?: string | null;
}

export type TaskRow = typeof schema.tasks.$inferInsert;

const toInt = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const toDate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function tagTitles(tags: BitrixTask['tags']): string[] {
  if (!tags || Array.isArray(tags)) return [];
  return Object.values(tags)
    .map((t) => t.title.trim())
    .filter(Boolean);
}

export function mapTask(t: BitrixTask, stages: StageMap): TaskRow {
  const tags = tagTitles(t.tags);
  const issueType = issueTypeOf(tags);
  const base = {
    groupId: toInt(t.groupId),
    stageId: String(t.stageId ?? '0'),
    status: toInt(t.status),
  };
  const { title: stageTitle, stage } = resolveTaskStage(base, stages);
  const parentId = toInt(t.parentId);

  return {
    id: toInt(t.id),
    title: t.title,
    ...base,
    stageTitle,
    stage,
    priority: toInt(t.priority),
    responsibleId: toInt(t.responsibleId),
    createdBy: toInt(t.createdBy),
    createdAt: toDate(t.createdDate) ?? new Date(0),
    deadline: toDate(t.deadline),
    closedAt: toDate(t.closedDate),
    changedAt: toDate(t.changedDate) ?? new Date(0),
    parentId: parentId || null,
    tags,
    isIssue: issueType !== null,
    issueType,
    deleted: false,
    raw: t,
  };
}
