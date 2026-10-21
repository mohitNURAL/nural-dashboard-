import { describe, expect, it } from 'vitest';
import { filedTable, openTable } from './filedExport';

const person = (id: number, name: string) => ({ id, name, deptGroup: 'Other' as const });

describe('Last filed export', () => {
  it('lists each project, its creators and their assignees', () => {
    const table = filedTable([
      {
        id: 148,
        name: 'Moto',
        filed: 3,
        bug: 2,
        feedback: 1,
        creators: [
          {
            id: 14,
            person: person(14, 'Tester'),
            filed: 3,
            bug: 2,
            feedback: 1,
            assignees: [
              { id: 30, person: person(30, 'Dev A'), filed: 2, bug: 2, feedback: 0 },
              { id: 31, person: person(31, 'Dev B'), filed: 1, bug: 0, feedback: 1 },
            ],
          },
        ],
      },
    ]);
    expect(table).toEqual([
      ['Project', 'Creator', 'Assignee', 'Filed', 'Bug', 'Feedback'],
      ['Moto', 'All', 'All', 3, 2, 1],
      ['Moto', 'Tester', 'All', 3, 2, 1],
      ['Moto', 'Tester', 'Dev A', 2, 2, 0],
      ['Moto', 'Tester', 'Dev B', 1, 0, 1],
    ]);
  });

  it('lists open issues with Pending and Overdue', () => {
    const table = openTable([
      {
        id: 148,
        name: 'Moto',
        pending: 2,
        overdue: 1,
        creators: [
          {
            id: 14,
            person: person(14, 'Tester'),
            pending: 2,
            overdue: 1,
            assignees: [{ id: 30, person: person(30, 'Dev A'), pending: 2, overdue: 1 }],
          },
        ],
      },
    ]);
    expect(table).toEqual([
      ['Project', 'Creator', 'Assignee', 'Pending', 'Overdue'],
      ['Moto', 'All', 'All', 2, 1],
      ['Moto', 'Tester', 'All', 2, 1],
      ['Moto', 'Tester', 'Dev A', 2, 1],
    ]);
  });
});
