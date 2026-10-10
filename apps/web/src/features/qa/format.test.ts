import { describe, expect, it } from 'vitest';
import { darken, lastFiledText, shadeSteps } from './format';

describe('shadeSteps', () => {
  it('keeps the first use of a colour and darkens each repeat', () => {
    expect(shadeSteps(['#00C4FB', '#FDB051', '#FDB051', '#fdb051', '#8EC82F'])).toEqual([
      '#00C4FB',
      '#FDB051',
      '#CF9042',
      '#A27134',
      '#8EC82F',
    ]);
  });
});

describe('darken', () => {
  it('mixes towards black', () => {
    expect(darken('#FFFFFF', 0)).toBe('#FFFFFF');
    expect(darken('#FFFFFF', 0.5)).toBe('#808080');
    expect(darken('#FDB051', 1)).toBe('#000000');
  });
});

describe('lastFiledText', () => {
  it('says Today or the Kolkata date', () => {
    expect(lastFiledText({ date: '2026-10-10', isToday: true })).toBe('Today');
    expect(lastFiledText({ date: '2026-10-09', isToday: false })).toBe('9 Oct 2026');
    expect(lastFiledText(null)).toBe('—');
  });
});
