import { describe, expect, it } from 'vitest';
import type { PlannerPeriod } from '../api/types';
import { plannerTable } from './inHandCalendarExport';

const task = (id: number, title: string) => ({
  id,
  title,
  projectId: 148,
  project: 'Moto',
  assigneeId: 30,
  assignee: 'Dev A',
  deadline: '2026-11-12T13:00:00.000Z',
  deadlineDay: '2026-11-12',
});

describe('Tasks in hand planner export', () => {
  it('writes one line per entry: day, who, task, entry type, status, missed and the move', () => {
    const data: Pick<PlannerPeriod, 'days' | 'tasks' | 'people'> = {
      days: [
        {
          day: '2026-11-10',
          planned: 1,
          done: 0,
          entries: [
            {
              taskId: 7,
              day: '2026-11-10',
              kind: 'moved',
              status: 'moved',
              counts: true,
              missed: 1,
              to: '2026-11-12',
              by: 28,
            },
          ],
        },
        {
          day: '2026-11-12',
          planned: 1,
          done: 0,
          entries: [
            {
              taskId: 7,
              day: '2026-11-12',
              kind: 'deadline',
              status: 'planned',
              counts: true,
              missed: 1,
            },
          ],
        },
      ],
      tasks: { '7': task(7, 'Ledger export') },
      people: { '28': 'Vijay Prajapati' },
    };
    const t = plannerTable(data);
    expect(t[0]).toEqual([
      'Day',
      'Assignee',
      'Project',
      'Task',
      'Title',
      'Entry type',
      'Status',
      'Missed count',
      'Moved to',
      'Moved by',
      'Deadline now',
    ]);
    expect(t.slice(1)).toEqual([
      [
        'Tue 10 Nov',
        'Dev A',
        'Moto',
        7,
        'Ledger export',
        'Moved away',
        'Moved',
        '1st',
        'Thu 12 Nov',
        'Vijay Prajapati',
        'Thu 12 Nov',
      ],
      [
        'Thu 12 Nov',
        'Dev A',
        'Moto',
        7,
        'Ledger export',
        'Deadline',
        'Planned',
        '1st',
        '',
        '',
        'Thu 12 Nov',
      ],
    ]);
  });
});
