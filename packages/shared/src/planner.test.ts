import { describe, expect, it } from 'vitest';
import {
  defaultStart,
  entriesOn,
  missedCount,
  overdueNowList,
  planLog,
  plannerColumns,
  plannerGrid,
  planTask,
  shiftStart,
  type PlanEntry,
  type PlannerPeriodCell,
} from './planner';
import type { DeadlineEvent, MetricContext, MetricTask } from './types';

// The week of Mon 9 Nov 2026; today is Wednesday 11 Nov, 12:00 IST.
const DAY = {
  Mon: '2026-11-09',
  Tue: '2026-11-10',
  Wed: '2026-11-11',
  Thu: '2026-11-12',
  Fri: '2026-11-13',
};
type D = keyof typeof DAY;
const TODAY = DAY.Wed;
const tz = 'Asia/Kolkata';
const ctx: MetricContext = { now: new Date('2026-11-11T06:30:00Z'), tz, testers: new Set() };
const VIJAY = 28;

/** End of the working day (18:30 IST), as Bitrix24 deadlines are set. */
const dl = (d: D) => new Date(`${DAY[d]}T18:30:00+05:30`);
/** A time on that day (IST). */
const at = (d: D, hhmm = '10:00') => new Date(`${DAY[d]}T${hhmm}:00+05:30`);
const change = (from: D | null, to: D | null, on: D, hhmm = '10:00'): DeadlineEvent => ({
  from: from ? dl(from) : null,
  to: to ? dl(to) : null,
  at: at(on, hhmm),
  by: VIJAY,
});

let nextId = 1;
function task(
  o: {
    deadline?: D | null;
    changes?: DeadlineEvent[];
    done?: D;
    responsibleId?: number;
    groupId?: number;
  } = {},
): MetricTask {
  const done = o.done ? at(o.done, '16:00') : null;
  return {
    id: nextId++,
    title: 'Task',
    groupId: o.groupId ?? 154,
    stage: done ? 'QA Backlog' : 'In progress',
    stageTitle: done ? 'QA Backlog' : 'In progress',
    status: done ? 5 : 3,
    priority: 1,
    responsibleId: o.responsibleId ?? 30,
    createdBy: 10,
    createdAt: new Date('2026-11-02T05:00:00Z'),
    changedAt: new Date('2026-11-02T05:00:00Z'),
    deadline: o.deadline ? dl(o.deadline) : null,
    closedAt: done,
    parentId: null,
    relatedIds: [],
    tags: [],
    isIssue: false,
    issueType: null,
    events: done ? [{ from: 'In progress', to: 'QA Backlog', at: done, by: 30 }] : [],
    deadlineEvents: o.changes ?? [],
  };
}

/** Entries per weekday (only days with any). */
function week(t: MetricTask, planDays: string[] = [], today = TODAY) {
  const p = planTask(t, tz, planDays);
  const out: Partial<Record<D, PlanEntry[]>> = {};
  for (const d of Object.keys(DAY) as D[]) {
    const e = entriesOn(p, DAY[d], today);
    if (e.length) out[d] = e;
  }
  return out;
}
const brief = (e: PlanEntry) => `${e.kind}:${e.status}`;

describe('planner placement (SRS 25 scenarios, today Wednesday)', () => {
  it('1. deadline Tue, done Tue: green on Tue, nothing elsewhere', () => {
    const w = week(task({ deadline: 'Tue', done: 'Tue' }));
    expect(Object.keys(w)).toEqual(['Tue']);
    expect(w.Tue!.map(brief)).toEqual(['deadline:done']);
  });

  it('2. deadline Tue, not done, unchanged: red on Tue only, overdue now', () => {
    const t = task({ deadline: 'Tue' });
    const w = week(t);
    expect(Object.keys(w)).toEqual(['Tue']);
    expect(w.Tue!.map(brief)).toEqual(['deadline:missed']);
    expect(overdueNowList([t], ctx).map((o) => [o.deadline, o.daysOverdue])).toEqual([
      [DAY.Tue, 1],
    ]);
  });

  it('3. missed Tue, moved to Thu on Wed by the PM: log on Tue, 1st missed on Thu', () => {
    const w = week(task({ deadline: 'Thu', changes: [change('Tue', 'Thu', 'Wed')] }));
    expect(Object.keys(w)).toEqual(['Tue', 'Thu']);
    expect(w.Tue![0]).toMatchObject({
      kind: 'moved',
      counts: true,
      missed: 1,
      to: DAY.Thu,
      by: VIJAY,
    });
    expect(w.Thu![0]).toMatchObject({ kind: 'deadline', status: 'planned', missed: 1 });
  });

  it('4. missed Mon → Tue, missed Tue → Thu: two logs counting up, 2nd missed on Thu', () => {
    const t = task({
      deadline: 'Thu',
      changes: [change('Mon', 'Tue', 'Tue', '09:00'), change('Tue', 'Thu', 'Wed', '09:00')],
    });
    const w = week(t);
    expect(w.Mon![0]).toMatchObject({ kind: 'moved', missed: 1, to: DAY.Tue });
    expect(w.Tue![0]).toMatchObject({ kind: 'moved', missed: 2, to: DAY.Thu });
    expect(w.Thu![0]).toMatchObject({ kind: 'deadline', missed: 2 });
  });

  it('5. on Mon, deadline Thu moved to Fri: Thu cleared, Fri re-planned, nothing missed', () => {
    const t = task({ deadline: 'Fri', changes: [change('Thu', 'Fri', 'Mon')] });
    const w = week(t);
    expect(Object.keys(w)).toEqual(['Fri']);
    expect(w.Fri![0]).toMatchObject({ kind: 'deadline', replannedFrom: DAY.Thu, missed: 0 });
    expect(missedCount(planTask(t, tz))).toBe(0);
  });

  it('6. deadline Fri, taken into today’s plan: on Wed, hidden on Fri', () => {
    const w = week(task({ deadline: 'Fri' }), [DAY.Wed]);
    expect(Object.keys(w)).toEqual(['Wed']);
    expect(w.Wed![0]).toMatchObject({ kind: 'dayplan', status: 'due', deadline: DAY.Fri });
  });

  it('6b. done in the day plan on Wed: stays on Wed only', () => {
    const w = week(task({ deadline: 'Fri', done: 'Wed' }), [DAY.Wed]);
    expect(Object.keys(w)).toEqual(['Wed']);
    expect(w.Wed!.map(brief)).toEqual(['dayplan:done']);
  });

  it('6c. not done by the end of Wed: Wed red, Fri shows it again', () => {
    const w = week(task({ deadline: 'Fri' }), [DAY.Wed], DAY.Thu);
    expect(w.Wed!.map(brief)).toEqual(['dayplan:missed']);
    expect(w.Fri![0]).toMatchObject({ kind: 'deadline', notDoneInPlan: DAY.Wed });
  });

  it('7. PM pulls the deadline from Fri to Wed: pulled forward today, Fri cleared', () => {
    const t = task({ deadline: 'Wed', changes: [change('Fri', 'Wed', 'Wed', '09:00')] });
    const w = week(t);
    expect(Object.keys(w)).toEqual(['Wed']);
    expect(w.Wed![0]).toMatchObject({
      kind: 'deadline',
      status: 'due',
      pulledFrom: { day: DAY.Fri, by: VIJAY },
      missed: 0,
    });
  });

  it('8. deadline Tue changed on Tue to Thu: re-planned on Tue (not counted), Thu planned', () => {
    const t = task({ deadline: 'Thu', changes: [change('Tue', 'Thu', 'Tue', '15:00')] });
    const w = week(t);
    expect(w.Tue![0]).toMatchObject({ kind: 'replan', counts: false, to: DAY.Thu });
    expect(w.Thu!.map(brief)).toEqual(['deadline:planned']);
    expect(missedCount(planTask(t, tz))).toBe(0);
  });

  it('done early, with no day plan: Done on its deadline day', () => {
    const w = week(task({ deadline: 'Fri', done: 'Mon' }));
    expect(Object.keys(w)).toEqual(['Fri']);
    expect(w.Fri!.map(brief)).toEqual(['deadline:done']);
  });

  it('an overdue carry-over on a plan is not a day plan: it stays on the missed day', () => {
    const w = week(task({ deadline: 'Mon' }), [DAY.Tue, DAY.Wed]);
    expect(Object.keys(w)).toEqual(['Mon']);
  });

  it('a task never shows before it was created', () => {
    const t = { ...task({ deadline: 'Mon' }), createdAt: at('Tue') };
    expect(week(t)).toEqual({});
  });
});

describe('planner grid', () => {
  const list = [
    task({ responsibleId: 1, groupId: 148, deadline: 'Mon', done: 'Mon' }),
    task({ responsibleId: 1, groupId: 154, deadline: 'Tue' }),
    task({
      responsibleId: 1,
      groupId: 148,
      deadline: 'Thu',
      changes: [change('Tue', 'Thu', 'Wed')],
    }),
    task({ responsibleId: 2, groupId: 148, deadline: 'Fri' }),
    task({ responsibleId: 2, groupId: 148, deadline: 'Wed', done: 'Wed' }),
  ];

  it('day view: entries per day, done of planned per column and row', () => {
    const g = plannerGrid(list, ctx, { view: 'day', start: TODAY, by: 'assignee' });
    expect(g.columns.map((c) => c.key)).toEqual([
      DAY.Mon,
      DAY.Tue,
      DAY.Wed,
      DAY.Thu,
      DAY.Fri,
      '2026-11-14',
      '2026-11-15',
    ]);
    const a = g.rows.find((r) => r.id === 1)!;
    // Tue: the missed Tue task and the moved log of the Thu task, nothing done.
    expect(a.cells[DAY.Tue]).toMatchObject({ planned: 2, done: 0 });
    expect(a.progress).toEqual({ planned: 3, done: 1 });
    expect([a.open, a.overdueNow]).toEqual([2, 1]);
    expect(g.columnTotals[DAY.Wed]).toMatchObject({ planned: 1, done: 1 });
    expect(g.columnTotals[DAY.Fri]).toMatchObject({ planned: 1, done: 0, plannedToDate: 0 });
  });

  it('week view counts each task once per period (the moved task is planned once)', () => {
    const g = plannerGrid(list, ctx, { view: 'week', start: DAY.Mon, by: 'assignee' });
    const cell = g.rows.find((r) => r.id === 1)!.cells[DAY.Mon] as PlannerPeriodCell;
    expect(cell).toMatchObject({ planned: 3, done: 1, plannedToDate: 3, doneToDate: 1 });
    expect(cell.missedDeadlines).toBe(1);
    expect(cell.groups).toEqual([
      { id: 148, planned: 2, done: 1 },
      { id: 154, planned: 1, done: 0 },
    ]);
  });

  it('month view counts each task once too', () => {
    const g = plannerGrid(list, ctx, { view: 'month', start: DAY.Mon, by: 'assignee' });
    expect(g.columns[0]).toEqual({ key: '2026-11', from: '2026-11-01', to: '2026-11-30' });
    expect(g.columnTotals['2026-11']).toMatchObject({ planned: 5, done: 2 });
  });

  it('assignee and project grouping give the same totals', () => {
    for (const view of ['day', 'week', 'month'] as const) {
      const a = plannerGrid(list, ctx, { view, start: TODAY, by: 'assignee' });
      const p = plannerGrid(list, ctx, { view, start: TODAY, by: 'project' });
      expect(p.columnTotals).toEqual(a.columnTotals);
      expect(p.totals).toEqual(a.totals);
    }
  });

  it('uses day plans from the Daily update', () => {
    const t = task({ responsibleId: 3, deadline: 'Fri' });
    const g = plannerGrid([t], ctx, {
      view: 'day',
      start: TODAY,
      by: 'assignee',
      dayPlans: new Map([[t.id, [DAY.Wed]]]),
    });
    const r = g.rows[0]!;
    expect(r.cells[DAY.Wed]).toMatchObject({ planned: 1 });
    expect(r.cells[DAY.Fri]).toMatchObject({ planned: 0 });
  });
});

describe('planner periods and log', () => {
  it('opens this week, six weeks with four before, six months with four before', () => {
    expect(defaultStart('day', TODAY)).toBe(DAY.Mon);
    expect(defaultStart('week', TODAY)).toBe('2026-10-12');
    expect(defaultStart('month', TODAY)).toBe('2026-07-01');
    expect(plannerColumns('week', '2026-10-12').at(-1)).toEqual({
      key: '2026-11-16',
      from: '2026-11-16',
      to: '2026-11-22',
    });
    expect(shiftStart('day', TODAY, -1)).toBe('2026-11-02');
    expect(shiftStart('week', '2026-10-12', 1)).toBe('2026-11-23');
    expect(shiftStart('month', '2026-07-01', 1)).toBe('2027-01-01');
  });

  it('plan log: created, each change with its kind, the day plan, still open', () => {
    const t = task({
      deadline: 'Thu',
      changes: [change('Mon', 'Tue', 'Tue', '09:00'), change('Tue', 'Thu', 'Wed', '09:00')],
    });
    const l = planLog(t, ctx, [DAY.Wed]);
    expect(l.log.map((i) => (i.type === 'change' ? `${i.kind}${i.nth}` : i.type))).toEqual([
      'created',
      'missed1',
      'missed2',
      'dayplan',
      'open',
    ]);
    expect(l.missed).toBe(2);
    expect(l.shownOn.map((s) => s.day)).toEqual([DAY.Mon, DAY.Tue, DAY.Wed]);
  });
});
