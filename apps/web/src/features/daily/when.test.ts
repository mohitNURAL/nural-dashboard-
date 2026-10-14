import { describe, expect, it } from 'vitest';
import { wrapBeforeSignOut } from './when';

const plan = { items: [], note: '' };

describe('when the daily update opens', () => {
  it('wraps up before signing out only when the day was planned', () => {
    expect(wrapBeforeSignOut({ working: true, plan, wrap: null })).toBe(true);
    expect(wrapBeforeSignOut({ working: true, plan: null, wrap: null })).toBe(false);
    expect(wrapBeforeSignOut({ working: true, plan, wrap: plan })).toBe(false);
    expect(wrapBeforeSignOut({ working: false, plan, wrap: null })).toBe(false);
  });
});
