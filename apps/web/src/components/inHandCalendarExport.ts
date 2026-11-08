// The Tasks in hand planner as a file (2026-11-08, SRS 25): Excel and PDF in the Projects at work
// look, one line per entry (a task on a day): the day, who and which project, the task, what the
// entry is (deadline, moved, re-planned, day plan), its status, how many deadlines it missed and
// where it was moved to and by whom. Every entry of the period shown, the planner's filters
// applied. Loaded only when used.
import type { PlannerEntry, PlannerPeriod } from '../api/types';
import {
  exportProjectsExcel,
  exportProjectsPdf,
  type PdfLayout,
} from '../features/dev/projectsExport';
import { longDay, ordinal } from './calendarHeading';
import type { Value } from './layout/excelTheme';

const KIND: Record<PlannerEntry['kind'], string> = {
  deadline: 'Deadline',
  moved: 'Moved away',
  replan: 'Re-planned',
  dayplan: 'Day plan',
};
const STATUS: Record<PlannerEntry['status'], string> = {
  done: 'Done',
  missed: 'Not done',
  due: 'Due today',
  planned: 'Planned',
  moved: 'Moved',
  replan: 'Re-planned',
};

export function plannerTable(data: Pick<PlannerPeriod, 'days' | 'tasks' | 'people'>): Value[][] {
  const out: Value[][] = [
    [
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
    ],
  ];
  for (const d of data.days)
    for (const e of d.entries) {
      const t = data.tasks[e.taskId];
      const moved = e.kind === 'moved' || e.kind === 'replan';
      out.push([
        longDay(d.day),
        t?.assignee ?? '',
        t?.project ?? '',
        e.taskId,
        t?.title ?? '',
        KIND[e.kind],
        STATUS[e.status],
        e.missed ? ordinal(e.missed) : '',
        moved ? (e.to ? longDay(e.to) : 'No deadline') : '',
        moved && e.by ? (data.people[e.by] ?? '') : '',
        t?.deadlineDay ? longDay(t.deadlineDay) : '',
      ]);
    }
  return out;
}

const LAYOUT: PdfLayout = { textWidths: [70, 90, 90, 44, 170, 60, 56, 44, 70, 80, 70] };

export const exportPlannerExcel = (title: string, showing: string, table: Value[][]) =>
  exportProjectsExcel(title, showing, table);

export const exportPlannerPdf = (title: string, showing: string, table: Value[][]) =>
  exportProjectsPdf(title, showing, table, LAYOUT);
