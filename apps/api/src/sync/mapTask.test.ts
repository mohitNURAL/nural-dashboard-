import { describe, expect, it } from 'vitest';
import { issueTypeOf, mapTask, type BitrixTask } from './mapTask';
import { buildStageMap, resolveTaskStage } from './stageMap';

// Two boards with different stage IDs for the same titles (as on the real portal).
const stages = buildStageMap([
  { id: 1054, groupId: 148, title: 'To do', sort: 100 },
  { id: 1066, groupId: 148, title: 'QA Backlog', sort: 700 },
  { id: 1326, groupId: 116, title: 'Unit Testing', sort: 300 },
  { id: 754, groupId: 116, title: 'To Do', sort: 100 },
  { id: 938, groupId: 20, title: 'Name', sort: 1200 },
]);

const task = (over: Partial<BitrixTask> = {}): BitrixTask => ({
  id: '41580',
  title: 'Price Update in Back Date',
  groupId: '154',
  stageId: '0',
  status: '2',
  priority: '1',
  responsibleId: '30',
  createdBy: '10',
  createdDate: '2026-09-25T19:35:19+05:30',
  deadline: '2026-10-09T19:00:00+05:30',
  closedDate: null,
  changedDate: '2026-10-05T11:44:05+05:30',
  parentId: '0',
  tags: { '1236': { id: 1236, title: 'new development' } },
  ...over,
});

describe('resolveTaskStage', () => {
  it('treats stage "0" as To do and shows the first column title', () => {
    expect(resolveTaskStage({ groupId: 116, stageId: '0', status: 2 }, stages)).toEqual({
      title: 'To Do',
      stage: 'To do',
    });
  });

  it('matches by title, so different IDs give the same stage', () => {
    expect(resolveTaskStage({ groupId: 148, stageId: '1066', status: 2 }, stages).stage).toBe(
      'QA Backlog',
    );
    expect(resolveTaskStage({ groupId: 116, stageId: '1326', status: 2 }, stages)).toEqual({
      title: 'Unit Testing',
      stage: 'In progress',
    });
  });

  it('leaves unmapped or unknown stages as null', () => {
    expect(resolveTaskStage({ groupId: 20, stageId: '938', status: 2 }, stages)).toEqual({
      title: 'Name',
      stage: null,
    });
    expect(resolveTaskStage({ groupId: 20, stageId: '99999', status: 2 }, stages).stage).toBeNull();
  });

  it('derives the stage from status for tasks outside a workgroup', () => {
    expect(resolveTaskStage({ groupId: 0, stageId: '0', status: 5 }, stages).stage).toBe('Done');
    expect(resolveTaskStage({ groupId: 0, stageId: '12', status: 3 }, stages).stage).toBe(
      'In progress',
    );
  });
});

describe('issueTypeOf', () => {
  it('detects bug and feedback case-insensitively, bug first', () => {
    expect(issueTypeOf(['New Development'])).toBeNull();
    expect(issueTypeOf(['Feedback'])).toBe('feedback');
    expect(issueTypeOf(['feedback', 'BUG'])).toBe('bug');
  });
});

describe('mapTask', () => {
  it('maps a Bitrix24 task to a row', () => {
    const row = mapTask(task(), stages);
    expect(row).toMatchObject({
      id: 41580,
      groupId: 154,
      stageId: '0',
      stage: 'To do',
      status: 2,
      responsibleId: 30,
      createdBy: 10,
      parentId: null,
      tags: ['new development'],
      isIssue: false,
      issueType: null,
    });
    expect(row.deadline?.toISOString()).toBe('2026-10-09T13:30:00.000Z');
    expect(row.closedAt).toBeNull();
  });

  it('marks issues and keeps the parent', () => {
    const row = mapTask(
      task({
        parentId: '41436',
        tags: { '9': { id: 9, title: 'Bug' } },
        groupId: '148',
        stageId: '1066',
      }),
      stages,
    );
    expect(row).toMatchObject({
      isIssue: true,
      issueType: 'bug',
      parentId: 41436,
      stage: 'QA Backlog',
    });
  });

  it('handles empty tags sent as []', () => {
    expect(mapTask(task({ tags: [] }), stages).tags).toEqual([]);
  });
});
