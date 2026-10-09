// Calendar-day helpers in an IANA time zone (APP_TIMEZONE, Asia/Kolkata).
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    // en-CA formats as YYYY-MM-DD.
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Calendar date of an instant in tz, as YYYY-MM-DD. */
export const dayKey = (d: Date, tz: string): string => formatter(tz).format(d);

const dayNumber = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
};

/** Whole calendar days from `from` to `to` in tz (positive when `to` is later). */
export const daysBetween = (from: Date, to: Date, tz: string): number =>
  dayNumber(dayKey(to, tz)) - dayNumber(dayKey(from, tz));

/** Days between two YYYY-MM-DD keys. */
export const daysBetweenKeys = (from: string, to: string): number =>
  dayNumber(to) - dayNumber(from);

const DAY_MS = 86_400_000;
export const diffDays = (a: Date, b: Date): number => (a.getTime() - b.getTime()) / DAY_MS;
