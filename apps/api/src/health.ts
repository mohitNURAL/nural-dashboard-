// NFR-9 health rules, as a pure function: /health turns "degraded" (HTTP 503, which the uptime
// monitor alerts on) when no webhook arrived for 2 working hours, or the reconcile failed twice
// in a row.

export interface WorkTime {
  tz: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  days: ReadonlySet<number>;
  /** Working hours [start, end), e.g. [10, 19]. */
  hours: readonly [number, number];
}

export interface HealthInput {
  now: Date;
  /** Last accepted webhook, or when the process started if none since. */
  lastWebhookOrStart: Date;
  /** False when no outbound webhook is set up (no token): the webhook rule is skipped. */
  webhooksExpected: boolean;
  reconcileFailures: number;
  work: WorkTime;
}

export const SILENT_WORK_MINUTES = 120;
export const MAX_RECONCILE_FAILURES = 2;
const STEP_MIN = 5;
/** Look back at most two weeks (holidays). */
const MAX_STEPS = (14 * 24 * 60) / STEP_MIN;

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function isWorkTime(d: Date, w: WorkTime): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: w.tz,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const day = WEEKDAY[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? 0;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return w.days.has(day) && hour >= w.hours[0] && hour < w.hours[1];
}

/** Working minutes between `from` and `to` (5-minute steps), capped at `cap`. */
export function workMinutesBetween(from: Date, to: Date, w: WorkTime, cap = Infinity): number {
  let total = 0;
  let t = to.getTime() - STEP_MIN * 60_000;
  for (let i = 0; i < MAX_STEPS && t >= from.getTime() && total < cap; i++) {
    if (isWorkTime(new Date(t), w)) total += STEP_MIN;
    t -= STEP_MIN * 60_000;
  }
  return total;
}

export function healthStatus(h: HealthInput): { status: 'ok' | 'degraded'; reasons: string[] } {
  const reasons: string[] = [];
  if (
    h.webhooksExpected &&
    workMinutesBetween(h.lastWebhookOrStart, h.now, h.work, SILENT_WORK_MINUTES) >=
      SILENT_WORK_MINUTES
  ) {
    reasons.push('No Bitrix24 webhook for 2 working hours');
  }
  if (h.reconcileFailures >= MAX_RECONCILE_FAILURES) {
    reasons.push(`Reconcile failed ${h.reconcileFailures} times in a row`);
  }
  return { status: reasons.length ? 'degraded' : 'ok', reasons };
}

/** "1,2,3,4,5,6" and "10-19" from the env. */
export function workTime(tz: string, days: string, hours: string): WorkTime {
  const [start = 10, end = 19] = hours.split('-').map(Number);
  return {
    tz,
    days: new Set(
      days
        .split(',')
        .map((d) => Number(d.trim()))
        .filter(Boolean),
    ),
    hours: [start, end],
  };
}
