// Projects at work as a file (2026-10-14): Excel as a flat table (one line per project, then one
// per person in it) in the dashboard's Excel look, and PDF as a printed table on landscape A4.
// Every project shown in the popup (search and Active / Silent / Hold applied), whether opened or
// not, with the columns the reader shows, in their order. Loaded only when used.
import { jsPDF } from 'jspdf';
import writeXlsxFile from 'write-excel-file/browser';
import type { ProjectWorkRow, WorkCounts } from '../../api/types';
import { sheetName, stamp, themedSheet, XL, type Value } from '../../components/layout/excelTheme';
import type { ProjectColumn } from './projectsColumns';

const STATUS = { active: 'Active', silent: 'Silent', hold: 'On hold' } as const;

const dateText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

function value(c: ProjectColumn, w: WorkCounts): Value {
  if (c.id === 'activity') return w.activityWeek;
  if (c.id === 'deadline') return dateText(w.lastDeadline);
  return w[c.id];
}

/** Header, then each project line followed by its people. */
export function projectTable(rows: ProjectWorkRow[], cols: ProjectColumn[]): Value[][] {
  const out: Value[][] = [['Project', 'Status', 'Assignee', ...cols.map((c) => c.label)]];
  for (const r of rows) {
    out.push([r.name, STATUS[r.status], 'All', ...cols.map((c) => value(c, r))]);
    for (const p of r.people)
      out.push([r.name, STATUS[r.status], p.person.name, ...cols.map((c) => value(c, p))]);
  }
  return out;
}

const fileName = (title: string, ext: string) =>
  `${title.replace(/[\\/:*?"<>|]/g, ' ').trim()} ${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function exportProjectsExcel(title: string, showing: string, table: Value[][]) {
  const sheet = themedSheet(title, showing, table);
  await writeXlsxFile(sheet.data, {
    columns: sheet.columns,
    stickyRowsCount: sheet.stickyRowsCount,
    sheet: sheetName(title, new Set()),
  }).toFile(fileName(title, 'xlsx'));
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export function exportProjectsPdf(title: string, showing: string, table: Value[][]) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const m = 28;
  const [head = [], ...body] = table;
  // Project and Assignee wide, Status narrow, the rest share what is left.
  const fixed = [150, 54, 120];
  const rest = Math.max(1, head.length - fixed.length);
  const widths = head.map((_, i) => fixed[i] ?? (W - 2 * m - 324) / rest);
  const rowH = 17;
  const textOf = (v: Value) => (v === null ? '' : String(v));
  const fit = (t: string, w: number) => {
    let s = t;
    while (s.length > 1 && pdf.getTextWidth(s) > w - 8) s = s.slice(0, -1);
    return s === t ? t : `${s.slice(0, -1)}…`;
  };

  let y = m;
  const banner = () => {
    pdf.setFillColor(...rgb(XL.title));
    pdf.rect(m, y, W - 2 * m, 24, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(title, m + 8, y + 16);
    y += 30;
    pdf.setTextColor(...rgb(XL.accent));
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(`${showing} · Exported ${stamp()} IST · Nural Pulse`, m, y + 8);
    y += 16;
  };
  const header = () => {
    pdf.setFillColor(...rgb(XL.header));
    pdf.rect(m, y, W - 2 * m, rowH + 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    let x = m;
    head.forEach((h, i) => {
      const t = fit(textOf(h), widths[i]!);
      if (i >= 3) pdf.text(t, x + widths[i]! / 2, y + 12, { align: 'center' });
      else pdf.text(t, x + 4, y + 12);
      x += widths[i]!;
    });
    y += rowH + 2;
  };
  banner();
  header();
  body.forEach((row, n) => {
    if (y + rowH > H - m) {
      pdf.addPage();
      y = m;
      header();
    }
    const projectLine = row[2] === 'All';
    pdf.setFillColor(...rgb(projectLine ? XL.total : n % 2 ? XL.zebra : '#FFFFFF'));
    pdf.rect(m, y, W - 2 * m, rowH, 'F');
    pdf.setDrawColor(...rgb(XL.border));
    pdf.line(m, y + rowH, W - m, y + rowH);
    pdf.setTextColor(...rgb(projectLine ? XL.title : '#1E2333'));
    pdf.setFont('helvetica', projectLine ? 'bold' : 'normal');
    pdf.setFontSize(8);
    let x = m;
    row.forEach((v, i) => {
      // A person's line repeats no project name.
      const t = fit(i === 0 && !projectLine ? '' : textOf(v), widths[i]!);
      if (i >= 3) pdf.text(t, x + widths[i]! / 2, y + 12, { align: 'center' });
      else pdf.text(i === 2 && !projectLine ? `   ${t}` : t, x + 4, y + 12);
      x += widths[i]!;
    });
    y += rowH;
  });
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Powered by Bitrix24 and Nural · page ${p} of ${pages}`, W - m, H - 12, {
      align: 'right',
    });
  }
  pdf.save(fileName(title, 'pdf'));
}
