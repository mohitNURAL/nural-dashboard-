// The Tasks in hand planner as a file (2026-10-20): Excel and PDF in the Projects at work look.
// One line per person (or project) with its count in every column, then one line per project
// (or person) it splits into. Overdue first, then the view's days, weeks or months, then Later.
// Every row shown (search applied). Loaded only when used.
import type { InHandCalendar } from '../api/types';
import {
  exportProjectsExcel,
  exportProjectsPdf,
  type PdfLayout,
} from '../features/dev/projectsExport';
import { fileHeading } from './calendarHeading';
import type { Value } from './layout/excelTheme';

const ALL = 'All';

export function plannerTable(data: InHandCalendar, rows: InHandCalendar['rows']): Value[][] {
  const cols = data.columns;
  const rowLabel = data.groupBy === 'project' ? 'Project' : 'Assignee';
  const itemLabel = data.groupBy === 'project' ? 'Assignee' : 'Project';
  const out: Value[][] = [
    [
      rowLabel,
      itemLabel,
      'Total',
      'Overdue',
      ...cols.map((c, i) => fileHeading(data.view, c, i, data.today)),
    ],
  ];
  for (const r of rows) {
    out.push([
      r.name,
      ALL,
      r.total,
      r.overdue.count,
      ...cols.map((c) => r.cells[c.key]?.count ?? 0),
    ]);
    // Every project (or person) this row splits into, most first.
    const items = new Map<number, string>();
    for (const cell of [r.overdue, ...Object.values(r.cells)])
      for (const i of cell.items) items.set(i.id, i.name);
    const countIn = (cell: InHandCalendar['rows'][number]['overdue'] | undefined, id: number) =>
      cell?.items.find((i) => i.id === id)?.count ?? 0;
    const lines = [...items].map(([id, name]) => {
      const counts = cols.map((c) => countIn(r.cells[c.key], id));
      const late = countIn(r.overdue, id);
      return { name, late, counts, total: late + counts.reduce((a, b) => a + b, 0) };
    });
    lines.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    for (const l of lines) out.push([r.name, l.name, l.total, l.late, ...l.counts]);
  }
  out.push([
    'Total',
    ALL,
    data.totals.total,
    data.totals.overdue,
    ...cols.map((c) => data.totals.cells[c.key] ?? 0),
  ]);
  return out;
}

/** A row's own line bold; the lines under it repeat no name and are indented. */
const LAYOUT: PdfLayout = {
  textWidths: [130, 120],
  isGroup: (row) => row[1] === ALL,
  text: (row, i, t) => (row[1] === ALL ? (i === 0 ? t : '') : i === 1 ? `   ${t}` : ''),
};

export const exportPlannerExcel = (title: string, showing: string, table: Value[][]) =>
  exportProjectsExcel(title, showing, table);

export const exportPlannerPdf = (title: string, showing: string, table: Value[][]) =>
  exportProjectsPdf(title, showing, table, LAYOUT);
