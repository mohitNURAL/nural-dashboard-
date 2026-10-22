// Follow Up Summary: customers (leads/deals) with an open follow-up due today,
// this week, this month, this quarter, next quarter, overdue, or with no deadline.
// Windows are in portal time (IST); a week runs Monday–Sunday, Week/Month
// include today, and quarters are Indian financial-year quarters
// (Apr–Jun = Q1 … Jan–Mar = Q4).

import { dealRow, leadRow } from './records.js';

const IST_MS = 330 * 60_000;
const DAY = 86_400_000;
export const WINDOWS = ['today', 'week', 'month', 'quarter', 'nextQuarter', 'overdue', 'noDeadline'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A financial-year quarter relative to the one containing `now` (offset 0 = this
 * quarter, 1 = next), e.g. "Jan–Mar 2027 · Q4 FY27".
 */
export function fyQuarter(now, offset = 0) {
  const d = new Date(now + IST_MS);
  const startMonth = d.getUTCMonth() - (d.getUTCMonth() % 3) + 3 * offset; // calendar quarters line up with FY quarters
  const start = Date.UTC(d.getUTCFullYear(), startMonth, 1) - IST_MS;
  const end = Date.UTC(d.getUTCFullYear(), startMonth + 3, 1) - IST_MS - 1;
  const first = new Date(start + IST_MS);
  const m = first.getUTCMonth();
  const fyEnd = m >= 3 ? first.getUTCFullYear() + 1 : first.getUTCFullYear(); // FY runs Apr–Mar, named by its end year
  const q = m >= 3 ? Math.floor((m - 3) / 3) + 1 : 4;
  return { start, end, label: `${MONTHS[m]}–${MONTHS[m + 2]} ${first.getUTCFullYear()} · Q${q} FY${String(fyEnd).slice(2)}` };
}

export const nextQuarter = (now) => fyQuarter(now, 1);

export function followUpWindows(now) {
  const d = new Date(now + IST_MS);
  const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
  const todayStart = Date.UTC(y, m, day) - IST_MS;
  const daysToSunday = 6 - ((d.getUTCDay() + 6) % 7);
  const [thisQ, nextQ] = [fyQuarter(now, 0), fyQuarter(now, 1)];
  return {
    today: [todayStart, todayStart + DAY - 1],
    week: [todayStart, todayStart + (daysToSunday + 1) * DAY - 1],
    month: [todayStart, Date.UTC(y, m + 1, 1) - IST_MS - 1],
    quarter: [todayStart, thisQ.end],
    nextQuarter: [nextQ.start, nextQ.end],
    overdue: [-Infinity, todayStart - 1],
  };
}

/** Follow-ups grouped by the lead/deal they belong to, within the pipeline scope. */
function byRecord(model, pipeline) {
  const records = {
    deal: new Map(model.deals.map((d) => [d.id, d])),
    lead: new Map(model.leads.map((l) => [l.id, l])),
  };
  const groups = new Map();
  for (const f of model.followUps ?? []) {
    const record = records[f.ownerType].get(f.ownerId);
    if (!record || (pipeline !== 'all' && record.family !== pipeline)) continue; // record deleted or out of scope
    const key = `${f.ownerType}-${f.ownerId}`;
    if (!groups.has(key)) groups.set(key, { type: f.ownerType, record, followUps: [] });
    groups.get(key).followUps.push(f);
  }
  return [...groups.values()];
}

const inWindow = ([from, to]) => (f) => f.due != null && f.due >= from && f.due <= to;
const matcher = (window, now) => (window === 'noDeadline' ? (f) => f.due == null : inWindow(followUpWindows(now)[window]));

export function computeFollowUpSummary(model, { pipeline, now }) {
  const groups = byRecord(model, pipeline);
  const count = (w) => groups.filter((g) => g.followUps.some(matcher(w, now))).length;
  return {
    ...Object.fromEntries(WINDOWS.map((w) => [w, count(w)])),
    quarterLabel: fyQuarter(now, 0).label,
    nextQuarterLabel: fyQuarter(now, 1).label,
  };
}

/** One row per customer, showing the earliest follow-up in the window. */
export function computeFollowUpList(model, ctx, window) {
  if (!WINDOWS.includes(window)) throw new RangeError(`Unknown follow-up window "${window}"`);
  const match = matcher(window, ctx.now);
  const rowCtx = { now: ctx.now, portal: ctx.portal };
  const rows = byRecord(model, ctx.pipeline)
    .map((g) => ({ g, due: g.followUps.filter(match).sort((a, b) => (a.due ?? 0) - (b.due ?? 0)) }))
    .filter(({ due }) => due.length)
    .map(({ g, due }) => {
      const next = due[0];
      const base = g.type === 'deal' ? dealRow(g.record, rowCtx) : leadRow(g.record, rowCtx);
      return {
        ...base,
        // Who has to follow up, not who owns the record.
        owner: next.responsible,
        followUp: { subject: next.subject, kind: next.kind, due: next.due, more: due.length - 1 },
      };
    })
    // No-deadline rows have no due time to order by; list them by company.
    .sort((a, b) => (a.followUp.due ?? 0) - (b.followUp.due ?? 0) || String(a.company ?? '').localeCompare(String(b.company ?? '')));
  return { window, count: rows.length, totalValue: rows.reduce((s, r) => s + r.value, 0), rows };
}
