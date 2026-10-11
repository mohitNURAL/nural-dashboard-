import { describe, expect, it } from 'vitest';
import {
  ageingBucket,
  applyFilters,
  ageingByAssignee,
  assigneeTable,
  completedAt,
  devSummary,
  devSummaryParts,
  alertOwner,
  boardStageCount,
  alerts,
  daysInStage,
  isStuck,
  stageEnteredAt,
  devTasks,
  filterOptions,
  isDueToday,
  isOverdue,
  issueAgeByAssignee,
  issues,
  issuesByAssignee,
  issuesByStage,
  issueTrend,
  isCompletedYesterday,
  lastResolved,
  lastFiled,
  presetPredicate,
  qaSummary,
  qaSummaryParts,
  issueStageTable,
  reworkByDeveloper,
  isSentToQa,
  isPending,
  retestBreakdown,
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

  it('completedAt = first move into QA Backlog; closed date only without any stage history', () => {
    // A bulk clean-up straight to Done (closed the same day) is not a completion.
    const cleanup = task({
      events: [ev('To do', 'Done', '2026-10-09T05:00:00Z')],
      closedAt: new Date('2026-10-09T05:00:00Z'),
    });
    expect(completedAt(cleanup)).toBeNull();
    const t = task({
      events: [
        ev('To do', 'In progress', '2026-10-02T05:00:00Z'),
        ev('In progress', 'Done', '2026-10-03T05:00:00Z'),
        ev('Done', 'To do', '2026-10-04T05:00:00Z'),
        ev('To do', 'QA Backlog', '2026-10-06T05:00:00Z'),
      ],
      closedAt: new Date('2026-10-07T05:00:00Z'),
    });
    // The In progress -> Done jump on 3 Oct is not a completion; QA Backlog on 6 Oct is.
    expect(completedAt(t)?.toISOString()).toBe('2026-10-06T05:00:00.000Z');
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

  it('both tabs count only Development department work, issues included', () => {
    expect(devTasks(all, ctx, 'issues').map((t) => t.id)).toEqual([103]);
    expect(devTasks(all, ctx, 'all').map((t) => t.id)).toEqual([101, 103, 105]);
    const devCtx = { ...ctx, developers: new Set([30]) };
    const withOther = [
      ...all,
      task({ id: 106, responsibleId: 99 }),
      // An issue assigned to a tester or outside a workgroup counts on neither tab.
      task({ id: 107, responsibleId: TESTER, tags: ['Bug'] }),
      task({ id: 108, responsibleId: 30, tags: ['Feedback'], groupId: 0 }),
    ];
    expect(devTasks(withOther, devCtx, 'dev').map((t) => t.id)).toEqual([101, 105]);
    expect(devTasks(withOther, devCtx, 'issues').map((t) => t.id)).toEqual([103]);
    // The QA tab's issues are the same set.
    expect(issues(withOther, devCtx)).toEqual(devTasks(withOther, devCtx, 'issues'));
    // Without a context (linked issues etc.) every issue is listed.
    expect(issues(withOther).map((t) => t.id)).toEqual([103, 107, 108]);
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
      // Completed 3 + pending 3 (the unmapped task too) + on hold 1 = 7.
      pending: 3,
      hold: 1,
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

  it('counts tasks that first reached QA Backlog yesterday (IST)', () => {
    // NOW = 10 Oct 12:00 IST; yesterday = 9 Oct IST.
    const at = (iso: string) =>
      task({ stage: 'QA Backlog', events: [ev('In progress', 'QA Backlog', iso)] });
    expect(isCompletedYesterday(at('2026-10-09T10:00:00Z'), ctx)).toBe(true);
    expect(isCompletedYesterday(at('2026-10-09T20:00:00Z'), ctx)).toBe(false); // 10 Oct 01:30 IST
    expect(isCompletedYesterday(at('2026-10-08T10:00:00Z'), ctx)).toBe(false);
    const row = assigneeTable([at('2026-10-09T10:00:00Z')], ctx).rows[0]!;
    expect(row.completedYesterday).toBe(1);
    expect(row.doneSplit).toEqual({ dev: 1, bug: 0, feedback: 0 });
    expect(presetPredicate('doneYesterday', ctx)(at('2026-10-09T10:00:00Z'))).toBe(true);
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

describe('alerts', () => {
  // NOW = 10 Oct 2026, 12:00 IST.
  it('dates the current stage from the last move into it', () => {
    const moved = task({
      stage: 'In progress',
      events: [
        ev('To do', 'In progress', '2026-10-01T05:00:00Z'),
        ev('In progress', 'In QA', '2026-10-02T05:00:00Z'),
        ev('In QA', 'In progress', '2026-10-06T05:00:00Z'),
      ],
    });
    expect(stageEnteredAt(moved)).toEqual(new Date('2026-10-06T05:00:00Z'));
    expect(daysInStage(moved, ctx)).toBe(4);
    // Never moved: in To do since it was created.
    expect(stageEnteredAt(task({ createdAt: new Date('2026-09-01T05:00:00Z') }))).toEqual(
      new Date('2026-09-01T05:00:00Z'),
    );
  });

  it('flags more than 5 days in a stage, never in LIVE', () => {
    const since = (d: string, stage: MetricTask['stage']) =>
      task({ stage, events: [ev('To do', stage, d)] });
    expect(isStuck(since('2026-10-05T05:00:00Z', 'In progress'), ctx)).toBe(false); // 5 days
    expect(isStuck(since('2026-10-04T05:00:00Z', 'In progress'), ctx)).toBe(true); // 6 days
    expect(isStuck(since('2026-09-01T05:00:00Z', 'LIVE'), ctx)).toBe(false);
  });

  it('groups overdue by assignee and project, stuck also by stage', () => {
    const late = (who: number, project: number) =>
      task({
        responsibleId: who,
        groupId: project,
        stage: 'In progress',
        deadline: new Date('2026-10-01T05:00:00Z'),
        events: [ev('To do', 'In progress', '2026-10-09T05:00:00Z')],
      });
    const stuckTask = (who: number, stage: MetricTask['stage'], d: string) =>
      task({ responsibleId: who, stage, events: [ev('To do', stage, d)] });
    const a = alerts(
      [
        late(30, 148),
        late(30, 148),
        late(30, 154),
        stuckTask(28, 'Done', '2026-09-20T05:00:00Z'),
        stuckTask(28, 'Done', '2026-10-01T05:00:00Z'),
        stuckTask(28, 'LIVE', '2026-09-01T05:00:00Z'),
      ],
      ctx,
    );
    expect(a.overdue.map((o) => [o.personId, o.projectId, o.count, o.oldestDays])).toEqual([
      [30, 148, 2, 9],
      [30, 154, 1, 9],
    ]);
    expect(a.stuck).toEqual([
      { personId: 28, role: 'assignee', projectId: 154, stage: 'Done', count: 2, oldestDays: 20 },
    ]);
  });
});

describe('board stage count', () => {
  it('counts every task in the stage like the Bitrix24 filter, whatever its age', () => {
    const list = [
      task({ stage: 'Done', responsibleId: 34, groupId: 12 }),
      task({ stage: 'Done', responsibleId: 34, groupId: 12, createdBy: 16 }),
      task({ stage: 'Done', responsibleId: 30, groupId: 12 }),
      task({ stage: 'LIVE', responsibleId: 34, groupId: 12 }),
      task({ stage: 'Done', responsibleId: 34, groupId: 8 }),
    ];
    expect(boardStageCount(list, 12, 'Done', { responsibleId: 34 })).toBe(2);
    expect(boardStageCount(list, 12, 'Done', { createdBy: 16 })).toBe(1);
    expect(boardStageCount(list, 12, 'Done')).toBe(3);
  });
});

describe('alert owner', () => {
  const qaCtx = { ...ctx, qaLead: TESTER };
  const inQa = (stage: MetricTask['stage'], createdBy: number) =>
    task({ stage, createdBy, responsibleId: 30 });

  it('names the creator for work waiting in QA when the creator is a tester', () => {
    expect(alertOwner(inQa('QA Backlog', 16), qaCtx)).toEqual({ id: 16, role: 'tester' });
    expect(alertOwner(inQa('In QA', 16), qaCtx)).toEqual({ id: 16, role: 'tester' });
  });

  it('falls back to the QA lead when the creator is not a tester', () => {
    expect(alertOwner(inQa('QA Backlog', 10), qaCtx)).toEqual({ id: TESTER, role: 'qaLead' });
  });

  it('names the assignee in every other stage', () => {
    expect(alertOwner(inQa('In progress', 16), qaCtx)).toEqual({ id: 30, role: 'assignee' });
    expect(alertOwner(inQa('Done', 16), qaCtx)).toEqual({ id: 30, role: 'assignee' });
  });

  it('groups stuck QA work under the tester', () => {
    const waiting = task({
      stage: 'QA Backlog',
      createdBy: 16,
      events: [ev('In progress', 'QA Backlog', '2026-09-20T05:00:00Z')],
    });
    expect(alerts([waiting], qaCtx).stuck[0]).toMatchObject({ personId: 16, role: 'tester' });
    // The QA lead's own issues and the ones routed to them make one line.
    const lead = (createdBy: number) =>
      task({
        stage: 'QA Backlog',
        createdBy,
        events: [ev('In progress', 'QA Backlog', '2026-09-20T05:00:00Z')],
      });
    expect(alerts([lead(TESTER), lead(10)], qaCtx).stuck).toEqual([
      expect.objectContaining({ personId: TESTER, role: 'qaLead', count: 2 }),
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
      ev('Done', 'In progress', '2026-10-05T05:00:00Z'),
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
  const list = issues(all);

  it('counts a QA send-back once, not the first Issue Raised to To do cycle', () => {
    const cycle = (...stages: NonNullable<MetricTask['stage']>[]) =>
      reworkCount(
        task({
          tags: ['Bug'],
          events: stages.slice(1).map((to, k) => ev(stages[k]!, to, `2026-10-0${k + 1}T05:00:00Z`)),
        }),
      );
    // Tester files the bug, PM sends it to the developer: not rework.
    expect(cycle('Issue Raised', 'To do', 'In progress', 'QA Backlog')).toBe(0);
    // Fixed, failed in QA, back via Issue Raised to To do: one rework.
    expect(cycle('Issue Raised', 'To do', 'QA Backlog', 'In QA', 'Issue Raised', 'To do')).toBe(1);
    // Straight back to To do or In progress from QA, or reopened after Done: rework.
    expect(cycle('QA Backlog', 'To do')).toBe(1);
    expect(cycle('In QA', 'In progress')).toBe(1);
    expect(cycle('Done', 'To do')).toBe(1);
    // Two failed QA cycles: two.
    expect(
      cycle('To do', 'QA Backlog', 'Issue Raised', 'To do', 'In QA', 'Issue Raised', 'To do'),
    ).toBe(2);
    // Not send-backs.
    expect(cycle('Issue Raised', 'To do')).toBe(0);
    expect(cycle('LIVE', 'To do')).toBe(0);
    expect(cycle('QA Backlog', 'Pending for QA')).toBe(0);
  });

  it('counts only the stage flow: not linked issues, not Re-Open tags', () => {
    expect(reworkCount(parentIssue)).toBe(0);
    expect(reworkCount(reopenedTwice)).toBe(2);
    expect(reworkCount(raisedOnIssue)).toBe(0); // filed on an issue, never sent back by QA
    expect(reworkCount(tagOnly)).toBe(0); // Re-Open tag only
    expect(reworkCount(devTask)).toBe(0);
  });

  it('computes the 4 tiles', () => {
    expect(qaSummary(list, ctx)).toEqual({
      total: 5,
      // Issues in QA Backlog or In QA count as resolved (completed), like tasks.
      open: 2,
      resolved: 3,
      hold: 0,
      resolvedPct: 60,
      openPct: 40,
      lastFiled: { date: '2026-10-10', isToday: true, count: 1 },
      // Last push to QA Backlog: issue 405 on 7 Oct (402 was pushed on 2 Oct).
      lastResolved: { date: '2026-10-07', isToday: false, count: 1 },
      // Only the issue QA sent back twice (402) is rework.
      reworkIssues: 1,
      reworkPct: 20,
      reworkTotal: 2,
    });
    expect(lastFiled([parentIssue], ctx)).toEqual({ date: '2026-10-01', isToday: false, count: 1 });
  });

  it('breaks issues down by assignee, stage, age and rework', () => {
    expect(issuesByAssignee(list).find((r) => r.id === 30)).toEqual({
      id: 30,
      total: 2,
      open: 1,
      resolved: 1,
      hold: 0,
      bug: 2,
      feedback: 0,
      openBug: 1,
      openFeedback: 0,
      resolvedBug: 1,
      resolvedFeedback: 0,
    });
    const byStage = issuesByStage(list);
    expect(byStage.stages.find((s) => s.stage === 'In QA')?.count).toBe(1);
    expect(byStage.stages.map((s) => s.stage)[0]).toBe('To do');
    expect(issueAgeByAssignee(list, ctx).totals).toEqual({
      // Open (pending) issues only: those waiting in QA are resolved.
      '0-2': 0,
      '3-7': 0,
      '8-14': 2,
      '15+': 0,
    });
    expect(reworkByDeveloper(list)).toEqual([
      // 28's issues are linked / tagged only: not rework under the flow rule.
      {
        id: 30,
        issues: 2,
        rework: 2,
        reworkIssues: 1,
        reworkPct: 50,
        bug: { issues: 2, rework: 2, reworkIssues: 1 },
        feedback: { issues: 0, rework: 0, reworkIssues: 0 },
      },
    ]);
  });

  it('issue trend: filed (bug, feedback) and resolved per IST day, last 7 days', () => {
    const filed = (iso: string, tag: string, responsibleId = 30) =>
      task({ tags: [tag], createdAt: new Date(iso), responsibleId });
    const trend = issueTrend(
      [
        filed('2026-10-09T20:00:00Z', 'bug'), // 10 Oct 01:30 IST = today
        filed('2026-10-10T04:00:00Z', 'feedback', 31),
        filed('2026-10-04T05:00:00Z', 'bug'), // first day of the seven
        filed('2026-10-03T05:00:00Z', 'bug'), // too old
        task({
          tags: ['bug'],
          responsibleId: 31,
          events: [ev('In progress', 'QA Backlog', '2026-10-08T05:00:00Z')],
        }),
      ],
      ctx,
    );
    expect(trend.days).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ]);
    expect(trend.totals).toEqual({
      bug: [1, 0, 0, 0, 0, 0, 1],
      feedback: [0, 0, 0, 0, 0, 0, 1],
      bugResolved: [0, 0, 0, 0, 1, 0, 0],
      feedbackResolved: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(trend.rows.map((r) => [r.id, r.total])).toEqual([
      [30, 2],
      [31, 2],
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
    expect(reworkByDeveloper(all, 'project')).toEqual([
      {
        id: 154,
        issues: list.length,
        rework: 2,
        reworkIssues: 1,
        reworkPct: 20,
        bug: { issues: 4, rework: 2, reworkIssues: 1 },
        feedback: { issues: 1, rework: 0, reworkIssues: 0 },
      },
    ]);
  });

  it('splits every QA tile into bug and feedback, adding up to the tile', () => {
    const s = qaSummary(list, ctx);
    const parts = qaSummaryParts(list, ctx);
    expect(parts.map((p) => p.key)).toEqual(['bug', 'feedback']);
    const sum = (k: 'total' | 'open' | 'lastFiled' | 'rework') =>
      parts.reduce((n, p) => n + p[k], 0);
    expect(sum('total')).toBe(s.total);
    expect(sum('open')).toBe(s.open);
    expect(sum('lastFiled')).toBe(s.lastFiled?.count ?? 0);
    expect(sum('rework')).toBe(s.reworkIssues);
  });

  it('counts last filed parts on the overall last filed day', () => {
    const late = task({ tags: ['Bug'], createdAt: new Date('2026-10-09T05:00:00Z') });
    const early = task({ tags: ['Feedback'], createdAt: new Date('2026-10-01T05:00:00Z') });
    expect(qaSummaryParts([late, early], ctx)).toEqual([
      expect.objectContaining({ key: 'bug', lastFiled: 1 }),
      // Feedback's own latest day is 1 Oct, but the tile is about 9 Oct: 0.
      expect.objectContaining({ key: 'feedback', lastFiled: 0 }),
    ]);
  });

  it('tabulates issues by stage per assignee or project, bug and feedback split', () => {
    const t = issueStageTable(list);
    expect(t.totals.total).toBe(list.length);
    expect(t.totals.bug + t.totals.feedback).toBe(list.length);
    // Each row adds up: stages = total = bug + feedback.
    for (const r of t.rows) {
      expect(Object.values(r.cells).reduce((a, b) => a + b, 0)).toBe(r.total);
      expect(r.bug + r.feedback).toBe(r.total);
    }
    expect(t.stages.every((s) => t.totals.cells[s] > 0)).toBe(true);
    expect(issueStageTable(list, 'project').rows.map((r) => r.id)).toEqual([154]);
  });

  it('lists the issues pushed to QA Backlog on the Last resolved day', () => {
    const day = lastResolved(list, ctx)!.date;
    expect(
      list.filter(presetPredicate('lastResolved', ctx, { lastResolvedDate: day })).map((t) => t.id),
    ).toEqual([405]);
    const parts = qaSummaryParts(list, ctx);
    expect(parts.reduce((n, p) => n + p.lastResolved, 0)).toBe(1);
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
    expect(list.filter(presetPredicate('rework', ctx)).map((t) => t.id)).toEqual([402]);
    expect(list.filter(presetPredicate('retest', ctx)).map((t) => t.id)).toEqual([404, 405]);
  });
});

describe('Retesting awaited (QA tab)', () => {
  it('counts dev tasks and issues in QA Backlog and In QA, per assignee and project', () => {
    const list = [
      task({ id: 1, stage: 'QA Backlog', responsibleId: 30 }),
      task({ id: 2, stage: 'QA Backlog', responsibleId: 30, tags: ['bug'] }),
      task({ id: 3, stage: 'In QA', responsibleId: 28, groupId: 148, tags: ['feedback'] }),
      task({ id: 4, stage: 'Done', responsibleId: 30 }),
      task({ id: 5, stage: 'Issue Raised', responsibleId: 30, tags: ['bug'] }),
    ];
    const r = retestBreakdown(list);
    expect(r.totals).toMatchObject({ total: 3, dev: 1, issues: 2, qaBacklog: 2, inQa: 1 });
    expect(r.rows.map((x) => [x.id, x.qaBacklogDev, x.qaBacklogIssues, x.inQaIssues])).toEqual([
      [30, 1, 1, 0],
      [28, 0, 0, 1],
    ]);
    expect(retestBreakdown(list, 'project').rows.map((x) => [x.id, x.total])).toEqual([
      [154, 2],
      [148, 1],
    ]);
  });
});

describe('pending vs completed (SRS 5)', () => {
  it('completed = QA Backlog, In QA, Done, LIVE; Issue Raised and the rest are pending', () => {
    const at = (stage: MetricTask['stage']) => isSentToQa(task({ stage }));
    expect(
      ['QA Backlog', 'In QA', 'Done', 'LIVE'].map((s) => at(s as MetricTask['stage'])),
    ).toEqual([true, true, true, true]);
    expect(at('Issue Raised')).toBe(false);
    expect(at('Pending for QA')).toBe(false);
    expect(isPending(task({ stage: 'Issue Raised' }))).toBe(true);
  });

  it('a board without QA stages completes by closing; a QA board by stage only', () => {
    const closed = new Date('2026-10-05T05:00:00Z');
    expect(isSentToQa(task({ stage: 'To do', closedAt: closed, qaFlow: false }))).toBe(true);
    expect(isSentToQa(task({ stage: 'To do', closedAt: closed, qaFlow: true }))).toBe(false);
    expect(isSentToQa(task({ stage: 'To do', qaFlow: false }))).toBe(false);
  });
});
