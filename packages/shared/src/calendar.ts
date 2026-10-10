// Working calendar for the KPI tab (SRS 13.1): Monday to Friday, 09:30 to 18:30 Asia/Kolkata,
// public holidays excluded. Every KPI hour is a working hour. Day arithmetic uses the zone's
// fixed UTC offset (Asia/Kolkata has no daylight saving), so it is cheap enough to run per task.

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

export interface WorkCalendar {
  /** Minutes east of UTC (Asia/Kolkata = 330). */
  offsetMin: number;
  /** ISO weekdays that are working days, 1 = Monday … 7 = Sunday. */
  days: ReadonlySet<number>;
  /** Working window, minutes after local midnight: [start, end). */
  startMin: number;
  endMin: number;
  /** Local dates (YYYY-MM-DD) that are public holidays. */
  holidays: ReadonlySet<string>;
  /** The same holidays as local day numbers, ascending (fast range counts). */
  holidayDays: readonly number[];
}

export interface CalendarConfig {
  offsetMin?: number;
  days?: number[];
  /** "09:30" */
  start?: string;
  /** "18:30" */
  end?: string;
  holidays?: { date: string; name?: string }[];
}

const toMin = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function workCalendar(c: CalendarConfig = {}): WorkCalendar {
  return {
    offsetMin: c.offsetMin ?? 330,
    days: new Set(c.days ?? [1, 2, 3, 4, 5]),
    startMin: toMin(c.start ?? '09:30'),
    endMin: toMin(c.end ?? '18:30'),
    holidays: new Set((c.holidays ?? []).map((h) => h.date)),
    holidayDays: (c.holidays ?? [])
      .map((h) => Math.floor(Date.parse(`${h.date}T00:00:00Z`) / DAY_MS))
      .filter(Number.isFinite)
      .sort((a, b) => a - b),
  };
}

/** Hours in one working day (9 for 09:30–18:30). */
export const dayHours = (cal: WorkCalendar) => (cal.endMin - cal.startMin) / 60;

/** Local day number since 1970-01-01 for an instant. */
const localDay = (ms: number, cal: WorkCalendar) =>
  Math.floor((ms + cal.offsetMin * MIN_MS) / DAY_MS);

/** ISO weekday of a local day number (day 0 = Thursday 1 Jan 1970). */
const weekday = (day: number) => ((((day + 3) % 7) + 7) % 7) + 1;

const dateKey = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

export function isWorkingDay(day: number, cal: WorkCalendar): boolean {
  return cal.days.has(weekday(day)) && (cal.holidays.size === 0 || !cal.holidays.has(dateKey(day)));
}

/** Working days in the local day range [from, to], counted by whole weeks, then holidays. */
function countWorkingDays(from: number, to: number, cal: WorkCalendar): number {
  const n = to - from + 1;
  if (n <= 0) return 0;
  const weeks = Math.floor(n / 7);
  let count = weeks * cal.days.size;
  for (let d = from + weeks * 7; d <= to; d++) if (cal.days.has(weekday(d))) count++;
  for (const h of cal.holidayDays) if (h >= from && h <= to && cal.days.has(weekday(h))) count--;
  return count;
}

/** UTC ms where a local day's working window opens and closes. */
const windowOf = (day: number, cal: WorkCalendar): [number, number] => {
  const midnight = day * DAY_MS - cal.offsetMin * MIN_MS;
  return [midnight + cal.startMin * MIN_MS, midnight + cal.endMin * MIN_MS];
};

/** Working hours between two instants (0 when `to` is not after `from`). */
export function workingHours(from: Date, to: Date, cal: WorkCalendar): number {
  const a = from.getTime();
  const b = to.getTime();
  if (!(b > a)) return 0;
  const part = (day: number) => {
    if (!isWorkingDay(day, cal)) return 0;
    const [open, close] = windowOf(day, cal);
    return Math.max(0, Math.min(b, close) - Math.max(a, open));
  };
  const first = localDay(a, cal);
  const last = localDay(b, cal);
  if (first === last) return part(first) / 3_600_000;
  // First and last days partly; every day between in full.
  const full = countWorkingDays(first + 1, last - 1, cal) * (cal.endMin - cal.startMin) * MIN_MS;
  return (part(first) + full + part(last)) / 3_600_000;
}

/** The instant `hours` working hours after `from`. */
export function addWorkingHours(from: Date, hours: number, cal: WorkCalendar): Date {
  let left = Math.max(0, hours) * 3_600_000;
  let t = from.getTime();
  // Two years of days is far beyond any forecast; the bound only guards a bad calendar.
  for (let day = localDay(t, cal), i = 0; i < 730; day++, i++) {
    if (!isWorkingDay(day, cal)) continue;
    const [open, close] = windowOf(day, cal);
    const start = Math.max(t, open);
    if (start >= close) continue;
    if (start + left <= close) return new Date(start + left);
    left -= close - start;
    t = close;
  }
  return new Date(t + left);
}

/** Working days between two instants (whole and part days, as working hours / day hours). */
export const workingDays = (from: Date, to: Date, cal: WorkCalendar) =>
  workingHours(from, to, cal) / dayHours(cal);
