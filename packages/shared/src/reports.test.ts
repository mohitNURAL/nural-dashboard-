import { describe, expect, it } from 'vitest';
import { workCalendar } from './calendar';
import type { KpiContext } from './kpi';
import { buildReport, conditionMet, conditionValue, REPORT_TOPICS } from './reports';
import type { MetricTask, StageEvent } from './types';

const ist = (local: string) => new Date(`${local}+05:30`);
// Monday 12 Oct 2026, 18:30 IST: an evening daily report.
const NOW = ist('2026-10-12T18:30');
const ctx: KpiContext = { now: NOW, tz: 'Asia/Kolkata', cal: workCalendar(), deptOf: () => 'dev' };
const name = { project: (g: number) => `P${g}`, person: (p: number) => `Person ${p}` };

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
const toQa = (at: Date): StageEvent => ({ from: 'In progress', to: 'QA Backlog', at, by: 1 });
const closedToday = (deadline: Date) =>
  task({ stage: 'QA Backlog', deadline, events: [toQa(ist('2026-10-12T15:00'))] });

describe('report content', () => {
  const tasks = [
    closedToday(ist('2026-10-14T18:00')), // on time, 2 days early
    closedToday(ist('2026-10-13T18:00')),
    closedToday(ist('2026-10-10T18:00')), // late
    task({ deadline: ist('2026-10-12T19:00') }), // due today
    task({ deadline: ist('2026-10-13T18:00') }), // next working day
    task({ deadline: ist('2026-10-16T18:00'), stage: 'In progress' }), // this week
    task({ deadline: ist('2026-10-05T18:00') }), // overdue 7 days
  ];

  it('builds the chosen topics in catalogue order, for the period', () => {
    const r = buildReport({
      title: 'Daily update',
      tasks,
      ctx,
      period: 'day',
      back: 0,
      topics: ['improve', 'summary', 'dueToday'],
      prompts: ['What will you finish first tomorrow?'],
      name,
    });
    expect(r.periodLabel).toBe('12 Oct');
    expect(r.sections.map((s) => s.topic)).toEqual(['summary', 'dueToday', 'improve', 'prompts']);
    const summary = r.sections[0]!;
    expect(Object.fromEntries(summary.stats!.map((s) => [s.label, s.value]))).toMatchObject({
      Closed: '3',
      'On time': '67 %',
      Open: '4',
      'Overdue now': '1',
    });
    expect(r.sections[1]!.items!.map((i) => i.taskId)).toEqual([tasks[3]!.id]);
    expect(r.sections[2]!.stats!.find((s) => s.label === 'Closed late')!.value).toBe('1');
    expect(r.sections[2]!.items![0]).toMatchObject({ taskId: tasks[6]!.id, tone: 'bad' });
    expect(r.sections[3]!.items).toEqual([{ text: 'What will you finish first tomorrow?' }]);
  });

  it('lists tasks in hand, releases and what went well', () => {
    const r = buildReport({
      title: 'Weekly',
      tasks,
      ctx,
      period: 'week',
      back: 0,
      topics: ['inHand', 'releases', 'wentWell'],
      prompts: [],
      name,
    });
    const [inHand, releases, well] = r.sections;
    expect(inHand!.stats!.map((s) => s.value)).toEqual(['2', '1', '0']);
    // Due 12, 13 and 16 Oct; the overdue task was due last week.
    expect(releases!.stats!.find((s) => s.label === 'This week')!.value).toBe('3');
    expect(well!.items![0]!.meta).toContain('2 days early');
  });

  it('every topic in the catalogue builds without data', () => {
    const r = buildReport({
      title: 'All',
      tasks: [],
      ctx,
      period: 'month',
      back: 1,
      topics: REPORT_TOPICS.map((t) => t.key),
      prompts: [],
      name,
    });
    expect(r.sections).toHaveLength(REPORT_TOPICS.length);
    expect(r.periodLabel).toBe('1 Sept – 30 Sept');
  });
});

describe('conditional reports', () => {
  it('measures on-time % and checks very poor and very good', () => {
    const late = ist('2026-10-08T18:00');
    const tasks = [1, 2, 3, 4].map(() =>
      task({ stage: 'QA Backlog', deadline: late, events: [toQa(ist('2026-10-10T12:00'))] }),
    );
    const v = conditionValue(tasks, ctx, 'onTime');
    expect(v).toBe(0);
    expect(conditionMet('onTime', 'poor', 50, v)).toBe(true);
    expect(conditionMet('onTime', 'good', 90, v)).toBe(false);
    // Overdue share: lower is better.
    expect(conditionMet('overdueShare', 'poor', 30, 40)).toBe(true);
    expect(conditionMet('overdueShare', 'good', 5, 2)).toBe(true);
    // Too little to judge: never sends.
    expect(conditionMet('onTime', 'poor', 50, null)).toBe(false);
  });
});
