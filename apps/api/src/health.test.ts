import { describe, expect, it } from 'vitest';
import { healthStatus, workMinutesBetween, workTime } from './health';

// Mon–Sat, 10:00–19:00 IST.
const work = workTime('Asia/Kolkata', '1,2,3,4,5,6', '10-19');
// Sat 10 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-10T06:30:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const base = { now: NOW, webhooksExpected: true, reconcileFailures: 0, work };

describe('health (NFR-9)', () => {
  it('counts only working minutes', () => {
    // 10:00 to 12:00 IST on a Saturday = 120 working minutes.
    expect(workMinutesBetween(ago(120), NOW, work)).toBe(120);
    // From Fri 18:00 IST: 1 h Friday + 2 h Saturday morning.
    expect(workMinutesBetween(new Date('2026-10-09T12:30:00Z'), NOW, work)).toBe(180);
    // Sunday counts nothing.
    const sunNoon = new Date('2026-10-11T06:30:00Z');
    expect(workMinutesBetween(new Date('2026-10-11T00:00:00Z'), sunNoon, work)).toBe(0);
  });

  it('is ok with a recent webhook', () => {
    expect(healthStatus({ ...base, lastWebhookOrStart: ago(30) })).toEqual({
      status: 'ok',
      reasons: [],
    });
  });

  it('degrades after 2 working hours without a webhook', () => {
    const h = healthStatus({ ...base, lastWebhookOrStart: ago(125) });
    expect(h.status).toBe('degraded');
    expect(h.reasons[0]).toMatch(/2 working hours/);
  });

  it('ignores quiet nights and Sundays', () => {
    // Last webhook Sat 18:55 IST; Monday 10:30 IST is only 35 working minutes later.
    const mon = new Date('2026-10-12T05:00:00Z');
    const h = healthStatus({
      ...base,
      now: mon,
      lastWebhookOrStart: new Date('2026-10-10T13:25:00Z'),
    });
    expect(h.status).toBe('ok');
  });

  it('skips the webhook rule when no outbound webhook is set up', () => {
    const h = healthStatus({ ...base, webhooksExpected: false, lastWebhookOrStart: ago(600) });
    expect(h.status).toBe('ok');
  });

  it('degrades after two failed reconciles in a row', () => {
    const one = healthStatus({ ...base, lastWebhookOrStart: ago(1), reconcileFailures: 1 });
    const two = healthStatus({ ...base, lastWebhookOrStart: ago(1), reconcileFailures: 2 });
    expect(one.status).toBe('ok');
    expect(two).toEqual({ status: 'degraded', reasons: ['Reconcile failed 2 times in a row'] });
  });
});
