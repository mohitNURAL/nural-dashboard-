import { describe, expect, it } from 'vitest';
import { isNewVersion } from './useNewVersion';

describe('isNewVersion', () => {
  it('is true only when the server has a different build', () => {
    expect(isNewVersion('2026-10-11T09:00:00Z', '2026-10-11T10:00:00Z')).toBe(true);
    expect(isNewVersion('2026-10-11T09:00:00Z', '2026-10-11T09:00:00Z')).toBe(false);
    expect(isNewVersion('2026-10-11T09:00:00Z', undefined)).toBe(false);
    expect(isNewVersion('2026-10-11T09:00:00Z', '')).toBe(false);
  });
});
