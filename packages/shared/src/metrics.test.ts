import { describe, expect, it } from 'vitest';
import {
  ageingBucket,
  applyFilters,
  ageingByAssignee,
  assigneeTable,
  completedAt,
  devSummary,
  devSummaryParts,
  devTasks,
  filterOptions,
  indexTasks,
  isDueToday,
  isOverdue,
  issueAgeByAssignee,
  issues,
  issuesByAssignee,
  issuesByStage,
  lastFiled,
  presetPredicate,
  qaSummary,
  reworkByDeveloper,
  reworkCount,
  speedRanking,
  stageMatrix,
  testingTasks,
  testingWorkload,
  waitingForRetest,
} from './metrics';
import { issueTypeOf } from './tags';
import { dayKey } from './time';
import type { MetricContext, MetricTask, StageEvent } from './types';

// "Now" is 10 Oct 2026, 12:00 IST (06:30 UTC).
const NOW = new Date('2026-10-10T06:30:00Z');
const TESTER = 14;
const ctx: MetricContext = { now: NOW, tz: 'Asia/Kolkata', testers: new Set([TESTER, 16]) };

let nextId = 1;
function task(over: Partial<MetricTask> = {}): MetricTask {
  const tags = over.tags ?? [];
  const issueType = over.issueType !== undefined ? over.issueType : issueTypeOf(tags);
  return {
    id: nextId++,
    title: 'Task',
    groupId: 154,
    stage: 'To do',
    stageTitle: 'To do',
    status: 2,
    priority: 1,
    responsibleId: 30,
    createdBy: 10,
    createdAt: new Date('2026-10-01T05:00:00Z'),
    changedAt: new Date('2026-10-05T05:00:00Z'),
    deadline: null,
    closedAt: null,
    parentId: null,
    relatedIds: [],
    tags,
    isIssue: over.isIssue ?? issueType !== null,
    issueType,
    events: [],
    ...over,
  };
}

const ev = (from: StageEvent['from'], to: StageEvent['to'], at: string, by = 14): StageEvent => ({
  from,
  to,
  at: new Date(at),
  by,
});

describe('per-task rules', () => {
  it('overdue = pending, not On Hold, deadline passed', () => {
    const past = new Date('2026-10-09T10:00:00Z');
    expect(isOverdue(task({ stage: 'In progress', deadline: past }), ctx)).toBe(true);
    expect(isOverdue(task({ stage: 'On Hold', deadline: past }), ctx)).toBe(false);
    expect(isOverdue(task({ stage: 'QA Backlog', deadline: past }), ctx)).toBe(false);
    expect(
      isOverdue(task({ stage: 'To do', deadline: new Date('2026-10-10T12:00:00Z') }), ctx),
    ).toBe(false);
  });

  it('uses the IST calendar day for "today"', () => {
    // 2026-10-10 20:00 UTC is already 11 Oct 01:30 in IST.
    expect(dayKey(new Date('2026-10-10T20:00:00Z'), ctx.tz)).toBe('2026-10-11');
    // 2026-10-09 19:00 UTC is 10 Oct 00:30 IST, so it is due today.
    expect(isDueToday(task({ deadline: new Date('2026-10-09T19:00:00Z') }), ctx)).toBe(true);
    expect(isDueToday(task({ deadline: new Date('2026-10-09T18:00:00Z') }), ctx)).toBe(false);
    expect(
      isDueToday(task({ stage: 'LIVE', deadline: new Date('2026-10-10T10:00:00Z') }), ctx),
    ).toBe(false);
  });

  it('completedAt = first move into any sent-to-QA stage, else closed date', () => {
    const t = task({
      events: [
        ev('To do', 'In progress', '2026-10-02T05:00:00Z'),
        ev('In progress', 'Done', '2026-10-03T05:00:00Z'),
        ev('Done', 'To do', '2026-10-04T05:00:00Z'),
        ev('To do', 'QA Backlog', '2026-10-06T05:00:00Z'),
      ],
      closedAt: new Date('2026-10-07T05:00:00Z'),
    });
    expect(completedAt(t)?.toISOString()).toBe('2026-10-03T05:00:00.000Z');
    expect(completedAt(task({ closedAt: new Date('2026-10-07T05:00:00Z') }))?.toISOString()).toBe(
      '2026-10-07T05:00:00.000Z',
    );
    expect(completedAt(task())).toBeNull();
  });

  it('buckets ageing by days past deadline', () => {
    expect(ageingBucket(task(), ctx)).toBe('noDeadline');
    expect(ageingBucket(task({ deadline: new Date('2026-10-12T00:00:00Z') }), ctx)).toBe('notDue');
    expect(ageingBucket(task({ deadline: new Date('2026-10-10T01:00:00Z') }), ctx)).toBe('0-2');
    expect(ageingBucket(task({ deadline: new Date('2026-10-05T06:00:00Z') }), ctx)).toBe('3-7');
    expect(ageingBucket(task({ deadline: new Date('2026-09-30T06:00:00Z') }), ctx)).toBe('8-14');
    // 15 to 30 days late, then over 30.
    expect(ageingBucket(task({ deadline: new Date('2026-09-25T06:00:00Z') }), ctx)).toBe('15-30');
    expect(ageingBucket(task({ deadline: new Date('2026-09-10T06:00:00Z') }), ctx)).toBe('15-30');
    expect(ageingBucket(task({ deadline: new Date('2026-09-09T06:00:00Z') }), ctx)).toBe('30+');
    expect(ageingBucket(task({ deadline: new Date('2026-09-01T06:00:00Z') }), ctx)).toBe('30+');
  });
});

describe('selection', () => {
  const all = [
    task({ id: 101 }),
    task({ id: 102, responsibleId: TESTER }),
    task({ id: 103, tags: ['Bug'] }),
    task({ id: 104, groupId: 0, responsibleId: 16 }),
    task({ id: 105, tags: ['Re-Testing'], responsibleId: 30 }),
  ];

  it('development tab excludes issues, testers and tasks outside workgroups', () => {
    expect(devTasks(all, ctx).map((t) => t.id)).toEqual([101, 105]);
  });

  it('development tab scopes: dev, issues or all, Development department only', () => {
    expect(devTasks(all, ctx, 'issues').map((t) => t.id)).toEqual([103]);
    expect(devTasks(all, ctx, 'all').map((t) => t.id)).toEqual([101, 103, 105]);
    // With the department list, someone outside Development (user 99) is left out.
    const withOther = [...all, task({ id: 106, responsibleId: 99 })];
    const devCtx = { ...ctx, developers: new Set([30]) };
    expect(devTasks(withOther, devCtx, 'all').map((t) => t.id)).toEqual([101, 103, 105]);
    expect(devTasks(withOther, ctx, 'all').map((t) => t.id)).toContain(106);
  });

  it('testing tasks = tagged testing/re-testing or assigned to a tester', () => {
    expect(testingTasks(all, ctx).map((t) => t.id)).toEqual([102, 104, 105]);
  });

  it('issues = bug, feedback, feedbacks or Re-Open tags', () => {
    expect(issueTypeOf(['FEEDBACKS'])).toBe('feedback');
    expect(issueTypeOf(['Client feedback'])).toBeNull();
    expect(issueTypeOf(['Re-Open'])).toBe('bug');
    expect(issues(all).map((t) => t.id)).toEqual([103]);
  });
});

describe('filters', () => {
  const all = [
    task({ id: 201, groupId: 148, responsibleId: 30, tags: ['API'] }),
    task({ id: 202, groupId: 148, responsibleId: 28, tags: ['api', 'UI'] }),
    task({ id: 203, groupId: 154, responsibleId: 24, createdAt: new Date('2026-09-15T05:00:00Z') }),
  ];

  it('applies project, assignee, tag and date filters', () => {
    expect(applyFilters(all, { projectIds: [148] }, ctx.tz).map((t) => t.id)).toEqual([201, 202]);
    expect(applyFilters(all, { tags: ['Api'] }, ctx.tz)).toHaveLength(2);
    expect(applyFilters(all, { from: '2026-09-20' }, ctx.tz).map((t) => t.id)).toEqual([201, 202]);
    expect(applyFilters(all, { dateField: 'deadline', from: '2026-01-01' }, ctx.tz)).toHaveLength(
      0,
    );
  });

  it('gives contextual options: a project narrows assignees but not projects', () => {
    const o = filterOptions(all, { projectIds: [148] }, ctx.tz);
    expect(o.assignees.map((a) => a.value).sort()).toEqual([28, 30]);
    expect(o.projects.map((p) => p.value).sort()).toEqual([148, 154]);
    expect(o.tags).toEqual([
      { value: 'API', count: 2 },
      { value: 'UI', count: 1 },
    ]);
  });
});

describe('Development tab', () => {
  const past = new Date('2026-10-08T06:00:00Z');
  const tasks = [
    task({ id: 301, stage: 'To do', deadline: past }),
    task({ id: 302, stage: 'On Hold', deadline: past }),
    task({ id: 303, stage: 'In progress', responsibleId: 28 }),
    task({
      id: 304,
      stage: 'QA Backlog',
      events: [ev('In progress', 'QA Backlog', '2026-10-10T04:00:00Z')],
    }),
    task({ id: 305, stage: 'Done', responsibleId: 28 }),
    task({ id: 306, stage: 'LIVE' }),
    task({ id: 307, stage: null, stageTitle: 'Name' }),
  ];

  it('computes the 7 tiles', () => {
    expect(devSummary(tasks, ctx)).toMatchObject({
      total: 7,
      completed: 3,
      pending: 3,
      ready: 1,
      deployed: 1,
      overdue: 1,
      doneToday: 1,
      unmapped: 1,
      split: null,
    });
    expect(devSummary(tasks, ctx, { projectIds: [154] }).split).toEqual({
      by: 'project',
      items: [{ id: 154, count: 7 }],
    });
  });

  it('splits the tiles into Dev and Issues, or Bug and Feedback', () => {
    const list = [
      task({ stage: 'In progress' }),
      task({ stage: 'Done' }),
      task({ tags: ['Bug'], stage: 'In progress' }),
      task({ tags: ['Feedback'], stage: 'LIVE' }),
      task({ tags: ['bug'], stage: 'Done' }),
    ];
    const all = devSummaryParts(list, ctx, 'all');
    expect(all.map((p) => [p.key, p.total, p.pending, p.ready])).toEqual([
      ['dev', 2, 1, 1],
      ['issues', 3, 1, 1],
    ]);
    const issuesOnly = list.filter((t) => t.isIssue);
    expect(
      devSummaryParts(issuesOnly, ctx, 'issues').map((p) => [p.key, p.total, p.deployed]),
    ).toEqual([
      ['bug', 2, 0],
      ['feedback', 1, 1],
    ]);
    expect(devSummaryParts(list, ctx, 'dev')).toEqual([]);
  });

  it('builds the assignee table with totals', () => {
    const { rows, totals } = assigneeTable(tasks, ctx);
    expect(rows[0]).toMatchObject({ id: 30, total: 5, pending: 2, done: 2, completedToday: 1 });
    expect(totals).toMatchObject({ total: 7, pending: 3, done: 3 });
  });

  it('groups the assignee table, ageing and matrix by project', () => {
    const list = [...tasks, task({ groupId: 148, responsibleId: 30 })];
    const { rows, totals } = assigneeTable(list, ctx, 'project');
    expect(rows.map((r) => [r.id, r.total])).toEqual([
      [154, 7],
      [148, 1],
    ]);
    expect(totals.total).toBe(8);
    expect(ageingByAssignee(list, ctx, 'project').rows.map((r) => r.id)).toEqual([154, 148]);
    expect(stageMatrix(list, { by: 'project' }).rows.map((r) => [r.id, r.total])).toEqual([
      [154, 7],
      [148, 1],
    ]);
  });

  it('builds the stage matrix and tag toggle', () => {
    const m = stageMatrix([...tasks, task({ stage: 'In QA', tags: ['API'], responsibleId: 28 })], {
      tag: 'api',
    });
    expect(m.rows).toEqual([expect.objectContaining({ id: 28, total: 1 })]);
    expect(m.rows[0]!.cells['In QA']).toBe(1);
    expect(m.tags).toEqual([{ value: 'API', count: 1 }]);
    const late = task({ stage: 'In progress', deadline: new Date('2026-10-01T00:00:00Z') });
    const withCtx = stageMatrix([late, task({ stage: 'In progress' })], { ctx });
    expect(withCtx.rows[0]!.cells['In progress']).toBe(2);
    expect(withCtx.rows[0]!.overdue['In progress']).toBe(1);
  });

  it('ranks by on-time % then average days early, min 3 tasks', () => {
    const done = (who: number, deadline: string, at: string) =>
      task({
        responsibleId: who,
        stage: 'Done',
        deadline: new Date(deadline),
        events: [ev('In progress', 'QA Backlog', at)],
      });
    const list = [
      // 40: 3 tasks, all on time, avg 2 days early
      done(40, '2026-10-05T00:00:00Z', '2026-10-03T00:00:00Z'),
      done(40, '2026-10-05T00:00:00Z', '2026-10-03T00:00:00Z'),
      done(40, '2026-10-05T00:00:00Z', '2026-10-03T00:00:00Z'),
      // 41: 3 tasks, all on time, avg 4 days early -> rank 1
      done(41, '2026-10-05T00:00:00Z', '2026-10-01T00:00:00Z'),
      done(41, '2026-10-05T00:00:00Z', '2026-10-01T00:00:00Z'),
      done(41, '2026-10-05T00:00:00Z', '2026-10-01T00:00:00Z'),
      // 42: 2 tasks -> listed, not ranked
      done(42, '2026-10-05T00:00:00Z', '2026-09-01T00:00:00Z'),
      done(42, '2026-10-05T00:00:00Z', '2026-09-01T00:00:00Z'),
      // 43: 3 tasks, one late -> 66.7% on time
      done(43, '2026-10-05T00:00:00Z', '2026-09-25T00:00:00Z'),
      done(43, '2026-10-05T00:00:00Z', '2026-09-25T00:00:00Z'),
      done(43, '2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z'),
      // no deadline -> ignored
      task({
        responsibleId: 44,
        stage: 'Done',
        events: [ev('To do', 'Done', '2026-10-01T00:00:00Z')],
      }),
    ];
    const r = speedRanking(list);
    expect(r.map((x) => [x.id, x.rank, x.badge])).toEqual([
      [41, 1, true],
      [40, 2, true],
      [43, 3, true],
      [42, null, false],
    ]);
    expect(r[0]).toMatchObject({ completed: 3, avgDaysEarly: 4, onTimePct: 100 });
    expect(r[2]!.onTimePct).toBe(66.7);

    // Limited to the Development group: others are left out entirely.
    const devOnly = speedRanking(list, { eligible: new Set([40, 42]) });
    expect(devOnly.map((x) => [x.id, x.rank])).toEqual([
      [40, 1],
      [42, null],
    ]);
  });
});

describe('QA tab', () => {
  const parentIssue = task({ id: 401, tags: ['Bug'], stage: 'Done', responsibleId: 30 });
  const reopenedTwice = task({
    id: 402,
    tags: ['Bug'],
    stage: 'In progress',
    responsibleId: 30,
    events: [
      ev('To do', 'QA Backlog', '2026-10-02T05:00:00Z'),
      ev('In QA', 'To do', '2026-10-03T05:00:00Z'),
      ev('To do', 'In QA', '2026-10-04T05:00:00Z'),
      ev('Issue Raised', 'In progress', '2026-10-05T05:00:00Z'),
    ],
  });
  const raisedOnIssue = task({
    id: 403,
    tags: ['Feedback', 'Re-Open'],
    parentId: 401,
    responsibleId: 28,
  });
  const tagOnly = task({ id: 404, tags: ['Reopen'], responsibleId: 28, stage: 'In QA' });
  const plain = task({
    id: 405,
    tags: ['bug'],
    responsibleId: 24,
    stage: 'QA Backlog',
    createdBy: 16,
    createdAt: new Date('2026-10-10T03:00:00Z'),
    events: [ev('Pending for QA', 'QA Backlog', '2026-10-07T05:00:00Z')],
  });
  const devTask = task({ id: 406, stage: 'LIVE' });
  const all = [parentIssue, reopenedTwice, raisedOnIssue, tagOnly, plain, devTask];
  const byId = indexTasks(all);
  const list = issues(all);

  it('counts rework without double counting', () => {
    expect(reworkCount(parentIssue, byId)).toBe(0);
    expect(reworkCount(reopenedTwice, byId)).toBe(2);
    expect(reworkCount(raisedOnIssue, byId)).toBe(1); // raised on an issue; tag not added again
    expect(reworkCount(tagOnly, byId)).toBe(1);
    expect(reworkCount(devTask, byId)).toBe(0);
  });

  it('computes the 4 tiles', () => {
    expect(qaSummary(list, ctx, byId)).toEqual({
      total: 5,
      open: 4,
      resolved: 1,
      resolvedPct: 20,
      openPct: 80,
      lastFiled: { date: '2026-10-10', isToday: true, count: 1 },
      reworkIssues: 3,
      reworkPct: 60,
      reworkTotal: 4,
    });
    expect(lastFiled([parentIssue], ctx)).toEqual({ date: '2026-10-01', isToday: false, count: 1 });
  });

  it('breaks issues down by assignee, stage, age and rework', () => {
    expect(issuesByAssignee(list).find((r) => r.id === 30)).toEqual({
      id: 30,
      total: 2,
      open: 1,
      resolved: 1,
      bug: 2,
      feedback: 0,
    });
    const byStage = issuesByStage(list);
    expect(byStage.stages.find((s) => s.stage === 'In QA')?.count).toBe(1);
    expect(byStage.stages.map((s) => s.stage)[0]).toBe('To do');
    expect(issueAgeByAssignee(list, ctx).totals).toEqual({
      '0-2': 1,
      '3-7': 0,
      '8-14': 3,
      '15+': 0,
    });
    expect(reworkByDeveloper(list, byId)).toEqual([
      // Equal rework counts: ties break by user ID.
      { id: 28, issues: 2, rework: 2, reworkIssues: 2, reworkPct: 100 },
      { id: 30, issues: 2, rework: 2, reworkIssues: 1, reworkPct: 50 },
    ]);
  });

  it('breaks issues down by project', () => {
    const other = task({ groupId: 148, tags: ['feedback'] });
    const all = [...list, other];
    const byProject = issuesByAssignee(all, 'project');
    expect(byProject.map((r) => [r.id, r.total])).toEqual([
      [154, list.length],
      [148, 1],
    ]);
    expect(byProject[1]).toMatchObject({ open: 1, bug: 0, feedback: 1 });
    expect(issueAgeByAssignee(all, ctx, 'project').rows.find((r) => r.id === 148)?.total).toBe(1);
    expect(reworkByDeveloper(all, byId, 'project')).toEqual([
      { id: 154, issues: list.length, rework: 4, reworkIssues: 3, reworkPct: 60 },
    ]);
  });

  it('groups issues waiting for retest by creator', () => {
    expect(waitingForRetest(list, ctx)).toEqual({
      total: 2,
      byCreator: [
        { id: 10, count: 1, oldestDays: 5 }, // tagOnly: no events, waits since changedAt 5 Oct
        { id: 16, count: 1, oldestDays: 3 },
      ],
    });
  });

  it('builds tester workload', () => {
    const work = [
      task({
        responsibleId: TESTER,
        stage: 'In progress',
        deadline: new Date('2026-10-12T06:00:00Z'),
      }),
      task({ responsibleId: TESTER, stage: 'To do', deadline: new Date('2026-10-08T06:00:00Z') }),
      task({ responsibleId: TESTER, groupId: 0, stage: 'Done' }),
    ];
    expect(testingWorkload(work, ctx)).toEqual([
      {
        id: TESTER,
        isTester: true,
        total: 3,
        pending: 2,
        done: 1,
        dueToday: 0,
        overdue: 1,
        nextDeadline: new Date('2026-10-12T06:00:00Z'),
      },
    ]);
  });

  it('maps presets to list predicates', () => {
    const last = lastFiled(list, ctx)!.date;
    expect(
      list.filter(presetPredicate('lastFiled', ctx, { lastFiledDate: last })).map((t) => t.id),
    ).toEqual([405]);
    expect(list.filter(presetPredicate('rework', ctx, { byId })).map((t) => t.id)).toEqual([
      402, 403, 404,
    ]);
    expect(list.filter(presetPredicate('retest', ctx)).map((t) => t.id)).toEqual([404, 405]);
  });
});
