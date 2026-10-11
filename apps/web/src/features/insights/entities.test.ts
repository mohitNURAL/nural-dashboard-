import { describe, expect, it } from 'vitest';
import type { Insights } from './api';
import { tileEntities } from './entities';

const data = {
  window: 14,
  viewScope: 'all',
  tiles: {
    laggingProjects: 1,
    laggingPeople: 1,
    overloaded: 1,
    underloaded: 0,
    shared: 1,
    atRisk: 2,
  },
  ids: { laggingProjects: [], laggingPeople: [], overloaded: [], underloaded: [], atRisk: [] },
  keyPoints: [],
  projects: [
    {
      id: 1,
      name: 'Edge',
      owner: null,
      open: 10,
      overdue: 4,
      overdueShare: 0.4,
      closedNow: 1,
      closedPrev: 5,
      idleDays: null,
      lagging: true,
      reasons: ['4 of 10 open overdue'],
      score: 3,
      overdueIds: [11, 12, 13, 14],
      openIds: [],
    },
    {
      id: 2,
      name: 'Calm',
      owner: null,
      open: 3,
      overdue: 0,
      overdueShare: 0,
      closedNow: 2,
      closedPrev: 2,
      idleDays: null,
      lagging: false,
      reasons: [],
      score: 0,
      overdueIds: [],
      openIds: [21],
    },
  ],
  people: [
    {
      id: 7,
      name: 'Asha',
      open: 6,
      overdue: 3,
      closedNow: 0,
      closedPrev: 4,
      onTime: 20,
      lagging: true,
      reasons: [],
      overdueIds: [31, 32, 33],
      closedIds: [34],
    },
  ],
  load: [
    {
      id: 7,
      name: 'Asha',
      open: 12,
      overdue: 3,
      dueSoon: 9,
      closedNow: 0,
      projects: 2,
      level: 'over',
      reason: null,
      openIds: [41, 42],
      dueSoonIds: [],
    },
  ],
  overlap: {
    shared: [
      {
        id: 7,
        name: 'Asha',
        projects: [
          { id: 1, name: 'Edge', open: 4, overdue: 2, activity: 1 },
          { id: 2, name: 'Calm', open: 1, overdue: 0, activity: 3 },
        ],
      },
    ],
    pulls: [],
  },
  releases: [
    {
      id: 51,
      title: 'a',
      project: 'Edge',
      assignee: 'Asha',
      deadline: '',
      stage: null,
      week: 'this',
      risk: 'high',
      reason: 'Overdue',
    },
    {
      id: 52,
      title: 'b',
      project: 'Edge',
      assignee: 'Asha',
      deadline: '',
      stage: null,
      week: 'next',
      risk: 'high',
      reason: 'Not started',
    },
    {
      id: 53,
      title: 'c',
      project: 'Calm',
      assignee: 'Asha',
      deadline: '',
      stage: null,
      week: 'this',
      risk: 'low',
      reason: '',
    },
  ],
  absences: null,
} as Insights;

describe('Insights tiles list who or what they count', () => {
  it('lagging projects: only the lagging ones, with reason and overdue tasks', () => {
    const l = tileEntities('laggingProjects', data, 'Lagging projects');
    expect(l).toMatchObject({ kind: 'project', total: 1 });
    expect(l.rows).toEqual([
      expect.objectContaining({
        name: 'Edge',
        reason: '4 of 10 open overdue',
        ids: [11, 12, 13, 14],
      }),
    ]);
  });

  it('lagging people get a reason in words when the rules give none', () => {
    const [p] = tileEntities('laggingPeople', data, 'Lagging people').rows;
    expect(p!.reason).toBe('3 of 6 open overdue; 20 % on time');
    expect(p!.ids).toEqual([31, 32, 33, 34]);
  });

  it('overloaded people, split people and releases by project', () => {
    expect(tileEntities('overloaded', data, 'x').rows[0]).toMatchObject({
      name: 'Asha',
      reason: '12 open, 9 due in the next 5 working days',
      ids: [41, 42],
    });
    expect(tileEntities('shared', data, 'x').rows[0]!.reason).toBe(
      'Open work in 2 projects: Edge (4 open, 2 overdue), Calm (1 open)',
    );
    const risk = tileEntities('atRisk', data, 'x');
    expect(risk.rows).toEqual([expect.objectContaining({ name: 'Edge', ids: [51, 52] })]);
    expect(tileEntities('underloaded', data, 'x').rows).toEqual([]);
  });
});
