import { describe, expect, it } from 'vitest';
import { filterSummary } from './summary';
import { EMPTY_FILTERS } from './toParams';

const projects = new Map([
  [20, 'Moto India'],
  [8, 'Nural Edge'],
]);
const people = new Map([[34, 'Umang Singh']]);

describe('filterSummary', () => {
  it('says what is shown when nothing is filtered', () => {
    expect(filterSummary(EMPTY_FILTERS, { scope: 'all' })).toBe(
      'Showing: Tasks and issues · all projects · everyone',
    );
  });

  it('names the selected project, person, tag and dates', () => {
    expect(
      filterSummary(
        {
          ...EMPTY_FILTERS,
          project: [20],
          assignee: [34],
          tag: ['UI'],
          from: '2026-09-01',
          to: '2026-10-10',
        },
        { scope: 'dev', projects, people },
      ),
    ).toBe(
      'Showing: Dev tasks · Moto India · Umang Singh · tag UI · created 1 Sept 2026 to 10 Oct 2026',
    );
  });

  it('counts instead of listing when names are unknown or many', () => {
    expect(filterSummary({ ...EMPTY_FILTERS, project: [20, 8, 5] }, { projects })).toBe(
      'Showing: 3 projects · everyone',
    );
    expect(filterSummary({ ...EMPTY_FILTERS, type: 'bug', assignee: [99] }, { people })).toBe(
      'Showing: Bugs · all projects · 1 person',
    );
  });
});
