// Excel in the dashboard's look (2026-10-12), for every export made in the browser: a dark blue
// title band, a teal line with the filters and time, a blue header row with white bold text,
// soft zebra rows, thin borders, numbers right-aligned, and the header kept in view.
// The server's exports use the same colours (apps/api/src/exports/theme.ts).

import type { CellObject, SheetData } from 'write-excel-file/browser';

export type Value = string | number | null;

export const XL = {
  title: '#18244E',
  header: '#32499F',
  accent: '#039194',
  zebra: '#F1F3FB',
  border: '#DFDDDE',
  total: '#E2E7F6',
  font: 'Arial',
} as const;

type Cell = CellObject | null;

const isTotal = (row: Value[]) => /^(total|totals|all)\b/i.test(String(row[0] ?? '').trim());

/**
 * One sheet: title, the filters line, the export time, then the table (first row = header).
 * Returns the rows and column widths for write-excel-file.
 */
export function themedSheet(title: string, showing: string | null | undefined, rows: Value[][]) {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const band = (value: string, style: CellObject): Cell[] => [
    { value, columnSpan: width, fontFamily: XL.font, ...style },
    ...Array.from({ length: width - 1 }, () => null),
  ];
  const [head = [], ...body] = rows;
  const data: SheetData = [
    band(title, {
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: XL.title,
      height: 28,
      alignVertical: 'center',
    }),
    band(showing || 'All data in your view', { textColor: XL.accent, fontSize: 10 }),
    band(`Exported ${stamp()} IST · Nural Dev and QA Dashboard`, {
      textColor: '#8B91A8',
      fontSize: 9,
    }),
    [],
    Array.from({ length: width }, (_, i) => ({
      value: String(head[i] ?? ''),
      fontWeight: 'bold' as const,
      fontFamily: XL.font,
      textColor: '#FFFFFF',
      backgroundColor: XL.header,
      alignVertical: 'center' as const,
      wrap: true,
      height: 24,
      borderColor: XL.header,
      borderStyle: 'thin' as const,
    })),
    ...body.map((r, n) => {
      const total = isTotal(r);
      return Array.from({ length: width }, (_, i) => {
        const v = r[i];
        const num = typeof v === 'number';
        return {
          ...(v == null || v === '' ? {} : { value: v, type: num ? Number : String }),
          fontFamily: XL.font,
          fontWeight: total ? ('bold' as const) : undefined,
          backgroundColor: total ? XL.total : n % 2 ? XL.zebra : undefined,
          align: num ? ('right' as const) : undefined,
          borderColor: XL.border,
          borderStyle: 'thin' as const,
        };
      });
    }),
  ];
  const columns = Array.from({ length: width }, (_, i) => {
    const longest = Math.max(...rows.map((r) => String(r[i] ?? '').length), i === 0 ? 12 : 8);
    return { width: Math.min(60, longest + 3) };
  });
  return { data, columns, stickyRowsCount: 5 };
}

export const stamp = () =>
  new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

/** "Sheet name" safe for Excel: 31 characters, no []:*?/\ , unique within the workbook. */
export function sheetName(title: string, taken: Set<string>): string {
  const base =
    title
      .replace(/[[\]:*?/\\]/g, ' ')
      .trim()
      .slice(0, 28) || 'Sheet';
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  taken.add(name.toLowerCase());
  return name;
}
