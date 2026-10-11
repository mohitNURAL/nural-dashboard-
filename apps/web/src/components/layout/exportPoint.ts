// Export one data point from the focus view (2026-10-11): Excel takes the card's table, or for a
// chart its data (category, then one column per series), or else its text; PDF is a picture of
// the card as shown. Both carry the title, the filters in force and the time. Loaded only on use.
import { getInstanceByDom } from 'echarts/core';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import writeXlsxFile from 'write-excel-file/browser';
import { sheetName, stamp, themedSheet, type Value } from './excelTheme';

const clean = (t: string | null | undefined) =>
  (t ?? '')
    .replace(/[▲▼↑↓]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** "1,234" → 1234; anything else stays text. */
const num = (t: string): Value => {
  if (!t) return null;
  return /^-?[\d,]+(\.\d+)?$/.test(t) ? Number(t.replace(/,/g, '')) : t;
};

function fromTable(el: HTMLElement): Value[][] | null {
  const table = [...el.querySelectorAll('table')].find((t) => t.querySelector('tbody tr'));
  if (!table) return null;
  // Header text without the "i" buttons and sort icons inside the cells.
  const label = (th: Element) => {
    const c = th.cloneNode(true) as Element;
    c.querySelectorAll('button[aria-label^="About"], svg, [aria-hidden="true"]').forEach((x) =>
      x.remove(),
    );
    return clean(c.textContent);
  };
  const head = [...table.querySelectorAll('thead tr')].map((tr) =>
    [...tr.querySelectorAll('th')].map(label),
  );
  const body = [...table.querySelectorAll('tbody tr, tfoot tr')].map((tr) =>
    [...tr.querySelectorAll('th, td')].map((td) => num(clean(td.textContent))),
  );
  return [...head.slice(-1), ...body];
}

interface ChartOption {
  xAxis?: { type?: string; data?: unknown[] }[];
  yAxis?: { type?: string; data?: unknown[] }[];
  series?: { name?: string; data?: unknown[] }[];
}

function fromChart(el: HTMLElement): Value[][] | null {
  const box = el.querySelector<HTMLElement>('[_echarts_instance_]');
  const chart = box && getInstanceByDom(box);
  if (!chart) return null;
  const o = chart.getOption() as ChartOption;
  const yCat = (o.yAxis ?? []).find((a) => a.type === 'category');
  const axis = yCat ?? (o.xAxis ?? []).find((a) => a.type === 'category');
  const cats = (axis?.data ?? []).map((c) =>
    String(typeof c === 'object' ? (c as { value: unknown }).value : c),
  );
  const series = o.series ?? [];
  if (!cats.length || !series.length) return null;
  const value = (v: unknown): Value =>
    v == null
      ? null
      : typeof v === 'object'
        ? ((v as { value?: number }).value ?? null)
        : Number(v);
  const rows = cats.map((c, i) => [c, ...series.map((s) => value(s.data?.[i]))]);
  // Horizontal bars list their categories from the bottom up; export them as seen, top down.
  if (yCat && !(yCat as { inverse?: boolean }).inverse) rows.reverse();
  return [['', ...series.map((s) => s.name ?? '')], ...rows];
}

function fromText(el: HTMLElement): Value[][] {
  return el.innerText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => [l]);
}

const fileBase = (title: string) =>
  `${title.replace(/[\\/:*?"<>|]/g, ' ').trim()} ${new Date().toISOString().slice(0, 10)}`;

/** The data of one tile, card or list, as rows (first row = header). */
export const pointRows = (el: HTMLElement): Value[][] =>
  fromTable(el) ?? fromChart(el) ?? fromText(el);

export async function exportPointExcel(el: HTMLElement, title: string, showing?: string | null) {
  const sheet = themedSheet(title, showing, pointRows(el));
  await writeXlsxFile(sheet.data, {
    columns: sheet.columns,
    stickyRowsCount: sheet.stickyRowsCount,
    sheet: sheetName(title, new Set()),
  }).toFile(`${fileBase(title)}.xlsx`);
}

/**
 * The whole page in one workbook (2026-10-12): a Summary sheet with every tile and its value,
 * then one sheet per card or list, in the person's order, without the hidden ones.
 */
export async function exportPageExcel(
  points: { title: string; kind: 'tile' | 'card' | 'section'; el: HTMLElement }[],
  page: string,
  showing?: string | null,
) {
  const taken = new Set<string>();
  const tiles = points.filter((p) => p.kind === 'tile');
  const summary: Value[][] = [
    ['Data point', 'Value', 'Detail'],
    ...tiles.map((t) => {
      const lines = t.el.innerText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const value = lines.find((l) => /^[\d,.%-]+$/.test(l)) ?? '';
      const n = Number(value.replace(/[,%]/g, ''));
      return [
        t.title,
        value && Number.isFinite(n) && !value.includes('%') ? n : value,
        lines
          // Not the "i" button, separators or the name again.
          .filter((l) => !/^[i|·]$/.test(l))
          .filter((l) => l !== value && l.toLowerCase() !== t.title.toLowerCase())
          .join(' ')
          .replace(/\s*·\s*/g, ' · '),
      ];
    }),
  ];
  const sheets = [
    { title: 'Summary', rows: summary },
    ...points
      .filter((p) => p.kind !== 'tile')
      .map((p) => ({ title: p.title, rows: pointRows(p.el) })),
  ].map(({ title, rows }) => {
    const s = themedSheet(title, showing, rows);
    return {
      data: s.data,
      columns: s.columns,
      stickyRowsCount: s.stickyRowsCount,
      sheet: sheetName(title, taken),
    };
  });
  await writeXlsxFile(sheets).toFile(`${fileBase(page)}.xlsx`);
}

export async function exportPointPdf(el: HTMLElement, title: string, showing?: string | null) {
  const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
  // Every row, not just the part of a list in view: inner scroll areas open up while the
  // picture is taken (index.css, [data-exporting]).
  el.setAttribute('data-exporting', '');
  let png: string;
  try {
    // JPEG at 1.5x keeps text sharp and the file small (PNG ran to 5 MB).
    png = await toJpeg(el, {
      quality: 0.92,
      pixelRatio: 1.5,
      backgroundColor: getComputedStyle(el).backgroundColor || bg,
      width: el.offsetWidth,
      height: el.scrollHeight,
      // The copy sits at the picture's corner, not where the focus view put the card.
      style: {
        position: 'static',
        left: '0',
        top: '0',
        margin: '0',
        transform: 'none',
        maxHeight: 'none',
        overflow: 'visible',
        boxShadow: 'none',
      },
      filter: (n) => !(n instanceof HTMLElement && n.dataset.noExport !== undefined),
    });
  } finally {
    el.removeAttribute('data-exporting');
  }
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = fail;
    i.src = png;
  });
  const pdf = new jsPDF({
    orientation: img.width >= img.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const m = 28;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(title, m, m + 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(
    [showing ?? '', `Exported ${stamp()} IST · Nural Dev and QA Dashboard`].filter(Boolean),
    m,
    m + 20,
  );
  const top = m + 44;
  const w = pageW - 2 * m;
  const h = (img.height / img.width) * w;
  // Tall cards continue on further pages: each page shows the next slice, with white margins.
  const blank = (y: number, height: number) => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, y, pageW, height, 'F');
  };
  let done = pageH - m - top; // image height shown on page 1
  pdf.addImage(png, 'JPEG', m, top, w, h, undefined, 'FAST');
  blank(pageH - m, m);
  while (done < h) {
    pdf.addPage();
    pdf.addImage(png, 'JPEG', m, m - done, w, h, undefined, 'FAST');
    blank(0, m);
    blank(pageH - m, m);
    done += pageH - 2 * m;
  }
  pdf.save(`${fileBase(title)}.pdf`);
}

/** A picture of one element, every row shown (inner scroll areas open up while it is taken). */
async function snap(el: HTMLElement): Promise<{ jpg: string; w: number; h: number }> {
  const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
  el.setAttribute('data-exporting', '');
  try {
    const jpg = await toJpeg(el, {
      quality: 0.9,
      pixelRatio: 1.5,
      backgroundColor: bg,
      width: el.offsetWidth,
      height: el.scrollHeight,
      style: { margin: '0', transform: 'none', maxHeight: 'none', overflow: 'visible' },
      filter: (n) => !(n instanceof HTMLElement && n.dataset.noExport !== undefined),
    });
    return { jpg, w: el.offsetWidth, h: el.scrollHeight };
  } finally {
    el.removeAttribute('data-exporting');
  }
}

/**
 * The whole page as a PDF (2026-10-12): a cover line with the page, the filters and the time,
 * then the tile rows and every card and list in the person's order, flowing over A4 landscape
 * pages; a card taller than a page continues on the next.
 */
export async function exportPagePdf(blocks: HTMLElement[], page: string, showing?: string | null) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const m = 28;
  const w = pageW - 2 * m;
  // Title band in the dashboard's blue, with a teal line under it.
  pdf.setFillColor(24, 36, 78);
  pdf.rect(0, 0, pageW, 58, 'F');
  pdf.setFillColor(5, 207, 211);
  pdf.rect(0, 58, pageW, 3, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(`Nural · ${page}`, m, 30);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`${showing || 'All data in your view'} · Exported ${stamp()} IST`, m, 46);
  pdf.setTextColor(0, 0, 0);
  let y = 76;
  for (const el of blocks) {
    const { jpg, w: iw, h: ih } = await snap(el);
    const h = (ih / iw) * w;
    if (h <= pageH - 2 * m) {
      if (y + h > pageH - m) {
        pdf.addPage();
        y = m;
      }
      pdf.addImage(jpg, 'JPEG', m, y, w, h, undefined, 'FAST');
      y += h + 12;
      continue;
    }
    // Taller than a page: slices on pages of its own.
    if (y > m) pdf.addPage();
    let done = 0;
    while (done < h) {
      if (done > 0) pdf.addPage();
      pdf.addImage(jpg, 'JPEG', m, m - done, w, h, undefined, 'FAST');
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageW, m, 'F');
      pdf.rect(0, pageH - m, pageW, m, 'F');
      done += pageH - 2 * m;
    }
    pdf.addPage();
    y = m;
  }
  // Page numbers.
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(140, 145, 168);
    pdf.text(`${page} · ${i} / ${n}`, pageW - m, pageH - 12, { align: 'right' });
  }
  pdf.save(`${fileBase(page)}.pdf`);
}

/**
 * What the page shows, in order, for the page export: each drag group on screen ("dev.tiles",
 * "dev.cards", ...) and its data points, as the person arranged them (hidden ones are not on
 * the page).
 */
export function pagePoints(root: ParentNode = document) {
  const groups = [...root.querySelectorAll<HTMLElement>('main [data-group]')];
  const points = groups.flatMap((g) => {
    const kind: 'tile' | 'card' | 'section' = g.dataset.group!.endsWith('.tiles')
      ? 'tile'
      : g.dataset.group!.endsWith('.sections')
        ? 'section'
        : 'card';
    return (
      [...g.querySelectorAll<HTMLElement>(':scope > [data-slot]')]
        // A closed list has not loaded its rows: leave it out.
        .filter((el) => kind !== 'section' || !!el.querySelector('tbody tr'))
        .map((el) => ({ kind, el, title: titleOf(el, kind) }))
    );
  });
  return { groups, points };
}

/** A data point's name as shown, without its "i" button, counts or icons. */
function titleOf(el: HTMLElement, kind: 'tile' | 'card' | 'section'): string {
  const head = el.querySelector(kind === 'tile' ? '.uppercase' : 'h2, h3');
  if (!head) return el.dataset.slot ?? 'Data';
  const c = head.cloneNode(true) as Element;
  c.querySelectorAll('button, svg, [aria-hidden="true"]').forEach((x) => x.remove());
  return clean(c.textContent) || (el.dataset.slot ?? 'Data');
}
