// Report › Daily task update as a flat table for Excel and PDF (2026-10-17): one line per person
// and day (their summary), then one per task: planned or added, reported, now, stage, status,
// priority, tags, deadline and the Kanban moves that day.
import type { Value } from '../../components/layout/excelTheme';
import { DEPT_LABEL } from '../kpi/format';
import type { ReportLine } from './dailyReportTypes';

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
const STATE = { pending: 'Pending', wip: 'WIP', done: 'Done', hold: 'On hold' } as const;
const WHY: Record<string, string> = {
  carried: 'Carried over',
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Taken early',
  noDeadline: 'No deadline (set to today)',
  added: 'Added',
};
const DEPT = DEPT_LABEL;

export function reportTables(lines: ReportLine[]): { full: Value[][]; pdf: Value[][] } {
  const full: Value[][] = [
    [
      'Person',
      'Department',
      'Day',
      'Planned at',
      'Wrapped up at',
      'Task ID',
      'Task',
      'Project',
      'On the plan',
      'Reported',
      'Now',
      'Stage',
      'Status',
      'Priority',
      'Tags',
      'Deadline',
      'Moves that day',
    ],
  ];
  const pdf: Value[][] = [
    [
      'Person',
      'Day',
      'Plan',
      'Wrap-up',
      'Task',
      'Project',
      'On the plan',
      'Reported',
      'Now',
      'Stage',
      'Moves that day',
    ],
  ];
  for (const l of lines) {
    const plan = l.plannedAt
      ? `${time(l.plannedAt)}${l.late ? ' (late planned)' : ''}`
      : 'Not planned';
    const wrap = l.wrappedAt ? time(l.wrappedAt) : 'Not wrapped up';
    const summary = `${l.planned} planned · ${l.done} done · ${l.wip} WIP · ${l.pending} pending`;
    full.push([
      l.name,
      DEPT[l.dept],
      l.day,
      plan,
      wrap,
      null,
      summary,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      l.planNote || l.wrapNote,
    ]);
    pdf.push([l.name, l.day, plan, wrap, '', summary, '', '', '', '', '']);
    for (const t of l.tasks) {
      const onPlan = t.planned ? (WHY[t.why ?? ''] ?? 'Planned') : 'Added in the evening';
      const reported = t.reported ? STATE[t.reported] : '';
      const now = t.now ? STATE[t.now] : '';
      const moves = t.moves
        .map((m) => `${m.from ?? '—'} → ${m.to ?? '—'} ${time(m.at)}`)
        .join('; ');
      full.push([
        l.name,
        DEPT[l.dept],
        l.day,
        plan,
        wrap,
        t.taskId || null,
        t.title,
        t.project,
        onPlan,
        reported,
        now,
        t.stage ?? '',
        t.status ?? '',
        t.priority ?? '',
        t.tags.join(', '),
        t.deadline ? t.deadline.slice(0, 10) : '',
        moves,
      ]);
      pdf.push([
        '',
        '',
        '',
        '',
        `${t.taskId ? `#${t.taskId} ` : ''}${t.title}`,
        t.project,
        onPlan,
        reported,
        now,
        t.stage ?? '',
        moves,
      ]);
    }
  }
  return { full, pdf };
}
