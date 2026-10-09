import type { TaskChanged } from '@nural/shared';
import { describe, expect, it } from 'vitest';
import { liveMessage } from './liveMessage';

const base: TaskChanged = {
  type: 'task.changed',
  taskId: 41580,
  title: 'Login page',
  projectId: 148,
  stage: 'In progress',
  fromStage: 'In progress',
  stageGroup: 'pending',
  isIssue: false,
  isNew: false,
  reopened: false,
  deleted: false,
  source: 'webhook',
  at: '2026-10-10T08:00:00.000Z',
};

describe('liveMessage', () => {
  it('names the new stage on a move', () => {
    expect(liveMessage({ ...base, fromStage: 'To do', stage: 'In QA' })).toBe(
      'Task 41580 moved to In QA',
    );
  });

  it('says updated when the stage did not change', () => {
    expect(liveMessage(base)).toBe('Task 41580 updated');
  });

  it('covers created, deleted and reopened', () => {
    expect(liveMessage({ ...base, isNew: true, fromStage: null, stage: 'To do' })).toBe(
      'Task 41580 created in To do',
    );
    expect(liveMessage({ ...base, deleted: true })).toBe('Task 41580 deleted');
    expect(liveMessage({ ...base, reopened: true, fromStage: 'In QA', stage: 'To do' })).toBe(
      'Task 41580 reopened, back to To do',
    );
  });
});
