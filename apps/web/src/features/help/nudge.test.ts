import { describe, expect, it } from 'vitest';
import { answer, shouldAsk } from './nudge';

const NOW = Date.parse('2026-10-12T10:00:00Z');
const H = 3_600_000;

describe('asking for feedback', () => {
  it('waits a day after the first sign-in', () => {
    const p = { loginCount: 5, tour: {}, firstSignInAt: new Date(NOW - 20 * H).toISOString() };
    expect(shouldAsk(p, NOW)).toBe(false);
    expect(shouldAsk({ ...p, firstSignInAt: new Date(NOW - 25 * H).toISOString() }, NOW)).toBe(
      true,
    );
  });

  it('people from before the first sign-in was kept are asked from their second sign-in', () => {
    expect(shouldAsk({ loginCount: 1, tour: {}, firstSignInAt: null }, NOW)).toBe(false);
    expect(shouldAsk({ loginCount: 2, tour: {}, firstSignInAt: null }, NOW)).toBe(true);
  });

  it('Later asks again in 7 days; never means never', () => {
    const tour = answer({}, NOW, 7);
    expect(shouldAsk({ loginCount: 9, tour }, NOW + 6 * 24 * H)).toBe(false);
    expect(shouldAsk({ loginCount: 9, tour }, NOW + 7 * 24 * H)).toBe(true);
    expect(shouldAsk({ loginCount: 9, tour: answer(tour, NOW, 'never') }, NOW + 99 * 24 * H)).toBe(
      false,
    );
  });
});
