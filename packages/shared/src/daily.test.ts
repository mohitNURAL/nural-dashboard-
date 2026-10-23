import { describe, expect, it } from 'vitest';
import { workCalendar } from './calendar';
import {
  clockLabel,
  isLatePlan,
  dailyClock,
  dailySuggestions,
  isPlannable,
  slackPlan,
  slackWrap,
  wrapState,
  dailyState,
  dailyUpcoming,
  dailyNoDeadline,
  dailyDeadline,
  dailyCompliance,
  slackCheckIn,
  slackSections,
} from './daily';
import type { MetricTask } from './types';

const ist = (local: string) => new Date(`${local}+05:30`);
// Wednesday 14 Oct 2026, 10:30 IST: the morning plan.
const NOW = ist('2026-10-14T10:30');
const ctx = { now: NOW, tz: 'Asia/Kolkata' };
const project = (g: number) => `P${g}`;

let id = 1;
function task(over: Partial<MetricTask> = {}): MetricTask {
  const stage = over.stage ?? 'To do';
  return {
    id: id++,
    title: `Task ${id}`,
    groupId: 10,
    stage,
    stageTitle: stage,
    status: 2,
    priority: 1,
    responsibleId: 7,
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

describe('daily suggestions', () => {
  const late3 = task({ deadline: ist('2026-10-11T18:00') });
  const late1 = task({ deadline: ist('2026-10-13T09:00') });
  const today = task({ deadline: ist('2026-10-14T19:00'), stage: 'In progress' });
  const todayPassed = task({ deadline: ist('2026-10-14T09:00') });
  const tomorrow = task({ deadline: ist('2026-10-15T18:00') });
  const noDeadline = task();
  const someoneElse = task({ responsibleId: 8, deadline: ist('2026-10-14T18:00') });
  const sentToQa = task({ stage: 'QA Backlog', deadline: ist('2026-10-12T18:00') });
  const onHold = task({ stage: 'On Hold', deadline: ist('2026-10-12T18:00') });
  const all = [
    late1,
    tomorrow,
    today,
    someoneElse,
    late3,
    noDeadline,
    sentToQa,
    onHold,
    todayPassed,
  ];

  it('lists only my open tasks: overdue first (most overdue on top), then due today', () => {
    const s = dailySuggestions(all, 7, ctx, project);
    expect(s.map((x) => x.taskId)).toEqual([late3.id, late1.id, todayPassed.id, today.id]);
    expect(s.map((x) => x.why)).toEqual(['overdue', 'overdue', 'today', 'today']);
    expect(s[0]).toMatchObject({ daysOverdue: 2, project: 'P10' });
  });

  it('never suggests someone else’s task, a completed one or one on hold', () => {
    expect(isPlannable(someoneElse, 7)).toBe(false);
    expect(isPlannable(sentToQa, 7)).toBe(false);
    expect(isPlannable(onHold, 7)).toBe(false);
    expect(isPlannable(noDeadline, 7)).toBe(true);
  });
});

describe('daily clock', () => {
  const cal = workCalendar({
    days: [1, 2, 3, 4, 5, 6],
    end: '18:30',
    holidays: [{ date: '2026-10-02' }],
  });
  it('knows working days and minutes, holidays and Sundays off', () => {
    expect(dailyClock(NOW, cal)).toEqual({ working: true, nowMin: 630, wrapFromMin: 1110 });
    expect(dailyClock(ist('2026-10-02T11:00'), cal).working).toBe(false);
    expect(dailyClock(ist('2026-10-17T11:00'), cal).working).toBe(true); // Saturday
    expect(dailyClock(ist('2026-10-18T11:00'), cal).working).toBe(false); // Sunday
  });
});

describe('wrap state', () => {
  it('is done when completed in Bitrix24 or sent to QA, else its stage state', () => {
    expect(wrapState(task({ status: 5 }))).toBe('done');
    expect(wrapState(task({ stage: 'QA Backlog' }))).toBe('done');
    expect(wrapState(task({ stage: 'In progress', status: 3 }))).toBe('wip');
    expect(wrapState(undefined)).toBe('pending');
  });
});

describe('daily state (Slack status rules)', () => {
  const testers = new Set([77]);
  it('dev task or issue: To do pending, In progress..before QA entry WIP, QA entry on done', () => {
    expect(dailyState(task({ stage: 'To do' }))).toBe('pending');
    expect(dailyState(task({ stage: 'In progress' }))).toBe('wip');
    expect(dailyState(task({ stage: 'Pending for QA' }))).toBe('wip');
    expect(dailyState(task({ stage: 'Issue Raised' }))).toBe('wip');
    expect(dailyState(task({ stage: 'QA Backlog' }))).toBe('done');
    expect(dailyState(task({ stage: 'Done' }))).toBe('done');
    expect(dailyState(task({ stage: 'On Hold' }))).toBe('hold');
  });
  it('testing task: To do pending, In progress WIP, Issue Raised or Done done', () => {
    const qa = (stage: string) => task({ stage, responsibleId: 77 });
    expect(dailyState(qa('To do'), testers)).toBe('pending');
    expect(dailyState(qa('In progress'), testers)).toBe('wip');
    expect(dailyState(qa('Issue Raised'), testers)).toBe('done');
    expect(dailyState(qa('Done'), testers)).toBe('done');
  });
});

describe('carry-over and upcoming', () => {
  it('carries only pending or WIP tasks from the last plan, first, and never a done one', () => {
    const wip = task({ id: 501, stage: 'In progress' });
    const done = task({ id: 502, stage: 'QA Backlog' });
    const s = dailySuggestions([wip, done], 7, ctx, project, [501, 502]);
    expect(s.map((i) => [i.taskId, i.why])).toEqual([[501, 'carried']]);
  });
  it('upcoming: open tasks due after today, soonest first', () => {
    const later = task({ id: 601, deadline: ist('2026-10-20T18:00') });
    const sooner = task({ id: 602, deadline: ist('2026-10-15T18:00') });
    const today = task({ id: 603, deadline: ist('2026-10-14T18:00') });
    expect(dailyUpcoming([later, sooner, today], 7, ctx, project).map((i) => i.taskId)).toEqual([
      602, 601,
    ]);
  });
  it('no deadline: open tasks without one, most recently changed first', () => {
    const old = task({ id: 701, changedAt: ist('2026-10-01T10:00') });
    const fresh = task({ id: 702 });
    const dated = task({ id: 703, deadline: ist('2026-10-20T18:00') });
    const done = task({ id: 704, stage: 'QA Backlog' });
    const notMine = task({ id: 705, responsibleId: 8 });
    expect(
      dailyNoDeadline([old, fresh, dated, done, notMine], 7, ctx, project).map((i) => [
        i.taskId,
        i.why,
      ]),
    ).toEqual([
      [702, 'noDeadline'],
      [701, 'noDeadline'],
    ]);
  });
  it('the deadline it gets: the end of the working day, or 23:59 once that has passed', () => {
    const cal = workCalendar({ days: [1, 2, 3, 4, 5, 6], end: '18:30', holidays: [] });
    expect(dailyDeadline(NOW, cal)).toEqual(ist('2026-10-14T18:30'));
    expect(dailyDeadline(ist('2026-10-14T19:00'), cal)).toEqual(ist('2026-10-14T23:59'));
  });
});

describe('slack messages', () => {
  const who = { name: 'Ram Kumar', mention: '<@U1>' };
  const url = (n: number) => `https://portal/task/${n}/`;

  it('a long plan is split over several sections, each within Slack’s 3000 characters', () => {
    const items = Array.from({ length: 40 }, (_, k) => ({
      taskId: 1000 + k,
      title: `A rather long task title about the Motorola Indonesia support work number ${k}`,
      project: 'Motorola Indonesia Support',
      why: 'carried' as const,
    }));
    const m = slackPlan(who, 'Fri 23 Oct', items, undefined, url);
    const texts = (m.blocks as { type: string; text?: { text: string } }[])
      .filter((b) => b.type === 'section')
      .map((b) => b.text!.text);
    expect(texts.length).toBeGreaterThan(2);
    expect(texts.every((t) => t.length <= 3000)).toBe(true);
    expect(texts.join(' ')).toContain('number 39');
    expect(slackSections(['x'.repeat(5000)])).toHaveLength(1);
  });

  it('plan: names the person, links each task and counts overdue and due today', () => {
    const m = slackPlan(
      who,
      'Wed 14 Oct',
      [
        { taskId: 5, title: 'Payment bug', project: 'Shop', why: 'overdue', daysOverdue: 3 },
        { taskId: 6, title: 'Login <fix>', project: 'App', why: 'today' },
      ],
      'Client call at 3',
      url,
    );
    expect(m.text).toBe('Ram Kumar: plan for Wed 14 Oct (2 tasks · 1 overdue · 1 due today)');
    const body = JSON.stringify(m.blocks);
    expect(body).toContain('<@U1>');
    expect(body).toContain('<https://portal/task/5/|Payment bug>');
    expect(body).toContain('3d overdue');
    expect(body).toContain('Login  fix');
    expect(body).toContain('Client call at 3');
  });

  it('wrap-up: done and WIP per task, unplanned work apart', () => {
    const m = slackWrap(who, 'Wed 14 Oct', [
      { taskId: 5, title: 'Payment bug', project: 'Shop', state: 'done' },
      { taskId: 6, title: 'Login fix', project: 'App', state: 'wip' },
      { taskId: 9, title: 'Hotfix', project: 'App', state: 'done', extra: true },
    ]);
    expect(m.text).toBe('Ram Kumar: day wrap-up for Wed 14 Oct (2 done · 1 WIP · 1 unplanned)');
    expect(JSON.stringify(m.blocks)).toContain('Also did');
  });
});

describe('who posted', () => {
  it('lists who planned, who did not, who wrapped up and who planned without wrapping up', () => {
    const c = dailyCompliance(
      [1, 2, 3, 4],
      [
        { userId: 1, plannedAt: NOW, wrappedAt: NOW },
        { userId: 2, plannedAt: NOW, wrappedAt: null },
        { userId: 9, plannedAt: NOW, wrappedAt: NOW }, // not expected
      ],
    );
    expect(c).toMatchObject({
      planned: [1, 2],
      notPlanned: [3, 4],
      wrapped: [1],
      notWrapped: [2, 3, 4],
      plannedNotWrapped: [2],
    });
  });
});

describe('check-in to the directors', () => {
  const c = {
    expected: 3,
    planned: ['Neha'],
    notPlanned: ['Vijay', 'Ram'],
    wrapped: [],
    notWrapped: ['Neha', 'Vijay', 'Ram'],
    plannedNotWrapped: ['Neha'],
  };
  it('11:30: who has not planned, with the report link', () => {
    const m = slackCheckIn('plan', 'Fri 16 Oct', c, 'https://pulse/?tab=dailyreport');
    expect(m.text).toBe('Daily plans Fri 16 Oct: 1 of 3 planned, 2 not yet');
    expect(JSON.stringify(m.blocks)).toContain('Not planned yet (2)');
    expect(JSON.stringify(m.blocks)).toContain('https://pulse/?tab=dailyreport');
  });
  it('19:00: who has not wrapped up, and who planned without wrapping up', () => {
    const m = slackCheckIn('wrap', 'Fri 16 Oct', c);
    expect(m.text).toBe('Day wrap-ups Fri 16 Oct: 0 of 3 wrapped up, 3 not yet');
    expect(JSON.stringify(m.blocks)).toContain('Of them, planned this morning: Neha');
  });
});

describe('late planned (2026-10-22)', () => {
  const cal = workCalendar({ days: [1, 2, 3, 4, 5] });
  const ist = (local: string) => new Date(`${local}+05:30`);
  it('is a plan first posted after the check-in time, by the local clock', () => {
    expect(isLatePlan(ist('2026-10-22T11:30'), '11:30', cal)).toBe(false);
    expect(isLatePlan(ist('2026-10-22T11:31'), '11:30', cal)).toBe(true);
    expect(isLatePlan(null, '11:30', cal)).toBe(false);
    expect(clockLabel(ist('2026-10-22T09:05'), cal)).toBe('09:05');
  });
});
