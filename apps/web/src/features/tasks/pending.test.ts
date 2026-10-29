// Saved edits waiting to show (2026-10-30).
import { describe, expect, it } from 'vitest';
import type { TaskRow } from '../../api/types';
import { fieldValue, PENDING_MAX_MS, usePendingStore } from './pending';

const task = (over: Partial<TaskRow> = {}) =>
  ({
    id: 41,
    stageId: 7,
    stageTitle: 'In progress',
    stage: 'In progress',
    bitrixStatus: 'inProgress',
    project: { id: 3, name: 'Moto India' },
    assignee: { id: 158, name: 'Vishal' },
    tags: ['bug'],
    priority: 'normal',
    deadline: null,
    ...over,
  }) as unknown as TaskRow;

describe('pending edits', () => {
  it('remembers the value before the change, per task and field, until cleared', () => {
    const { start, clear } = usePendingStore.getState();
    start(task(), 'status', 'Completed');
    const p = usePendingStore.getState().items['41:status'];
    expect(p?.from).toBe('inProgress');
    expect(p!.until - Date.now()).toBeLessThanOrEqual(PENDING_MAX_MS);
    // Another field of the same task is separate.
    expect(usePendingStore.getState().items['41:stage']).toBeUndefined();
    clear(41, 'status');
    expect(usePendingStore.getState().items['41:status']).toBeUndefined();
  });

  it('sees the change come through whatever Bitrix24 made of it', () => {
    const before = task();
    // Completed in a task with approval comes back as Awaiting approval: still a change.
    expect(fieldValue.status(task({ bitrixStatus: 'supposedlyCompleted' }))).not.toBe(
      fieldValue.status(before),
    );
    expect(fieldValue.stage(task({ stageId: 9, stageTitle: 'QA Backlog' }))).not.toBe(
      fieldValue.stage(before),
    );
    expect(fieldValue.tags(task({ tags: ['bug', 'ui'] }))).not.toBe(fieldValue.tags(before));
    // An unrelated refetch keeps it pending.
    expect(fieldValue.priority(task({ tags: [] }))).toBe(fieldValue.priority(before));
  });
});
