import { describe, expect, it } from 'vitest';
import { DAILY_EXCLUDED } from './context';

describe('Daily update exclusions (config/daily-exclude.json)', () => {
  it('leaves the directors, the admin account and the others out of who is expected to post', () => {
    expect([...DAILY_EXCLUDED].sort((a, b) => a - b)).toEqual([1, 18, 22, 40, 42, 54, 66, 68, 166]);
  });
});
