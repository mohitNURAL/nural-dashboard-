import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, hasFilters, toParams } from './toParams';

describe('toParams', () => {
  it('leaves empty filters out', () => {
    expect(toParams('dev', EMPTY_FILTERS)).toEqual({});
    expect(hasFilters('dev', EMPTY_FILTERS)).toBe(false);
  });

  it('joins lists in a stable order', () => {
    const f = { ...EMPTY_FILTERS, project: [154, 148], assignee: [9, 3], tag: ['ui', 'api'] };
    expect(toParams('dev', f)).toEqual({ project: '148,154', assignee: '3,9', tag: 'api,ui' });
  });

  it('sends Tag only on Development and Bug or Feedback only on QA', () => {
    const f = { ...EMPTY_FILTERS, tag: ['ui'], type: 'bug' as const };
    expect(toParams('dev', f)).toEqual({ tag: 'ui' });
    expect(toParams('qa', f)).toEqual({ type: 'bug' });
  });

  it('sends the date field only with a range, defaulting to created', () => {
    expect(toParams('dev', { ...EMPTY_FILTERS, from: '2026-10-01' })).toEqual({
      dateField: 'created',
      from: '2026-10-01',
    });
    expect(toParams('dev', { ...EMPTY_FILTERS, dateField: 'deadline' })).toEqual({});
    expect(
      toParams('qa', {
        ...EMPTY_FILTERS,
        dateField: 'deadline',
        from: '2026-10-01',
        to: '2026-10-10',
      }),
    ).toEqual({ dateField: 'deadline', from: '2026-10-01', to: '2026-10-10' });
  });
});
