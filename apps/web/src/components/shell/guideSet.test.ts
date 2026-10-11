import { describe, expect, it } from 'vitest';
import { guideSet } from './guideSet';

const me = (over: Record<string, boolean>) => ({
  admin: false,
  employees: false,
  kpi: false,
  full: false,
  support: false,
  ...over,
});

describe('guide set', () => {
  it('follows the rights, widest first', () => {
    expect(guideSet(me({ admin: true, employees: true, kpi: true }))).toBe('admin');
    expect(guideSet(me({ employees: true, kpi: true, support: true }))).toBe('manager');
    expect(guideSet(me({ kpi: true, full: true }))).toBe('owner');
    expect(guideSet(me({ support: true }))).toBe('support');
    expect(guideSet(me({}))).toBe('member');
    expect(guideSet(undefined)).toBe('member');
  });
});
