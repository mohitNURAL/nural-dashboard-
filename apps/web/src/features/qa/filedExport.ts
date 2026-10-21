// Last filed and Open / pending as a file (2026-10-16, Open 2026-10-21): the same Excel and PDF as
// Projects at work. One line per project, then each creator in it, then who that creator's issues
// are with, with the popup's counts. Every project shown (search applied), opened or not. Loaded
// only when used.
import type { QaFiled, QaOpen } from '../../api/types';
import type { Value } from '../../components/layout/excelTheme';
import { exportProjectsExcel, exportProjectsPdf, type PdfLayout } from '../dev/projectsExport';
import type { TreeRow } from './IssueTreeDialog';

type FiledRow = QaFiled['rows'][number];
type OpenRow = QaOpen['rows'][number];
const ALL = 'All';

/** Project, creator and assignee lines with the counts under `heads`, in that order. */
function treeTable<C extends Record<keyof C, number>>(
  rows: TreeRow<C>[],
  heads: string[],
  keys: (keyof C)[],
): Value[][] {
  const out: Value[][] = [['Project', 'Creator', 'Assignee', ...heads]];
  const counts = (w: C) => keys.map((k) => w[k]);
  for (const r of rows) {
    out.push([r.name, ALL, ALL, ...counts(r)]);
    for (const c of r.creators) {
      out.push([r.name, c.person.name, ALL, ...counts(c)]);
      for (const a of c.assignees) out.push([r.name, c.person.name, a.person.name, ...counts(a)]);
    }
  }
  return out;
}

export const filedTable = (rows: FiledRow[]) =>
  treeTable(rows, ['Filed', 'Bug', 'Feedback'], ['filed', 'bug', 'feedback']);
export const openTable = (rows: OpenRow[]) =>
  treeTable(rows, ['Pending', 'Overdue'], ['pending', 'overdue']);

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

export const exportFiledExcel = (title: string, showing: string, rows: FiledRow[]) =>
  exportProjectsExcel(title, showing, filedTable(rows));

export const exportFiledPdf = (title: string, showing: string, rows: FiledRow[]) =>
  exportProjectsPdf(title, showing, filedTable(rows), LAYOUT);

export const exportOpenExcel = (title: string, showing: string, rows: OpenRow[]) =>
  exportProjectsExcel(title, showing, openTable(rows));

export const exportOpenPdf = (title: string, showing: string, rows: OpenRow[]) =>
  exportProjectsPdf(title, showing, openTable(rows), LAYOUT);
