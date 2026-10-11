import { describe, expect, it } from 'vitest';
import { isNewVersion, whatsNewText } from './useNewVersion';

describe('isNewVersion', () => {
  it('is true only when the server has a different build', () => {
    expect(isNewVersion('2026-10-11T09:00:00Z', '2026-10-11T10:00:00Z')).toBe(true);
    expect(isNewVersion('2026-10-11T09:00:00Z', '2026-10-11T09:00:00Z')).toBe(false);
    expect(isNewVersion('2026-10-11T09:00:00Z', undefined)).toBe(false);
    expect(isNewVersion('2026-10-11T09:00:00Z', '')).toBe(false);
  });
});

describe('whatsNewText', () => {
  it('lists only what the running page does not know yet', () => {
    const news = [
      { id: 'tour', title: 'Guided tour', tab: 'dev' },
      { id: 'old', title: 'Support tab', tab: 'support' },
    ];
    expect(whatsNewText(news, ['old'])).toBe(
      "What's new: Guided tour (Development). Refresh to see it; the dashboard will show you around.",
    );
    expect(whatsNewText(news, ['tour', 'old'])).toMatch(/^Improvements and fixes/);
    expect(whatsNewText(undefined, [])).toMatch(/^Improvements and fixes/);
  });
});
