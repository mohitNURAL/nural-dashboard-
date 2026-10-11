// Performance reports by mail and Slack (SRS 19, Mailing): what a report can contain, and the
// content for one recipient over one period. Pure: the API gives it the recipient's own tasks
// (their scope) and renders the result as an email and a Slack message.
import { addWorkingHours, dayHours } from './calendar';
import {
  keyPoints,
  load as loadOf,
  overlap,
  peopleLag,
  projectLag,
  releasePlan,
  windows,
} from './insights';
import { kpiScope, periodBounds, type KpiContext, type KpiTask, type Period } from './kpi';
import type { MetricTask } from './types';

/** The blocks an admin can put in a report. */
export const REPORT_TOPICS = [
  {
    key: 'summary',
    label: 'How it went',
    hint: 'Closed, on time, overdue now, against the period before',
  },
  { key: 'dueToday', label: 'Due today', hint: 'Open tasks with today’s deadline' },
  { key: 'inHand', label: 'Tasks in hand', hint: 'Due next working day, next week and next month' },
  {
    key: 'releases',
    label: 'Releases this week',
    hint: 'Planned completion dates this week and next, with the risk of slipping',
  },
  { key: 'wentWell', label: 'What went well', hint: 'Closed on time or early, biggest finishes' },
  { key: 'improve', label: 'What to improve', hint: 'Overdue, closed late, sent back by QA' },
  { key: 'lagging', label: 'Lagging projects and people', hint: 'From Insights' },
  {
    key: 'load',
    label: 'Load and overlap',
    hint: 'Overloaded, room to help, projects pulling people away',
  },
  {
    key: 'holding',
    label: 'What is holding us back',
    hint: 'The ranked findings from Insights (management)',
  },
  {
    key: 'absences',
    label: 'Leave and attendance',
    hint: 'Absences and the tasks they put at risk (once Infowan is connected)',
  },
] as const;
export type ReportTopic = (typeof REPORT_TOPICS)[number]['key'];

/** Questions admins can add to a report, for the reader to reflect on. */
export const SUGGESTED_PROMPTS = [
  'How did today go for you?',
  'How many of your tasks are due, and which will you finish first?',
  'What did you do well this week?',
  'What will you do better next week?',
  'What is blocking you, and who can help?',
  'Which task is at risk of slipping, and what will you do about it?',
  'Which project needs more hands this week?',
  'What will you finish before tomorrow’s stand-up?',
] as const;

export type ConditionMetric = 'onTime' | 'overdueShare' | 'closedVsUsual';

/** Conditional reports: what is checked, and the default thresholds of "very poor" and "very good". */
export const CONDITION_METRICS: {
  key: ConditionMetric;
  label: string;
  unit: '%';
  poor: number;
  good: number;
  /** Higher is better? */
  higherIsBetter: boolean;
}[] = [
  {
    key: 'onTime',
    label: 'On-time % (last 7 days)',
    unit: '%',
    poor: 50,
    good: 90,
    higherIsBetter: true,
  },
  {
    key: 'overdueShare',
    label: 'Overdue share of open tasks',
    unit: '%',
    poor: 30,
    good: 5,
    higherIsBetter: false,
  },
  {
    key: 'closedVsUsual',
    label: 'Closed in the last 7 days vs the usual week',
    unit: '%',
    poor: 50,
    good: 150,
    higherIsBetter: true,
  },
];

export interface ReportSection {
  topic: ReportTopic | 'prompts';
  title: string;
  /** Headline numbers. */
  stats?: { label: string; value: string; tone?: 'good' | 'bad' }[];
  /** Lines; a task line links to the task. */
  items?: { text: string; taskId?: number; meta?: string; tone?: 'good' | 'bad' }[];
  /** Shown when there is nothing to list. */
  empty?: string;
  /** More items than listed. */
  more?: number;
}

export interface ReportData {
  title: string;
  periodLabel: string;
  sections: ReportSection[];
}

export interface ReportInput {
  title: string;
  /** The recipient's tasks (their scope). */
  tasks: readonly MetricTask[];
  ctx: KpiContext;
  period: Period;
  /** Report the period before the current one (morning reports look back). */
  back: number;
  topics: readonly ReportTopic[];
  prompts: readonly string[];
  name: { project: (id: number) => string; person: (id: number) => string };
  /** Leave and attendance lines, when Infowan is connected. */
  absences?: { text: string; taskIds: number[] }[] | null;
}

const LIST = 8;
const DAY_MS = 86_400_000;
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)} %`);

const fmt = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: 'numeric', month: 'short' }).format(d);

function periodLabel(period: Period, r: { start: Date; end: Date }, tz: string) {
  const last = new Date(r.end.getTime() - 1);
  return period === 'day' ? fmt(r.start, tz) : `${fmt(r.start, tz)} – ${fmt(last, tz)}`;
}

const within = (d: Date | null, r: { start: Date; end: Date }) => !!d && d >= r.start && d < r.end;

/** On-time % of the tasks closed in a range that had a deadline (null below 3). */
function onTimeOf(closed: KpiTask[]) {
  const due = closed.filter((k) => k.onTime !== null);
  return due.length >= 3 ? (due.filter((k) => k.onTime).length / due.length) * 100 : null;
}

const taskLine = (k: KpiTask, meta: string, name: ReportInput['name'], tone?: 'good' | 'bad') => ({
  text: `${k.t.title}`,
  taskId: k.t.id,
  meta: `${name.project(k.t.groupId)} · ${name.person(k.t.responsibleId)} · ${meta}`,
  tone,
});

const capped = <T>(xs: T[]) => ({
  items: xs.slice(0, LIST),
  more: xs.length > LIST ? xs.length - LIST : undefined,
});

/** The report for one recipient: one section per chosen topic, in catalogue order. */
export function buildReport(input: ReportInput): ReportData {
  const { ctx, name } = input;
  const scope = kpiScope(input.tasks, ctx);
  const range = periodBounds(ctx.now, input.period, ctx.cal, input.back);
  const prev = periodBounds(ctx.now, input.period, ctx.cal, input.back + 1);
  const closedIn = (r: { start: Date; end: Date }) =>
    scope.all.filter(
      (k) => !k.open && !k.hold && !scope.bulk.has(k.t.id) && within(k.actualEnd, r),
    );
  const closed = closedIn(range);
  const closedPrev = closedIn(prev);
  const open = scope.all.filter((k) => k.open);
  const overdue = open.filter((k) => k.overdue);
  const w = windows(ctx, input.period === 'month' ? 30 : input.period === 'week' ? 14 : 7);
  const sections: ReportSection[] = [];
  const want = new Set(input.topics);

  for (const { key } of REPORT_TOPICS) {
    if (!want.has(key)) continue;
    if (key === 'summary') {
      const ot = onTimeOf(closed);
      sections.push({
        topic: key,
        title: 'How it went',
        stats: [
          {
            label: 'Closed',
            value: String(closed.length),
            tone: closed.length >= closedPrev.length ? 'good' : undefined,
          },
          { label: 'Before', value: String(closedPrev.length) },
          {
            label: 'On time',
            value: pct(ot),
            tone: ot === null ? undefined : ot >= 80 ? 'good' : ot < 50 ? 'bad' : undefined,
          },
          { label: 'Open', value: String(open.length) },
          {
            label: 'Overdue now',
            value: String(overdue.length),
            tone: overdue.length ? 'bad' : 'good',
          },
        ],
      });
    } else if (key === 'dueToday') {
      const today = periodBounds(ctx.now, 'day', ctx.cal, 0);
      const due = open.filter((k) => within(k.t.deadline, today));
      sections.push({
        topic: key,
        title: 'Due today',
        ...capped(due.map((k) => taskLine(k, k.t.stage ?? '', name))),
        empty: 'Nothing due today.',
      });
    } else if (key === 'inHand') {
      const h = dayHours(ctx.cal);
      const nextDay = addWorkingHours(ctx.now, h, ctx.cal);
      const nextWeek = new Date(ctx.now.getTime() + 7 * DAY_MS);
      const nextMonth = new Date(ctx.now.getTime() + 30 * DAY_MS);
      const due = (to: Date, from: Date = ctx.now) =>
        open.filter((k) => k.t.deadline && k.t.deadline >= from && k.t.deadline < to);
      const day = due(nextDay);
      const week = due(nextWeek, nextDay);
      const month = due(nextMonth, nextWeek);
      sections.push({
        topic: key,
        title: 'Tasks in hand',
        stats: [
          { label: 'Next working day', value: String(day.length) },
          { label: 'Rest of the week', value: String(week.length) },
          { label: 'Rest of the month', value: String(month.length) },
        ],
        ...capped(
          [...day, ...week].map((k) => taskLine(k, `due ${fmt(k.t.deadline!, ctx.tz)}`, name)),
        ),
        empty: 'Nothing due in the next week.',
      });
    } else if (key === 'releases') {
      const plan = releasePlan(scope, ctx);
      sections.push({
        topic: key,
        title: 'Releases this week and next',
        stats: [
          { label: 'This week', value: String(plan.filter((r) => r.week === 'this').length) },
          { label: 'Next week', value: String(plan.filter((r) => r.week === 'next').length) },
          {
            label: 'At high risk',
            value: String(plan.filter((r) => r.risk === 'high').length),
            tone: plan.some((r) => r.risk === 'high') ? 'bad' : 'good',
          },
        ],
        ...capped(
          plan.map((r) => {
            const k = scope.all.find((x) => x.t.id === r.id)!;
            return taskLine(
              k,
              `planned ${fmt(r.deadline, ctx.tz)} · ${r.risk} risk: ${r.reason}`,
              name,
              r.risk === 'high' ? 'bad' : undefined,
            );
          }),
        ),
        empty: 'Nothing planned this week or next.',
      });
    } else if (key === 'wentWell') {
      const early = closed
        .filter((k) => k.onTime && k.t.deadline && k.actualEnd)
        .sort(
          (a, b) =>
            b.t.deadline!.getTime() -
            b.actualEnd!.getTime() -
            (a.t.deadline!.getTime() - a.actualEnd!.getTime()),
        );
      sections.push({
        topic: key,
        title: 'What went well',
        stats: [
          {
            label: 'Closed on time',
            value: String(closed.filter((k) => k.onTime).length),
            tone: 'good',
          },
          { label: 'Closed', value: String(closed.length) },
        ],
        ...capped(
          early.map((k) =>
            taskLine(
              k,
              `${Math.round((k.t.deadline!.getTime() - k.actualEnd!.getTime()) / DAY_MS)} days early`,
              name,
              'good',
            ),
          ),
        ),
        empty: 'Nothing closed on time in this period.',
      });
    } else if (key === 'improve') {
      const late = closed.filter((k) => k.onTime === false);
      const rework = scope.all.filter((k) =>
        k.t.events.some(
          (e) =>
            within(e.at, range) &&
            e.to &&
            ['Issue Raised', 'To do', 'In progress'].includes(e.to) &&
            e.from &&
            ['QA Backlog', 'In QA', 'Done'].includes(e.from),
        ),
      );
      sections.push({
        topic: key,
        title: 'What to improve',
        stats: [
          {
            label: 'Overdue now',
            value: String(overdue.length),
            tone: overdue.length ? 'bad' : 'good',
          },
          {
            label: 'Closed late',
            value: String(late.length),
            tone: late.length ? 'bad' : undefined,
          },
          {
            label: 'Sent back by QA',
            value: String(rework.length),
            tone: rework.length ? 'bad' : undefined,
          },
        ],
        ...capped(
          overdue
            .sort((a, b) => b.daysOverdue - a.daysOverdue)
            .map((k) =>
              taskLine(
                k,
                `${k.daysOverdue} day${k.daysOverdue === 1 ? '' : 's'} overdue`,
                name,
                'bad',
              ),
            ),
        ),
        empty: 'Nothing overdue. Well done.',
      });
    } else if (key === 'lagging') {
      const projects = projectLag(scope, ctx, w).filter((p) => p.lagging);
      const people = peopleLag(scope, ctx, w).filter((p) => p.lagging);
      sections.push({
        topic: key,
        title: 'Lagging projects and people',
        items: [
          ...projects
            .slice(0, 5)
            .map((p) => ({
              text: name.project(p.id),
              meta: p.reasons.join('; '),
              tone: 'bad' as const,
            })),
          ...people
            .slice(0, 5)
            .map((p) => ({
              text: name.person(p.id),
              meta: p.reasons.join('; '),
              tone: 'bad' as const,
            })),
        ],
        empty: 'Nothing lagging.',
      });
    } else if (key === 'load') {
      const loads = loadOf(scope, ctx, w);
      const { pulls } = overlap(scope, ctx, w);
      sections.push({
        topic: key,
        title: 'Load and overlap',
        items: [
          ...pulls.slice(0, 4).map((p) => ({
            text: `${name.project(p.pulling)} is taking the time of ${p.people.map(name.person).join(', ')}`,
            meta: `${name.project(p.suffering)} has ${p.overdueIds.length} of their tasks overdue`,
            tone: 'bad' as const,
          })),
          ...loads
            .filter((l) => l.level === 'over')
            .slice(0, 4)
            .map((l) => ({
              text: `${name.person(l.id)} is overloaded`,
              meta: l.reason ?? '',
              tone: 'bad' as const,
            })),
          ...loads
            .filter((l) => l.level === 'under')
            .slice(0, 4)
            .map((l) => ({ text: `${name.person(l.id)} has room to help`, meta: l.reason ?? '' })),
        ],
        empty: 'Load is balanced.',
      });
    } else if (key === 'holding') {
      const points = keyPoints(
        {
          projects: projectLag(scope, ctx, w),
          people: peopleLag(scope, ctx, w),
          load: loadOf(scope, ctx, w),
          pulls: overlap(scope, ctx, w).pulls,
          releases: releasePlan(scope, ctx),
        },
        name,
        6,
      );
      sections.push({
        topic: key,
        title: 'What is holding us back',
        items: points.map((p) => ({
          text: p.text,
          meta: `${p.taskIds.length} task${p.taskIds.length === 1 ? '' : 's'}`,
          tone: 'bad' as const,
        })),
        empty: 'Nothing holding back right now.',
      });
    } else if (key === 'absences') {
      sections.push({
        topic: key,
        title: 'Leave and attendance',
        items: (input.absences ?? []).map((a) => ({
          text: a.text,
          meta: `${a.taskIds.length} task${a.taskIds.length === 1 ? '' : 's'} at risk`,
        })),
        empty: input.absences
          ? 'No leave or late arrivals affecting work.'
          : 'Infowan is not connected yet.',
      });
    }
  }
  if (input.prompts.length) {
    sections.push({
      topic: 'prompts',
      title: 'To think about',
      items: input.prompts.map((p) => ({ text: p })),
    });
  }
  return { title: input.title, periodLabel: periodLabel(input.period, range, ctx.tz), sections };
}

/** A recipient's value of a condition metric (null when there is too little to judge). */
export function conditionValue(
  tasks: readonly MetricTask[],
  ctx: KpiContext,
  metric: ConditionMetric,
): number | null {
  const scope = kpiScope(tasks, ctx);
  const week = (back: number) => ({
    start: new Date(ctx.now.getTime() - (back + 1) * 7 * DAY_MS),
    end: new Date(ctx.now.getTime() - back * 7 * DAY_MS),
  });
  const closedIn = (r: { start: Date; end: Date }) =>
    scope.all.filter(
      (k) => !k.open && !k.hold && !scope.bulk.has(k.t.id) && within(k.actualEnd, r),
    );
  if (metric === 'onTime') return onTimeOf(closedIn(week(0)));
  if (metric === 'overdueShare') {
    const open = scope.all.filter((k) => k.open);
    return open.length >= 3 ? (open.filter((k) => k.overdue).length / open.length) * 100 : null;
  }
  const usual = [1, 2, 3, 4].map((b) => closedIn(week(b)).length);
  const avg = usual.reduce((a, b) => a + b, 0) / usual.length;
  return avg >= 2 ? (closedIn(week(0)).length / avg) * 100 : null;
}

/** Does the value meet "very poor" or "very good" at this threshold? */
export function conditionMet(
  metric: ConditionMetric,
  when: 'poor' | 'good',
  threshold: number,
  value: number | null,
): boolean {
  if (value === null) return false;
  const higherIsBetter = CONDITION_METRICS.find((m) => m.key === metric)!.higherIsBetter;
  const good = higherIsBetter ? value >= threshold : value <= threshold;
  const poor = higherIsBetter ? value < threshold : value > threshold;
  return when === 'good' ? good : poor;
}
