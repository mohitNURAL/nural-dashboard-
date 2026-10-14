import { describe, expect, it } from 'vitest';
import { dailyPrompt, snooze, wrapBeforeSignOut } from './when';

const NOW = Date.parse('2026-10-14T05:00:00Z');
const plan = { items: [], note: '' };
const morning = { working: true, plan: null, wrap: null, nowMin: 630, wrapFromMin: 1110 };

describe('when the daily update opens', () => {
  it('asks for the plan in the morning until it is posted', () => {
    expect(dailyPrompt(morning, {}, NOW)).toBe('plan');
    expect(dailyPrompt({ ...morning, plan }, {}, NOW)).toBeNull();
  });

  it('asks for the wrap-up from the end of the working day until it is posted', () => {
    const evening = { ...morning, plan, nowMin: 1115 };
    expect(dailyPrompt(evening, {}, NOW)).toBe('wrap');
    expect(dailyPrompt({ ...evening, plan: null }, {}, NOW)).toBe('wrap');
    expect(dailyPrompt({ ...evening, wrap: plan }, {}, NOW)).toBeNull();
  });

  it('never on a weekend or holiday', () => {
    expect(dailyPrompt({ ...morning, working: false }, {}, NOW)).toBeNull();
  });

  it('"Later" waits two hours', () => {
    const tour = snooze({}, NOW);
    expect(dailyPrompt(morning, tour, NOW + 3_600_000)).toBeNull();
    expect(dailyPrompt(morning, tour, NOW + 2 * 3_600_000)).toBe('plan');
  });

  it('wraps up before signing out only when the day was planned', () => {
    expect(wrapBeforeSignOut({ working: true, plan, wrap: null })).toBe(true);
    expect(wrapBeforeSignOut({ working: true, plan: null, wrap: null })).toBe(false);
    expect(wrapBeforeSignOut({ working: true, plan, wrap: plan })).toBe(false);
  });
});
