// Column headings of the Tasks in hand planner (2026-10-20), shared by the popup and its files.
import type { InHandCalendar } from '../api/types';

type View = InHandCalendar['view'];
type Column = InHandCalendar['columns'][number];

const utc = (k: string) => new Date(`${k}T00:00:00Z`);
const fmt = (k: string, o: Intl.DateTimeFormatOptions) =>
  utc(k).toLocaleDateString('en-IN', { timeZone: 'UTC', ...o });
export const isWeekend = (k: string) => [0, 6].includes(utc(k).getUTCDay());

/** The column's two header lines: what it is, and its dates. */
export function heading(view: View, c: Column, i: number, today: string): [string, string] {
  if (c.key === 'later')
    return ['Later', `from ${fmt(c.from, { day: 'numeric', month: 'short' })}`];
  if (view === 'day') {
    const top =
      c.from === today ? 'Today' : i === 1 ? 'Tomorrow' : fmt(c.from, { weekday: 'short' });
    return [top, fmt(c.from, { day: 'numeric', month: 'short' })];
  }
  if (view === 'week') {
    const top = i === 0 ? 'This week' : i === 1 ? 'Next week' : `Week ${i + 1}`;
    return [
      top,
      `${fmt(c.from, { day: 'numeric' })}–${fmt(c.to!, { day: 'numeric', month: 'short' })}`,
    ];
  }
  const top = i === 0 ? 'This month' : i === 1 ? 'Next month' : fmt(c.from, { year: 'numeric' });
  return [top, fmt(c.from, { month: 'long' })];
}

/** One-line heading for a file: "Mon 20 Oct", "20–26 Oct", "October 2026", "Later (from 3 Nov)". */
export function fileHeading(view: View, c: Column, i: number, today: string): string {
  const [top, dates] = heading(view, c, i, today);
  if (c.key === 'later') return `Later (${dates})`;
  if (view === 'month') return `${dates} ${fmt(c.from, { year: 'numeric' })}`;
  return view === 'day' ? `${fmt(c.from, { weekday: 'short' })} ${dates}` : dates || top;
}
