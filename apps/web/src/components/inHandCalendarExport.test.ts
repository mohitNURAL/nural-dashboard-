import { describe, expect, it } from 'vitest';
import type { InHandCalendar } from '../api/types';
import { plannerTable } from './inHandCalendarExport';

const cell = (items: [number, string, number][]) => ({
  count: items.reduce((n, [, , c]) => n + c, 0),
  items: items.map(([id, name, count]) => ({ id, name, count })),
});

describe('Tasks in hand planner export', () => {
  it('writes each person, then each project they work on, with every column', () => {
    const data: InHandCalendar = {
      view: 'week',
      groupBy: 'assignee',
      today: '2026-10-20',
      columns: [
        { key: '2026-10-19', from: '2026-10-19', to: '2026-10-25' },
        { key: 'later', from: '2026-10-26', to: null },
      ],
      rows: [
        {
          id: 30,
          name: 'Dev A',
          total: 4,
          overdue: cell([[148, 'Moto', 1]]),
          cells: {
            '2026-10-19': cell([
              [148, 'Moto', 1],
              [154, 'Pulse', 2],
            ]),
            later: cell([]),
          },
        },
      ],
      totals: { total: 4, overdue: 1, cells: { '2026-10-19': 3, later: 0 } },
    };
    expect(plannerTable(data, data.rows)).toEqual([
      ['Assignee', 'Project', 'Total', 'Overdue', '19–25 Oct', 'Later (from 26 Oct)'],
      ['Dev A', 'All', 4, 1, 3, 0],
      ['Dev A', 'Moto', 2, 1, 1, 0],
      ['Dev A', 'Pulse', 2, 0, 2, 0],
      ['Total', 'All', 4, 1, 3, 0],
    ]);
  });
});
