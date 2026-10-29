import { describe, expect, it } from 'vitest';
import { isOn, timeAgo, valueOf } from './labels';

describe('employee module helpers', () => {
  it('says how long ago', () => {
    const now = new Date('2026-10-11T12:00:00Z').getTime();
    const ago = (s: number) => new Date(now - s * 1000).toISOString();
    expect(timeAgo(null, now)).toBe('-');
    expect(timeAgo(ago(20), now)).toBe('just now');
    expect(timeAgo(ago(5 * 60), now)).toBe('5 min ago');
    expect(timeAgo(ago(3 * 3600), now)).toBe('3 h ago');
    expect(timeAgo(ago(26 * 3600), now)).toBe('1 day ago');
    expect(timeAgo(ago(3 * 86_400), now)).toBe('3 days ago');
  });

  it('maps rights to on and off and back', () => {
    expect(isOn('scope', 'all')).toBe(true);
    expect(isOn('edit', 'limited')).toBe(false);
    expect(isOn('kpi', true)).toBe(true);
    expect(valueOf('scope', false)).toBe('own');
    expect(valueOf('edit', true)).toBe('all');
    expect(valueOf('admin', false)).toBe(false);
  });
});
