// The Tasks in hand planner as a file (2026-11-08, SRS 25), laid out like the planner on screen:
// one row per person (or project), one column per day, week or month of the period in the toolbar
// (dates across the top, with "X of Y done" under each), and in each cell its tasks. Day cells
// list one line a task in the Short view, or each task with its details and what happened in the
// Full view; week and month cells give done of planned and the split by project (or person).
// Cells are tinted green, amber or red like the grid. Loaded only when used.
import { jsPDF } from 'jspdf';
import writeXlsxFile, { type CellObject, type SheetData } from 'write-excel-file/browser';
import type { PlannerEntry, PlannerGrid, PlannerProgress } from '../api/types';
import { heading, ordinal, shortDay } from './calendarHeading';
import { sheetName, stamp, XL } from './layout/excelTheme';
import { entryWords, statusOf, type Density } from './plannerLook';

type Status = 'all' | 'part' | 'none';
export interface GridExportCell {
  text: string;
  status: Status | null;
}
export interface GridExport {
  /** Column headings: the row label, then each date ("Mon · 9 Nov"). */
  head: string[];
  /** Under each heading: "3 of 7 done", "8 planned" (first: how many rows). */
  sub: string[];
  /** Index in `head` of today's column, if shown. */
  today: number | null;
  /** First cell: the row's name and counts; then one cell a column. */
  rows: GridExportCell[][];
  /** Day columns (taller cells, wider paper). */
  day: boolean;
}

const done = (p: PlannerProgress) => `${p.done} of ${p.planned} done`;

/** A short word for what happened to an entry (the Short view). */
function shortWords(e: PlannerEntry): string {
  const out: string[] = [];
  if (e.kind === 'moved') out.push(`moved → ${e.to ? shortDay(e.to) : 'no deadline'}`);
  else if (e.kind === 'replan') out.push(`re-planned → ${e.to ? shortDay(e.to) : 'no deadline'}`);
  else if (e.status === 'done') out.push('done');
  else if (e.status === 'missed') out.push('not done');
  else if (e.status === 'due') out.push('due today');
  else if (e.kind === 'dayplan') out.push('day plan');
  if (e.missed && e.status !== 'done') out.push(`${ordinal(e.missed)} deadline missed`);
  return out.join(', ');
}

export function plannerGridExport(g: PlannerGrid, density: Density): GridExport {
  const day = g.view === 'day';
  const full = !day || density === 'full';
  const head = [g.groupBy === 'project' ? 'Project' : 'Assignee'];
  const sub = [`${g.rows.length} shown`];
  let today: number | null = null;
  g.columns.forEach((c, i) => {
    const [top, dates] = heading(g.view, c, g.today);
    const t = g.columnTotals[c.key];
    const progress = !t?.planned
      ? 'Nothing planned'
      : c.from > g.today
        ? `${t.planned} planned`
        : done(t);
    // A day fits on one line; a week or month gives its dates under the name.
    head.push(day ? `${top} · ${dates}` : top);
    sub.push(day ? progress : `${dates} · ${progress}`);
    if (c.from <= g.today && g.today <= c.to) today = i + 1;
  });
  const rows = g.rows.map((r) => {
    const name: GridExportCell = {
      text: [
        r.name,
        `${r.open} open · ${r.overdueNow} overdue now`,
        r.progress.planned ? `${done(r.progress)} so far` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      status: null,
    };
    const cells = g.columns.map((c): GridExportCell => {
      const cell = r.cells[c.key];
      const past = c.from <= g.today;
      if (!cell || !cell.planned) {
        const moved = cell && 'entries' in cell && cell.entries.length;
        if (!moved) return { text: '', status: null };
      }
      if (cell && 'entries' in cell) {
        const lines = [
          past && cell.planned
            ? `${cell.done}/${cell.planned} done`
            : cell.planned
              ? `${cell.planned} planned`
              : '',
        ].filter(Boolean);
        for (const e of cell.entries) {
          const t = g.tasks[e.taskId];
          const title = t?.title ?? `Task ${e.taskId}`;
          if (!full) {
            const w = shortWords(e);
            lines.push(`• ${title}${w ? ` (${w})` : ''}`);
          } else {
            const crumb = g.groupBy === 'project' ? t?.assignee : t?.project;
            lines.push(`• ${crumb ?? ''} → ${title} #${e.taskId}`);
            const w = entryWords(e, g.people);
            if (w.length) lines.push(`   ${w.join(' · ')}`);
          }
        }
        return { text: lines.join('\n'), status: past ? statusOf(cell) : null };
      }
      const p = cell!;
      const ahead = p.planned - p.plannedToDate;
      const lines = [
        past && p.plannedToDate
          ? `${p.doneToDate}/${p.plannedToDate} done${ahead > 0 ? ` · ${ahead} still ahead` : ''}`
          : `${p.planned} planned`,
        ...p.groups.map((x) => `• ${x.name}: ${x.done}/${x.planned}`),
      ];
      if (p.missedDeadlines)
        lines.push(`${p.missedDeadlines} deadline${p.missedDeadlines > 1 ? 's' : ''} missed`);
      if (p.pulledForward) lines.push(`${p.pulledForward} pulled forward`);
      return {
        text: lines.join('\n'),
        status: past ? statusOf({ planned: p.plannedToDate, done: p.doneToDate }) : null,
      };
    });
    return [name, ...cells];
  });
  return { head, sub, today, rows, day };
}

// ---------------------------------------------------------------- files

const TINT: Record<Status, string> = { all: '#E3F2E9', part: '#FDF0D5', none: '#FBE3E3' };
const EDGE: Record<Status, string> = { all: '#178A4A', part: '#F59E0B', none: '#E63639' };

const fileName = (title: string, ext: string) =>
  `${title.replace(/[\\/:*?"<>|]/g, ' ').trim()} ${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function exportPlannerExcel(title: string, showing: string, grid: GridExport) {
  const width = grid.head.length;
  const band = (value: string, style: CellObject): (CellObject | null)[] => [
    { value, columnSpan: width, fontFamily: XL.font, ...style },
    ...Array.from({ length: width - 1 }, () => null),
  ];
  const lines = (t: string) => t.split('\n').length;
  const data: SheetData = [
    band(title, {
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: XL.title,
      height: 28,
      alignVertical: 'center',
    }),
    band(showing, { textColor: XL.accent, fontSize: 10 }),
    band(`Exported ${stamp()} IST · Nural Pulse · Powered by Bitrix24 and Nural`, {
      textColor: '#8B91A8',
      fontSize: 9,
    }),
    [],
    grid.head.map((h, i) => ({
      value: `${h}\n${grid.sub[i] ?? ''}`,
      fontWeight: 'bold' as const,
      fontFamily: XL.font,
      textColor: '#FFFFFF',
      backgroundColor: i === grid.today ? XL.accent : XL.header,
      alignVertical: 'top' as const,
      wrap: true,
      height: 32,
      borderColor: XL.header,
      borderStyle: 'thin' as const,
    })),
    ...grid.rows.map((r) => {
      const tall = Math.max(...r.map((c) => (c.text ? lines(c.text) : 1)));
      return r.map((c, i) => ({
        ...(c.text ? { value: c.text, type: String } : {}),
        fontFamily: XL.font,
        fontSize: 9,
        fontWeight: i === 0 ? ('bold' as const) : undefined,
        textColor: i === 0 ? XL.title : undefined,
        backgroundColor: c.status ? TINT[c.status] : i === 0 ? XL.zebra : undefined,
        alignVertical: 'top' as const,
        wrap: true,
        height: i === 0 ? Math.min(400, tall * 12 + 6) : undefined,
        borderColor: XL.border,
        borderStyle: 'thin' as const,
      }));
    }),
  ];
  const columns = grid.head.map((_, i) => ({
    width: i === 0 ? 26 : grid.day ? 38 : 32,
  }));
  await writeXlsxFile(data, {
    columns,
    stickyRowsCount: 5,
    stickyColumnsCount: 1,
    sheet: sheetName(title, new Set()),
  }).toFile(fileName(title, 'xlsx'));
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
/** The PDF's built-in font has no arrows. */
const pdfText = (t: string) => t.replace(/→/g, '->');

export function exportPlannerPdf(title: string, showing: string, grid: GridExport) {
  // Day columns of the Full view need the room of A3.
  const big = grid.day && grid.rows.some((r) => r.some((c) => c.text.split('\n').length > 14));
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: big ? 'a3' : 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const m = 24;
  const first = big ? 140 : 110;
  const each = (W - 2 * m - first) / Math.max(1, grid.head.length - 1);
  const widths = grid.head.map((_, i) => (i === 0 ? first : each));
  const fs = 6.8;
  const lineH = fs * 1.25;
  let y = m;

  pdf.setFillColor(...rgb(XL.title));
  pdf.rect(m, y, W - 2 * m, 24, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(pdfText(title), m + 8, y + 16);
  y += 30;
  pdf.setTextColor(...rgb(XL.accent));
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(pdfText(`${showing} · Exported ${stamp()} IST · Nural Pulse`), m, y + 8);
  y += 16;

  const headH = 26;
  const header = () => {
    let x = m;
    grid.head.forEach((h, i) => {
      pdf.setFillColor(...rgb(i === grid.today ? XL.accent : XL.header));
      pdf.rect(x, y, widths[i]!, headH, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.text(pdf.splitTextToSize(pdfText(h), widths[i]! - 6)[0] as string, x + 3, y + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8);
      pdf.text(pdfText(grid.sub[i] ?? ''), x + 3, y + 20);
      x += widths[i]!;
    });
    y += headH;
  };
  header();

  pdf.setFontSize(fs);
  for (const r of grid.rows) {
    const cellLines = r.map((c, i) =>
      c.text ? (pdf.splitTextToSize(pdfText(c.text), widths[i]! - 8) as string[]) : [],
    );
    const room = Math.floor((H - 2 * m - headH - 20) / lineH);
    // A cell longer than a page shows what fits and how many more lines there are.
    const shown = cellLines.map((ls) =>
      ls.length > room ? [...ls.slice(0, room - 1), `… ${ls.length - room + 1} more lines`] : ls,
    );
    const rowH = Math.max(3, ...shown.map((ls) => ls.length)) * lineH + 6;
    if (y + rowH > H - m - 12) {
      pdf.addPage();
      y = m;
      header();
      pdf.setFontSize(fs);
    }
    let x = m;
    r.forEach((c, i) => {
      const w = widths[i]!;
      if (c.status || i === 0) {
        pdf.setFillColor(...rgb(c.status ? TINT[c.status] : XL.zebra));
        pdf.rect(x, y, w, rowH, 'F');
      }
      if (c.status) {
        pdf.setFillColor(...rgb(EDGE[c.status]));
        pdf.rect(x, y, 2, rowH, 'F');
      }
      pdf.setDrawColor(...rgb(XL.border));
      pdf.rect(x, y, w, rowH, 'S');
      pdf.setTextColor(...rgb(i === 0 ? XL.title : '#1E2333'));
      shown[i]!.forEach((line, k) => {
        pdf.setFont('helvetica', i === 0 && k === 0 ? 'bold' : 'normal');
        pdf.text(line, x + 4, y + 4 + lineH * (k + 0.8));
      });
      x += w;
    });
    y += rowH;
  }

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Powered by Bitrix24 and Nural · page ${p} of ${pages}`, W - m, H - 10, {
      align: 'right',
    });
  }
  pdf.save(fileName(title, 'pdf'));
}
