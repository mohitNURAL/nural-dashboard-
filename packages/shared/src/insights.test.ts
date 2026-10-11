import { describe, expect, it } from 'vitest';
import { workCalendar } from './calendar';
import { keyPoints, load, overlap, peopleLag, projectLag, releasePlan, windows } from './insights';
import { kpiScope, type KpiContext } from './kpi';
import type { MetricTask, StageEvent } from './types';

const ist = (local: string) => new Date(`${local}+05:30`);
// Monday 12 Oct 2026, 12:00 IST.
const NOW = ist('2026-10-12T12:00');
const ctx: KpiContext = { now: NOW, tz: 'Asia/Kolkata', cal: workCalendar(), deptOf: () => 'dev' };

let id = 1;
function task(over: Partial<MetricTask> = {}): MetricTask {
  const stage = over.stage ?? 'To do';
  return {
    id: id++,
    title: 'T',
    groupId: 10,
    stage,
    stageTitle: stage,
    status: 2,
    priority: 1,
    responsibleId: 1,
    createdBy: 1,
    createdAt: ist('2026-09-01T10:00'),
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
const move = (at: Date, by = 1, to: StageEvent['to'] = 'QA Backlog'): StageEvent => ({
  from: 'In progress',
  to,
  at,
  by,
});
const late = ist('2026-10-01T18:00'); // overdue by now
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const many = (n: number, over: Partial<MetricTask>) => Array.from({ length: n }, () => task(over));
const scopeOf = (tasks: MetricTask[]) => kpiScope(tasks, ctx);

describe('projects that lag', () => {
  it('flags a high overdue share and says why; healthy projects are not flagged', () => {
    const tasks = [
      ...many(4, { groupId: 10, deadline: late, events: [move(days(1), 1, 'In progress')] }),
      ...many(4, { groupId: 10, events: [move(days(1), 1, 'In progress')] }),
      ...many(6, { groupId: 20, events: [move(days(1), 2, 'In progress')], responsibleId: 2 }),
    ];
    const rows = projectLag(scopeOf(tasks), ctx);
    const p10 = rows.find((r) => r.id === 10)!;
    expect(p10).toMatchObject({ open: 8, overdue: 4, lagging: true });
    expect(p10.reasons[0]).toBe('4 of 8 open tasks overdue (50 %)');
    expect(rows.find((r) => r.id === 20)!.lagging).toBe(false);
    expect(rows[0]!.id).toBe(10);
  });

  it('flags a slowdown against the period before', () => {
    const tasks = [
      ...many(6, {
        groupId: 30,
        stage: 'QA Backlog',
        closedAt: days(20),
        events: [move(days(20))],
      }),
      ...many(1, { groupId: 30, stage: 'QA Backlog', closedAt: days(3), events: [move(days(3))] }),
      ...many(3, { groupId: 30, events: [move(days(1), 1, 'In progress')] }),
    ];
    const p = projectLag(scopeOf(tasks), ctx).find((r) => r.id === 30)!;
    expect(p.reasons).toContain('closed 1 in the last period vs 6 before');
  });
});

describe('people who lag', () => {
  it('flags overdue work and a low on-time rate', () => {
    const tasks = [
      ...many(3, { responsibleId: 5, deadline: late }),
      ...many(2, { responsibleId: 5 }),
      // Closed late three times in the window.
      ...many(3, {
        responsibleId: 6,
        stage: 'QA Backlog',
        deadline: days(9),
        events: [move(days(5), 6)],
      }),
    ];
    const rows = peopleLag(scopeOf(tasks), ctx);
    expect(rows.find((r) => r.id === 5)!.reasons).toEqual(['3 of 5 open tasks overdue']);
    expect(rows.find((r) => r.id === 6)).toMatchObject({ onTime: 0, lagging: true });
  });
});

describe('load', () => {
  it('finds the overloaded and those with room while their project is behind', () => {
    const soon = ist('2026-10-14T18:00');
    const tasks = [
      ...many(12, { responsibleId: 1, deadline: soon }), // 12 open, due soon
      ...many(3, { responsibleId: 2 }),
      ...many(3, { responsibleId: 3 }),
      task({ responsibleId: 4 }), // 1 open, nothing closed
      task({ responsibleId: 2, deadline: late }), // project 10 has overdue work
    ];
    const rows = load(scopeOf(tasks), ctx);
    expect(rows.find((r) => r.id === 1)).toMatchObject({ level: 'over', dueSoon: 12 });
    expect(rows.find((r) => r.id === 4)!.level).toBe('under');
    expect(rows.find((r) => r.id === 3)!.level).toBe('ok');
  });
});

describe('project overlap', () => {
  it('shows which project pulls a person off another that goes overdue', () => {
    const tasks = [
      // Person 7 works on project 40 (4 moves in the window)...
      ...many(4, { groupId: 40, responsibleId: 7, events: [move(days(2), 7, 'In progress')] }),
      // ...while their project 50 tasks go overdue untouched.
      ...many(3, { groupId: 50, responsibleId: 7, deadline: late }),
      // Person 8 splits evenly: not a pull.
      ...many(2, { groupId: 40, responsibleId: 8, events: [move(days(2), 8, 'In progress')] }),
      ...many(2, {
        groupId: 50,
        responsibleId: 8,
        deadline: late,
        events: [move(days(2), 8, 'In progress')],
      }),
    ];
    const { shared, pulls } = overlap(scopeOf(tasks), ctx);
    expect(shared.map((s) => s.id).sort()).toEqual([7, 8]);
    expect(pulls).toHaveLength(1);
    expect(pulls[0]).toMatchObject({ pulling: 40, suffering: 50, people: [7] });
    expect(pulls[0]!.overdueIds).toHaveLength(3);
  });
});

describe('release plan', () => {
  it('lists tasks due this week and next with their risk', () => {
    const tasks = [
      task({ deadline: ist('2026-10-13T18:00') }), // tomorrow, not started: high
      task({ deadline: ist('2026-10-16T18:00'), stage: 'In progress' }), // this week, in progress: medium
      task({ deadline: ist('2026-10-21T18:00'), stage: 'Pending for QA' }), // next week, waiting for QA: low
      task({ deadline: ist('2026-11-20T18:00') }), // later: not listed
      task({ deadline: ist('2026-10-14T18:00'), stage: 'Done', closedAt: days(1) }), // done: not listed
    ];
    const plan = releasePlan(scopeOf(tasks), ctx);
    expect(plan.map((r) => [r.week, r.risk])).toEqual([
      ['this', 'high'],
      ['this', 'medium'],
      ['next', 'low'],
    ]);
  });
});

describe('what is holding us back', () => {
  it('ranks the findings and keeps the tasks behind each', () => {
    const tasks = [
      ...many(4, { groupId: 40, responsibleId: 7, events: [move(days(2), 7, 'In progress')] }),
      ...many(3, { groupId: 50, responsibleId: 7, deadline: late }),
    ];
    const s = scopeOf(tasks);
    const w = windows(ctx);
    const points = keyPoints(
      {
        projects: projectLag(s, ctx, w),
        people: peopleLag(s, ctx, w),
        load: load(s, ctx, w),
        pulls: overlap(s, ctx, w).pulls,
        releases: releasePlan(s, ctx),
      },
      { project: (g) => `P${g}`, person: (p) => `Person ${p}` },
    );
    expect(points[0]!.kind).toBe('pull');
    expect(points[0]!.text).toBe(
      'P40 is taking the time of Person 7 while P50 has 3 of their tasks overdue',
    );
    expect(points[0]!.taskIds).toHaveLength(3);
    expect(points.some((p) => p.kind === 'project' && p.subject === 50)).toBe(true);
  });
});
