// Period resolution in portal time (IST, UTC+05:30 — no DST).

const IST_MS = 330 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** UTC ms of local IST midnight for the given IST calendar date. */
const istMidnight = (y, m, d) => Date.UTC(y, m, d) - IST_MS;

function istParts(ms) {
  const d = new Date(ms + IST_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

const fmtDate = (ms) => {
  const { y, m, d } = istParts(ms);
  return `${String(d).padStart(2, '0')} ${MONTHS[m]} ${y}`;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class PeriodError extends Error {}

/**
 * @param {{period?: string, from?: string, to?: string}} q
 * @returns {{key: string, from: number, to: number, label: string, trendMonths: {key: string, label: string, from: number, to: number}[]}}
 */
export function resolvePeriod(q = {}, now = Date.now()) {
  const key = q.period || 'quarter';
  const { y, m } = istParts(now);
  let from, to, label, trendStart;

  if (key === 'month') {
    from = istMidnight(y, m, 1);
    to = now;
    label = 'This Month';
    trendStart = { y, m };
  } else if (key === 'quarter') {
    from = istMidnight(y, m - (m % 3), 1);
    to = now;
    label = 'This Quarter';
    // FR-8: This Quarter shows the last 3 months.
    trendStart = istParts(istMidnight(y, m - 2, 1));
  } else if (key === 'custom') {
    if (!DATE_RE.test(q.from || '') || !DATE_RE.test(q.to || '')) throw new PeriodError('Custom period needs from and to as YYYY-MM-DD');
    const [fy, fm, fd] = q.from.split('-').map(Number);
    const [ty, tm, td] = q.to.split('-').map(Number);
    from = istMidnight(fy, fm - 1, fd);
    to = istMidnight(ty, tm - 1, td + 1) - 1;
    if (from > to) throw new PeriodError('Start date must be on or before the end date');
    label = `${fmtDate(from)} – ${fmtDate(to)}`;
    trendStart = { y: fy, m: fm - 1 };
  } else {
    throw new PeriodError(`Unknown period "${key}"`);
  }

  const trendMonths = [];
  const end = istParts(to);
  const showYear = trendStart.y !== end.y || end.y !== y;
  let cy = trendStart.y;
  let cm = trendStart.m;
  while ((cy < end.y || (cy === end.y && cm <= end.m)) && trendMonths.length < 36) {
    trendMonths.push({
      key: `${cy}-${String(cm + 1).padStart(2, '0')}`,
      label: showYear ? `${MONTHS[cm]} ${String(cy).slice(2)}` : MONTHS[cm],
      from: istMidnight(cy, cm, 1),
      to: istMidnight(cy, cm + 1, 1) - 1,
    });
    if (++cm === 12) { cm = 0; cy++; }
  }

  return { key, from, to, label, trendMonths };
}

export const inRange = (ms, p) => ms != null && ms >= p.from && ms <= p.to;
