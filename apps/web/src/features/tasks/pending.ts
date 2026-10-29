// Saved edits waiting to show (2026-10-30). A change goes to Bitrix24 and comes back through the
// sync, so the data still holds the old value for a moment. From the click until the data shows
// the change, the field shows the new value with a spinner, the same in every grid, the task view
// and the Daily update. Kept here (not in the cell) so it survives the editor closing and the task
// view switching back from its form.
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { create } from 'zustand';
import type { TaskRow } from '../../api/types';
import type { EditField } from './TaskActions';

/** Longest wait for the data to show the change; then the field shows what the data says. */
export const PENDING_MAX_MS = 30_000;

export interface Pending {
  /** The new value, shown with the spinner. */
  show: ReactNode;
  /** The field's value when the change was made: once the data differs, it has come through. */
  from: string;
  until: number;
}

interface PendingState {
  items: Record<string, Pending>;
  start: (task: TaskRow, field: EditField, show: ReactNode) => void;
  clear: (taskId: number, field: EditField) => void;
}

const key = (taskId: number, field: EditField) => `${taskId}:${field}`;

/** The field's value as compared before and after. */
export const fieldValue: Record<EditField, (t: TaskRow) => string> = {
  stage: (t) => `${t.stageId ?? 0}|${t.stageTitle ?? t.stage ?? ''}`,
  status: (t) => t.bitrixStatus,
  project: (t) => String(t.project?.id ?? 0),
  assignee: (t) => String(t.assignee.id),
  tags: (t) => t.tags.join(','),
  priority: (t) => t.priority,
  deadline: (t) => t.deadline ?? '',
};

export const usePendingStore = create<PendingState>((set) => ({
  items: {},
  start: (task, field, show) =>
    set((s) => ({
      items: {
        ...s.items,
        [key(task.id, field)]: {
          show,
          from: fieldValue[field](task),
          until: Date.now() + PENDING_MAX_MS,
        },
      },
    })),
  clear: (taskId, field) =>
    set((s) => {
      const k = key(taskId, field);
      if (!(k in s.items)) return s;
      const items = { ...s.items };
      delete items[k];
      return { items };
    }),
}));

/**
 * The field's change still on its way, or undefined. Cleared as soon as the task's data shows a
 * different value than before the change (whatever Bitrix24 made of it), or after 30 s.
 */
export function usePending(task: TaskRow, field: EditField): Pending | undefined {
  const p = usePendingStore((s) => s.items[key(task.id, field)]);
  const clear = usePendingStore((s) => s.clear);
  const now = fieldValue[field](task);
  const arrived = !!p && now !== p.from;
  useEffect(() => {
    if (!p) return;
    if (arrived) return clear(task.id, field);
    const t = setTimeout(() => clear(task.id, field), Math.max(0, p.until - Date.now()));
    return () => clearTimeout(t);
  }, [p, arrived, clear, task.id, field]);
  return p && !arrived ? p : undefined;
}
