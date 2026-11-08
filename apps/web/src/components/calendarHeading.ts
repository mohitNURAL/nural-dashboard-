// Column headings and dates of the Tasks in hand planner (2026-11-08), shared by the popup and its
// files. Days are YYYY-MM-DD (IST), read as plain dates.
import type { PlannerGrid, PlannerView } from '../api/types';

type Column = PlannerGrid['columns'][number];

const utc = (k: string) => new Date(`${k}T00:00:00Z`);
const fmt = (k: string, o: Intl.DateTimeFormatOptions) =>
  utc(k).toLocaleDateString('en-IN', { timeZone: 'UTC', ...o });
export const isWeekend = (k: string) => [0, 6].includes(utc(k).getUTCDay());

/** "11 Nov". */
export const shortDay = (k: string) => fmt(k, { day: 'numeric', month: 'short' });
/** "Wed 11 Nov". */
export const longDay = (k: string) => `${fmt(k, { weekday: 'short' })} ${shortDay(k)}`;

const plus = (k: string, n: number) => {
  const d = utc(k);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The column's two header lines: what it is (Today, This week, …), and its dates. */
export function heading(view: PlannerView, c: Column, today: string): [string, string] {
  if (view === 'day') {
    const top =
      c.from === today
        ? 'Today'
        : c.from === plus(today, 1)
          ? 'Tomorrow'
          : c.from === plus(today, -1)
            ? 'Yesterday'
            : fmt(c.from, { weekday: 'short' });
    return [top, shortDay(c.from)];
  }
  const now = c.from <= today && today <= c.to;
  if (view === 'week')
    return [
      now ? 'This week' : `Week of ${shortDay(c.from)}`,
      `${shortDay(c.from)} – ${shortDay(c.to)}`,
    ];
  return [
    now ? 'This month' : fmt(c.from, { month: 'long' }),
    fmt(c.from, { month: 'short', year: 'numeric' }),
  ];
}

/** The ‹ period › label: "9 Nov – 15 Nov 2026", or "Jul 2026 – Dec 2026". */
export function periodLabel(view: PlannerView, columns: readonly Column[]): string {
  const a = columns[0];
  const b = columns[columns.length - 1];
  if (!a || !b) return '';
  if (view === 'month')
    return `${fmt(a.from, { month: 'short', year: 'numeric' })} – ${fmt(b.from, { month: 'short', year: 'numeric' })}`;
  return `${shortDay(a.from)} – ${shortDay(b.to)} ${fmt(b.to, { year: 'numeric' })}`;
}

/** 1st, 2nd, 3rd, 4th … */
export const ordinal = (n: number) => {
  const t = n % 100;
  const s =
    t >= 11 && t <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${s}`;
};
