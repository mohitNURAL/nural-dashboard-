// Last filed as a file (2026-10-16): the same Excel and PDF as Projects at work. One line per
// project, then each creator in it, then who that creator's issues went to; Filed, Bug, Feedback.
// Every project shown (search applied), opened or not. Loaded only when used.
import type { QaFiled } from '../../api/types';
import type { Value } from '../../components/layout/excelTheme';
import { exportProjectsExcel, exportProjectsPdf, type PdfLayout } from '../dev/projectsExport';

type Row = QaFiled['rows'][number];
const ALL = 'All';

export function filedTable(rows: Row[]): Value[][] {
  const out: Value[][] = [['Project', 'Creator', 'Assignee', 'Filed', 'Bug', 'Feedback']];
  for (const r of rows) {
    out.push([r.name, ALL, ALL, r.filed, r.bug, r.feedback]);
    for (const c of r.creators) {
      out.push([r.name, c.person.name, ALL, c.filed, c.bug, c.feedback]);
      for (const a of c.assignees)
        out.push([r.name, c.person.name, a.person.name, a.filed, a.bug, a.feedback]);
    }
  }
  return out;
}

/** Project lines bold; a creator's line and its assignees' lines repeat no names above them. */
const LAYOUT: PdfLayout = {
  textWidths: [190, 170, 170],
  isGroup: (row) => row[1] === ALL,
  text: (row, i, t) => {
    if (row[1] === ALL) return i === 0 ? t : '';
    if (row[2] === ALL) return i === 1 ? `   ${t}` : '';
    return i === 2 ? `      ${t}` : '';
  },
};

export const exportFiledExcel = (title: string, showing: string, rows: Row[]) =>
  exportProjectsExcel(title, showing, filedTable(rows));

export const exportFiledPdf = (title: string, showing: string, rows: Row[]) =>
  exportProjectsPdf(title, showing, filedTable(rows), LAYOUT);
