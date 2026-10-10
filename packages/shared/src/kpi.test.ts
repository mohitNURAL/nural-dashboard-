import { describe, expect, it } from 'vitest';
import { workCalendar } from './calendar';
import {
  bulkClosedIds,
  heatOf,
  hotProjects,
  insights,
  kpiList,
  kpiScope,
  kpiSummary,
  kpiTask,
  overdueBreakdown,
  overdueBucket,
  peoplePerformance,
  periodBounds,
  projectHealth,
  projectStatus,
  rates,
  workload,
  type KpiContext,
} from './kpi';
import type { MetricTask, StageEvent } from './types';

const ist = (local: string) => new Date(`${local}+05:30`);
// Monday 12 Oct 2026, 12:00 IST.
const NOW = ist('2026-10-12T12:00');
const cal = workCalendar({ holidays: [{ date: '2026-10-02' }] });
const ctx: KpiContext = {
  now: NOW,
  tz: 'Asia/Kolkata',
  cal,
  deptOf: (id) => (id >= 100 ? 'qa' : id >= 50 ? 'support' : 'dev'),
};

let nextId = 1;
function task(over: Partial<MetricTask> = {}): MetricTask {
  return {
    id: nextId++,
    title: 'T',
    groupId: 10,
    stage: 'To do',
    stageTitle: 'To do',
    status: 2,
    priority: 1,
    responsibleId: 1,
    createdBy: 1,
    createdAt: ist('2026-10-05T09:30'),
    changedAt: NOW,
    deadline: null,
    closedAt: null,
    parentId: null,
    relatedIds: [],
    tags: [],
    isIssue: false,
    issueType: null,
    events: [],
    ...over,
  };
}
const ev = (from: StageEvent['from'], to: StageEvent['to'], at: Date): StageEvent => ({
  from,
  to,
  at,
  by: 1,
});

describe('KPI per task (SRS 13.2)', () => {
  it('closed = first QA Backlog, else the closed date; on time against the deadline', () => {
    const k = kpiTask(
      task({
        deadline: ist('2026-10-08T18:30'),
        events: [ev('In progress', 'QA Backlog', ist('2026-10-07T18:30'))],
        closedAt: ist('2026-10-09T12:00'),
      }),
      ctx,
    );
    expect(k.actualEnd).toEqual(ist('2026-10-07T18:30'));
    expect(k.endFromClose).toBe(false);
    expect(k.onTime).toBe(true);
    expect(k.open).toBe(false);
    const support = kpiTask(task({ closedAt: ist('2026-10-06T09:30') }), ctx);
    expect(support.endFromClose).toBe(true);
    expect(support.onTime).toBeNull(); // no deadline
  });

  it('open, overdue and days late', () => {
    const k = kpiTask(task({ deadline: ist('2026-10-09T18:30') }), ctx);
    expect(k).toMatchObject({ open: true, overdue: true, daysOverdue: 3 });
    expect(kpiTask(task({ deadline: ist('2026-10-13T18:30') }), ctx).overdue).toBe(false);
    expect(kpiTask(task(), ctx).overdue).toBe(false);
  });
});

describe('periods and rates', () => {
  it('week = Monday to Monday in IST; month = calendar month', () => {
    expect(periodBounds(NOW, 'week', cal)).toEqual({
      start: ist('2026-10-12T00:00'),
      end: ist('2026-10-19T00:00'),
    });
    expect(periodBounds(NOW, 'week', cal, 1).start).toEqual(ist('2026-10-05T00:00'));
    expect(periodBounds(NOW, 'month', cal)).toEqual({
      start: ist('2026-10-01T00:00'),
      end: ist('2026-11-01T00:00'),
    });
    expect(periodBounds(NOW, 'day', cal, 1).start).toEqual(ist('2026-10-11T00:00'));
  });

  it('bulk closes (30+ in one project on one day) are left out', () => {
    const day = ist('2026-10-12T10:00');
    const bulk = Array.from({ length: 30 }, () => kpiTask(task({ closedAt: day }), ctx));
    const few = Array.from({ length: 5 }, () => kpiTask(task({ groupId: 11, closedAt: day }), ctx));
    const ids = bulkClosedIds([...bulk, ...few], 'Asia/Kolkata');
    expect(ids.size).toBe(30);
    expect(rates([...bulk, ...few], periodBounds(NOW, 'day', cal), ids).closed).toBe(5);
  });

  it('on-time % over closed tasks with a deadline; overdue % over open tasks', () => {
    const list = [
      task({ deadline: ist('2026-10-12T18:30'), closedAt: ist('2026-10-12T10:00') }), // on time
      task({ deadline: ist('2026-10-12T09:30'), closedAt: ist('2026-10-12T11:30') }), // late
      task({ closedAt: ist('2026-10-12T11:00') }), // no deadline
      task({ deadline: ist('2026-10-09T18:30') }), // overdue
      task(),
    ].map((t) => kpiTask(t, ctx));
    expect(rates(list, periodBounds(NOW, 'day', cal), new Set())).toMatchObject({
      closed: 3,
      withDeadline: 2,
      onTime: 1,
      onTimePct: 50,
      open: 2,
      overdue: 1,
      overduePct: 50,
    });
  });
});

describe('projects, people, overdue, activity', () => {
  it('project status: red, amber, green', () => {
    const base = { open: 10, overdue: 0, oldestOverdueDays: 0, silent: false };
    expect(projectStatus(base)).toBe('green');
    expect(projectStatus({ ...base, overdue: 3 })).toBe('red'); // 30 % overdue
    expect(projectStatus({ ...base, open: 3, overdue: 1 })).toBe('amber'); // only 1 task
    expect(projectStatus({ ...base, overdue: 1, oldestOverdueDays: 31 })).toBe('red');
    expect(projectStatus({ ...base, overdue: 2, oldestOverdueDays: 10 })).toBe('amber');
    expect(projectStatus({ ...base, silent: true })).toBe('amber');
  });

  it('project health: silent after 10 working days, red first', () => {
    const quiet = task({
      groupId: 20,
      changedAt: ist('2026-09-01T10:00'),
      deadline: ist('2026-12-01T18:30'),
    });
    const late = [1, 2, 3].map(() => task({ groupId: 21, deadline: ist('2026-10-01T18:30') }));
    const rows = projectHealth(kpiScope([quiet, ...late], ctx), ctx, 'week', (g) => g * 100);
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      [21, 'red'],
      [20, 'amber'],
    ]);
    expect(rows[1]).toMatchObject({ silent: true, ownerId: 2000, open: 1, overdue: 0 });
    expect(rows[0]).toMatchObject({ overdue: 3, oldestOverdueDays: 11 });
    // A recent comment keeps a project active.
    const commented = projectHealth(
      kpiScope([quiet], ctx),
      { ...ctx, comments: [{ taskId: quiet.id, at: ist('2026-10-12T09:00') }] },
      'week',
      () => null,
    );
    expect(commented[0]!.silent).toBe(false);
  });

  it('workload in counts: overdue, due in 10 working days, later, no deadline', () => {
    const scope = kpiScope(
      [
        task({ deadline: ist('2026-10-13T18:30') }),
        task({ deadline: ist('2026-10-09T18:30') }),
        task({ deadline: ist('2026-12-31T18:30') }),
        task(),
        task({ groupId: 0, deadline: ist('2026-10-13T18:30') }), // no project: left out
      ],
      ctx,
    );
    expect(workload(scope, ctx)).toEqual([
      { id: 1, open: 4, overdue: 1, dueSoon: 1, later: 1, noDeadline: 1, projects: 1 },
    ]);
  });

  it('people: closed this period, previous period and an 8-period spark', () => {
    const scope = kpiScope(
      [
        task({ responsibleId: 2, closedAt: ist('2026-10-12T10:00') }),
        task({ responsibleId: 2, closedAt: ist('2026-10-06T10:00') }),
        task({ responsibleId: 2 }),
      ],
      ctx,
    );
    const [p] = peoplePerformance(scope, ctx, 'week');
    expect(p).toMatchObject({ id: 2, dept: 'dev', closedPrev: 1 });
    expect(p!.rates.closed).toBe(1);
    expect(p!.spark).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it('overdue chips: 1–2, 3–7, 8–30, over 30 days', () => {
    expect([0, 2, 3, 7, 8, 30, 31].map(overdueBucket)).toEqual([
      '1-2',
      '1-2',
      '3-7',
      '3-7',
      '8-30',
      '8-30',
      '30+',
    ]);
    const scope = kpiScope(
      [
        task({ deadline: ist('2026-10-09T18:30') }),
        task({ groupId: 0, deadline: ist('2026-08-01T18:30') }),
      ],
      ctx,
    );
    const o = overdueBreakdown(scope);
    expect(o.total).toBe(2);
    expect(o.buckets).toEqual({ '1-2': 0, '3-7': 1, '8-30': 0, '30+': 1 });
    expect(o.byProject.map((g) => g.id)).toEqual([10]); // the no-project task is in the total only
  });

  it('activity: counts of the last 7 days, ranked by heat', () => {
    expect(heatOf({ newTasks: 2, bugs: 1, moves: 4, comments: 3 })).toBe(14);
    const bug = task({
      createdAt: ist('2026-10-10T10:00'),
      isIssue: true,
      issueType: 'bug',
      tags: ['bug'],
    });
    const moved = task({
      groupId: 11,
      createdAt: ist('2026-09-01T10:00'),
      events: [ev('To do', 'In progress', ist('2026-10-11T10:00'))],
    });
    const hot = hotProjects(kpiScope([bug, moved], ctx), {
      ...ctx,
      comments: [{ taskId: moved.id, at: ist('2026-10-12T09:00') }],
    });
    expect(hot.map((h) => [h.id, h.parts])).toEqual([
      [10, { newTasks: 1, bugs: 1, moves: 0, comments: 0 }],
      [11, { newTasks: 0, bugs: 0, moves: 1, comments: 1 }],
    ]);
    expect(hot[1]!.spark.slice(-2)).toEqual([1, 1]);
  });

  it('activity leaves out bulk clean-ups and their automatic comments', () => {
    const at = ist('2026-10-10T15:00');
    const bulk = Array.from({ length: 30 }, () =>
      task({ groupId: 30, createdAt: ist('2026-09-01T10:00'), events: [ev('To do', 'LIVE', at)] }),
    );
    const real = task({
      groupId: 30,
      createdAt: ist('2026-09-01T10:00'),
      events: [ev('To do', 'In progress', at)],
    });
    const comments = [...bulk.map((t) => ({ taskId: t.id, at })), { taskId: real.id, at }];
    const [hot] = hotProjects(kpiScope([...bulk, real], ctx), { ...ctx, comments });
    expect(hot!.parts).toEqual({ newTasks: 0, bugs: 0, moves: 1, comments: 1 });
  });
});

describe('summary, insights, drill-down lists', () => {
  const list = [
    task({ responsibleId: 1, deadline: ist('2026-08-01T18:30') }), // overdue 72 days
    task({ responsibleId: 1, deadline: ist('2026-10-13T18:30') }), // due soon
    task({ responsibleId: 60 }), // support, no deadline
    task({
      responsibleId: 120,
      closedAt: ist('2026-10-12T09:00'),
      deadline: ist('2026-10-13T18:30'),
    }),
    task({ responsibleId: 1, groupId: 0 }), // no project
  ];

  it('summary tiles add up', () => {
    const scope = kpiScope(list, ctx);
    const s = kpiSummary(
      scope,
      ctx,
      'week',
      projectHealth(scope, ctx, 'week', () => null),
    );
    expect(s).toMatchObject({
      open: 4,
      openByDept: { dev: 3, qa: 0, support: 1, other: 0 },
      overdue: 1,
      overduePct: 25,
      overdueOver30: 1,
      closed: 1,
      onTimePct: 100,
      activeProjects: 1,
      silentProjects: 0,
      noDeadline: 2,
      noProject: { open: 1 },
    });
  });

  it('department filter keeps that department only', () => {
    expect(kpiScope(list, ctx, 'support').all.map((k) => k.t.responsibleId)).toEqual([60]);
  });

  it('every insight links to the same tasks as its number', () => {
    const scope = kpiScope(list, ctx);
    const found = insights(
      scope,
      ctx,
      projectHealth(scope, ctx, 'week', () => null),
      {
        person: (id) => `P${id}`,
        project: (id) => `G${id}`,
      },
    );
    const long = found.find((i) => i.id === 'longOverdue')!;
    expect(long.text).toBe('1 tasks are more than 30 days past their deadline');
    expect(kpiList(list, ctx, { preset: 'overdue', ageing: '30+' })).toHaveLength(1);
    expect(kpiList(list, ctx, { preset: 'dueSoon' })).toHaveLength(1);
    expect(kpiList(list, ctx, { preset: 'noDeadline' })).toHaveLength(2);
    expect(kpiList(list, ctx, { preset: 'open', noProject: true })).toHaveLength(1);
    expect(kpiList(list, ctx, { preset: 'closed', period: 'week' })).toHaveLength(1);
  });
});
