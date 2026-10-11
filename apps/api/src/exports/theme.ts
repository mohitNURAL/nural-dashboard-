// Excel in the dashboard's look (2026-10-12), for the server's exports (task lists, people,
// feedback): a dark blue title band, a teal line saying what the file holds, a blue header row
// with white bold text, soft zebra rows, thin borders, the header kept in view and filters on.
// The browser's exports use the same colours (apps/web/src/components/layout/excelTheme.ts).
import type ExcelJS from 'exceljs';

const C = {
  title: 'FF18244E',
  header: 'FF32499F',
  accent: 'FF039194',
  zebra: 'FFF1F3FB',
  border: 'FFDFDDDE',
  white: 'FFFFFFFF',
  muted: 'FF8B91A8',
} as const;
const FONT = 'Arial';

/**
 * Styles a sheet whose row 1 is the header and the rest data: three rows go above it (title,
 * what it holds, when) and the header row moves to row 4. Call after the rows are added and
 * styled; cell-level fonts already set (links, red overdue) are kept.
 */
export function brandSheet(ws: ExcelJS.Worksheet, title: string, subtitle: string, when: string) {
  const width = ws.columnCount;
  ws.spliceRows(1, 0, [title], [subtitle], [`Exported ${when} · Nural Pulse · Powered by Bitrix24 and Nural`]);
  const band = (n: number, argb: string, font: Partial<ExcelJS.Font>, height: number) => {
    ws.mergeCells(n, 1, n, width);
    const row = ws.getRow(n);
    row.height = height;
    const c = row.getCell(1);
    c.font = { name: FONT, ...font };
    c.alignment = { vertical: 'middle' };
    if (argb) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  };
  band(1, C.title, { size: 14, bold: true, color: { argb: C.white } }, 28);
  band(2, '', { size: 10, color: { argb: C.accent } }, 18);
  band(3, '', { size: 9, color: { argb: C.muted } }, 16);

  const header = ws.getRow(4);
  header.height = 30;
  header.eachCell((c) => {
    c.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.header } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = { bottom: { style: 'medium', color: { argb: C.accent } } };
  });
  const thin = { style: 'thin' as const, color: { argb: C.border } };
  ws.eachRow((row, n) => {
    if (n <= 4) return;
    row.eachCell({ includeEmpty: true }, (c) => {
      if (!c.font?.name) c.font = { name: FONT, size: 10 };
      c.border = { top: thin, bottom: thin, left: thin, right: thin };
      if (n % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    });
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: width } };
}

/** "11 Oct 2026, 18:30 IST". */
export const exportedAt = (tz: string) =>
  `${new Date().toLocaleString('en-IN', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' })} IST`;
