import { describe, expect, it } from 'vitest';
import { INFO } from '../info';
import { drillInfo } from './drillInfo';

describe('drillInfo', () => {
  it('falls back to the plain All tasks text', () => {
    expect(drillInfo(null)).toBe(INFO.allTasks);
  });

  it('explains a tile or table count by its rule', () => {
    expect(
      drillInfo({ label: 'Umang Singh · Pending', preset: 'pending', params: { assignee: '34' } }),
    ).toBe(`Umang Singh · Pending: ${INFO.pending}`);
  });

  it('adds the narrowing rules of a matrix cell or an alert', () => {
    expect(
      drillInfo({
        label: 'Umang Singh · To do, overdue',
        preset: 'total',
        params: { stage: 'To do', overdue: 'true' },
      }),
    ).toBe('Umang Singh · To do, overdue: In To do. Overdue only.');
    expect(
      drillInfo({
        label: 'Nural Edge · over 5 days',
        preset: 'total',
        params: { stuck: 'true', owner: '14', stage: 'QA Backlog,In QA' },
      }),
    ).toBe(
      'Nural Edge · over 5 days: In QA Backlog, In QA. More than 5 days in their current stage. Person = assignee, or the tester / QA lead in QA Backlog and In QA.',
    );
  });

  it('explains ageing buckets and the speed ranking', () => {
    expect(drillInfo({ label: 'over 30', preset: 'pending', params: { ageing: '30+' } })).toBe(
      `over 30: ${INFO.pending} Open, over 30 days past deadline.`,
    );
    expect(drillInfo({ label: 'Tushar', preset: 'completed', params: { ranked: 'true' } })).toBe(
      'Tushar: Sent to QA with a deadline (speed ranking).',
    );
  });
});
