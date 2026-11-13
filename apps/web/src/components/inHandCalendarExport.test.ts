import { describe, expect, it } from 'vitest';
import type { PlannerGrid } from '../api/types';
import { pdfText, plannerGridExport } from './inHandCalendarExport';

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

// Today Wed 11 Nov: Tue 10 a moved deadline (1st missed), Thu 12 the new deadline.
const grid: PlannerGrid = {
  view: 'day',
  groupBy: 'assignee',
  start: '2026-11-10',
  today: '2026-11-11',
  columns: ['2026-11-10', '2026-11-11', '2026-11-12'].map((k) => ({ key: k, from: k, to: k })),
  rows: [
    {
      id: 30,
      name: 'Dev A',
      open: 3,
      overdueNow: 1,
      progress: { planned: 1, done: 0 },
      cells: {
        '2026-11-10': {
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
        '2026-11-12': {
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
      },
    },
  ],
  columnTotals: {
    '2026-11-10': { planned: 1, done: 0, plannedToDate: 1, doneToDate: 0 },
    '2026-11-11': { planned: 0, done: 0, plannedToDate: 0, doneToDate: 0 },
    '2026-11-12': { planned: 1, done: 0, plannedToDate: 0, doneToDate: 0 },
  },
  totals: { open: 3, overdueNow: 1 },
  tasks: { '7': task(7, 'Ledger export') },
  people: { '28': 'Vijay Prajapati' },
  choices: { assignees: [], projects: [] },
};

describe('Tasks in hand planner export', () => {
  it('lays the file out like the grid: a row per person, a column per date', () => {
    const g = plannerGridExport(grid, 'short');
    expect(g.head).toEqual([
      'Assignee',
      'Yesterday · 10 Nov',
      'Today · 11 Nov',
      'Tomorrow · 12 Nov',
    ]);
    expect(g.sub).toEqual(['1 shown', '0 of 1 done', 'Nothing planned', '1 planned']);
    expect(g.today).toBe(2);
    expect(g.rows).toHaveLength(1);
    const [name, tue, wed, thu] = g.rows[0]!;
    expect(name!.text).toBe('Dev A\n3 open · 1 overdue now\n0 of 1 done so far');
    expect(tue).toEqual({
      text: '0/1 done\n• Ledger export (moved → 12 Nov, 1st deadline missed)',
      status: 'none',
    });
    expect(wed).toEqual({ text: '', status: null });
    // A day ahead is not coloured.
    expect(thu).toEqual({
      text: '1 planned\n• Ledger export (1st deadline missed)',
      status: null,
    });
  });

  it('Full: each task with its project, ID and what happened', () => {
    const tue = plannerGridExport(grid, 'full').rows[0]![1]!;
    expect(tue.text).toBe(
      '0/1 done\n• Moto → Ledger export #7\n   Moved → Thu 12 Nov by Vijay Prajapati · 1st deadline missed',
    );
  });

  it('PDF text: only characters the PDF font can draw and measure', () => {
    expect(pdfText('Moto → KYC ✓ – “₹ 500” 🐞\nदो')).toBe('Moto -> KYC (done) – “? 500” ?\n??');
  });
});
