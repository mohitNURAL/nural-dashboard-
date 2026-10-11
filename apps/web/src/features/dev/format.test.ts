import { describe, expect, it } from 'vitest';
import {
  ageingText,
  bbcodeToText,
  daysEarlyText,
  fmtDate,
  heatShade,
  initials,
  splitLine,
} from './format';

describe('daysEarlyText', () => {
  it('says early, late or on deadline', () => {
    expect(daysEarlyText(2.46)).toBe('2.5 days early');
    expect(daysEarlyText(-1)).toBe('1 day late');
    expect(daysEarlyText(0.01)).toBe('on deadline');
  });
});

describe('ageingText', () => {
  it('reads days past the deadline', () => {
    expect(ageingText(null)).toBe('');
    expect(ageingText(3)).toBe('3 days overdue');
    expect(ageingText(1)).toBe('1 day overdue');
    expect(ageingText(0)).toBe('due today');
    expect(ageingText(-2)).toBe('due in 2 days');
  });
});

describe('heatShade', () => {
  it('is empty for zero and deepens with the count', () => {
    expect(heatShade(0, 10)).toEqual({});
    expect(heatShade(1, 0)).toEqual({});
    expect(heatShade(1, 100).background).toContain('13%');
    // Mixed into the card colour, so it works on the light and the dark theme.
    expect(heatShade(10, 10)).toEqual({
      background: 'color-mix(in srgb, var(--primary) 90%, var(--surface))',
      color: 'var(--on-primary)',
    });
    expect(heatShade(2, 10).color).toBe('var(--primary-dark)');
  });
});

describe('splitLine', () => {
  it('shows the top items and how many more', () => {
    const items = [
      { name: 'Moto India', count: 473 },
      { name: 'Moto Indonesia', count: 193 },
      { name: 'Devops', count: 5 },
    ];
    expect(splitLine(items)).toBe('Moto India 473 · Moto Indonesia 193 · +1');
    expect(splitLine(items.slice(0, 1))).toBe('Moto India 473');
  });
});

describe('bbcodeToText', () => {
  it('strips tags, keeps links and list items as text', () => {
    expect(
      bbcodeToText(
        '[b]Steps[/b]\r\n[list][*]Open [url=https://x.test/a]login[/url][*]Type [i]Ne[/i][/list]',
      ),
    ).toBe('Steps\n\n• Open login (https://x.test/a)\n• Type Ne');
    expect(bbcodeToText('[url]https://x.test[/url]')).toBe('https://x.test');
    expect(bbcodeToText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
});

describe('dates and names', () => {
  it('formats in Asia/Kolkata', () => {
    // 20:00 UTC on 9 Oct is 01:30 on 10 Oct in Kolkata.
    expect(fmtDate('2026-10-09T20:00:00.000Z')).toBe('10 Oct 2026');
    expect(fmtDate(null)).toBe('—');
  });

  it('makes initials', () => {
    expect(initials('Neha Gautam')).toBe('NG');
    expect(initials('Ramprawesh')).toBe('R');
  });
});
