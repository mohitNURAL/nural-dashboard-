// Daily update (2026-10-14, SRS 23): each person's morning plan and evening wrap-up, posted to
// the Slack daily work update group. Pure functions: what to suggest in the morning, whether a
// planned task is done by the evening, and the two Slack messages.
import { isWorkingDay, type WorkCalendar } from './calendar';
import { isDeployed, isDueToday, isOnHold, isOverdue, isPending, isSentToQa } from './metrics';
import { hasRole } from './stages';
import { dayKey } from './time';
import type { MetricContext, MetricTask } from './types';

const DAY_MS = 86_400_000;

/**
 * Why a task is on the plan: carried over from the last plan (still pending or WIP), overdue, due
 * today, upcoming (deadline after today, taken early), no deadline (2026-10-21: posting the plan
 * sets its deadline to today), or added by the person.
 */
export type DailyWhy = 'carried' | 'overdue' | 'today' | 'upcoming' | 'noDeadline' | 'added';

/**
 * Where a task stands for the Daily update and its Slack posts (2026-10-17), by workflow role:
 * - a dev task or an issue: the start stage (To do) is Pending; In progress up to before QA entry
 *   (In progress, Pushed to Master, Merged to Development, Pending for QA, Issue Raised) is WIP;
 *   QA entry or later (QA Backlog, In QA, Done, LIVE) is Done;
 * - a testing task (assigned to the QA Testing department): To do is Pending, In progress is WIP,
 *   Issue Raised or anything from QA entry on is Done;
 * - On Hold is On hold; completed in Bitrix24 (status 5, or 4 awaiting control) is Done.
 */
export type DailyState = 'pending' | 'wip' | 'done' | 'hold';

export function dailyState(
  t: MetricTask | undefined,
  testers: ReadonlySet<number> = new Set(),
): DailyState {
  if (!t) return 'pending';
  if (t.status === 5 || t.status === 4 || isSentToQa(t)) return 'done';
  if (isOnHold(t)) return 'hold';
  if (!t.stage || hasRole(t.stage, 'start')) return 'pending';
  if (testers.has(t.responsibleId) && hasRole(t.stage, 'issue')) return 'done';
  return 'wip';
}

export const DAILY_STATE_LABEL: Record<DailyState, string> = {
  pending: 'Pending',
  wip: 'WIP',
  done: 'Done',
  hold: 'On hold',
};

export interface DailyItem {
  taskId: number;
  title: string;
  project: string;
  why: DailyWhy;
  /** Overdue: whole days past the deadline (at least 1). */
  daysOverdue?: number;
  /** Added after the plan was posted (ISO time), e.g. in the middle of the day (2026-10-22). */
  addedAt?: string;
}

export interface WrapItem {
  taskId: number;
  title: string;
  project: string;
  /** Older wrap-ups hold only done or wip. */
  state: DailyState;
  /** Unplanned work added in the evening (created in Bitrix24). */
  extra?: boolean;
}

type Ctx = Pick<MetricContext, 'now' | 'tz'> & { testers?: ReadonlySet<number> };
const full = (c: Ctx): MetricContext => ({ ...c, testers: new Set() });

/** The person's day: YYYY-MM-DD in the app time zone. */
export const dailyDay = (now: Date, tz: string) => dayKey(now, tz);

/**
 * Where the day stands: a working day (not a weekend or holiday), and the minute of the day
 * (local) from which the evening wrap-up reminder shows: the end of the working day.
 */
export function dailyClock(now: Date, cal: WorkCalendar) {
  const local = now.getTime() + cal.offsetMin * 60_000;
  const day = Math.floor(local / DAY_MS);
  return {
    working: isWorkingDay(day, cal),
    nowMin: Math.floor((local - day * DAY_MS) / 60_000),
    wrapFromMin: cal.endMin,
  };
}

/** Minutes after local midnight of "HH:MM". */
const hhmmMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Late planned (2026-10-22): the plan was first posted after the check-in time (11:30, config/
 * daily-checkins.json "plan"), by the clock of the day it was posted.
 */
export function isLatePlan(plannedAt: Date | string | null, by: string, cal: WorkCalendar) {
  if (!plannedAt) return false;
  return dailyClock(new Date(plannedAt), cal).nowMin > hhmmMin(by);
}

/** "14:05" in the calendar's time zone. */
export function clockLabel(at: Date | string, cal: WorkCalendar) {
  const min = dailyClock(new Date(at), cal).nowMin;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * A task the person can put on their plan: theirs, still open (not completed or on hold) and not
 * done by the Daily update rule (a testing task in Issue Raised is done).
 */
export const isPlannable = (
  t: MetricTask,
  userId: number,
  testers: ReadonlySet<number> = new Set(),
) =>
  t.responsibleId === userId && isPending(t) && !isDeployed(t) && dailyState(t, testers) !== 'done';

/**
 * The morning suggestions: what was planned last time and is still pending or WIP (carried over;
 * a done task never comes back), then the person's open tasks that are overdue (most overdue
 * first), then those due today. A task is listed once.
 */
export function dailySuggestions(
  tasks: readonly MetricTask[],
  userId: number,
  ctx: Ctx,
  project: (groupId: number) => string,
  carried: readonly number[] = [],
): DailyItem[] {
  const c = full(ctx);
  const testers = ctx.testers ?? new Set<number>();
  const mine = tasks.filter((t) => isPlannable(t, userId, testers));
  const byId = new Map(mine.map((t) => [t.id, t]));
  const carriedItems = [...new Set(carried)]
    .map((id) => byId.get(id))
    .filter((t): t is MetricTask => !!t)
    .map((t): DailyItem => ({
      taskId: t.id,
      title: t.title,
      project: project(t.groupId),
      why: 'carried',
    }));
  const seen = new Set(carriedItems.map((i) => i.taskId));
  const overdue = mine
    .filter((t) => !seen.has(t.id) && isOverdue(t, c) && !isDueToday(t, c))
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())
    .map((t): DailyItem => ({
      taskId: t.id,
      title: t.title,
      project: project(t.groupId),
      why: 'overdue',
      daysOverdue: Math.max(1, Math.floor((ctx.now.getTime() - t.deadline!.getTime()) / DAY_MS)),
    }));
  const today = mine
    .filter((t) => !seen.has(t.id) && isDueToday(t, c))
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())
    .map((t): DailyItem => ({
      taskId: t.id,
      title: t.title,
      project: project(t.groupId),
      why: 'today',
    }));
  return [...carriedItems, ...overdue, ...today];
}

/**
 * Upcoming: the person's open tasks with a deadline after today (soonest first), to take on
 * early or to report as done ahead.
 */
export function dailyUpcoming(
  tasks: readonly MetricTask[],
  userId: number,
  ctx: Ctx,
  project: (groupId: number) => string,
  limit = 40,
): DailyItem[] {
  const today = dayKey(ctx.now, ctx.tz);
  return tasks
    .filter(
      (t) =>
        isPlannable(t, userId, ctx.testers) && !!t.deadline && dayKey(t.deadline, ctx.tz) > today,
    )
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())
    .slice(0, limit)
    .map((t) => ({ taskId: t.id, title: t.title, project: project(t.groupId), why: 'upcoming' }));
}

/**
 * No deadline (2026-10-21): the person's open tasks with no deadline set, most recently changed
 * first. Put on the plan, posting it sets their deadline to today (dailyDeadline).
 */
export function dailyNoDeadline(
  tasks: readonly MetricTask[],
  userId: number,
  ctx: Ctx,
  project: (groupId: number) => string,
  limit = 40,
): DailyItem[] {
  return tasks
    .filter((t) => isPlannable(t, userId, ctx.testers) && !t.deadline)
    .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
    .slice(0, limit)
    .map((t) => ({ taskId: t.id, title: t.title, project: project(t.groupId), why: 'noDeadline' }));
}

/**
 * The deadline a planned task with none gets (2026-10-21): the end of the working day (calendar
 * `end`), or 23:59 when that has already passed.
 */
export function dailyDeadline(now: Date, cal: WorkCalendar): Date {
  const local = now.getTime() + cal.offsetMin * 60_000;
  const midnight = Math.floor(local / DAY_MS) * DAY_MS - cal.offsetMin * 60_000;
  const end = new Date(midnight + cal.endMin * 60_000);
  return end > now ? end : new Date(midnight + (24 * 60 - 1) * 60_000);
}

/** The evening state of a task: dailyState (done, WIP, pending or on hold). */
export const wrapState = (
  t: MetricTask | undefined,
  testers: ReadonlySet<number> = new Set(),
): DailyState => dailyState(t, testers);

export interface SlackText {
  text: string;
  blocks: unknown[];
}

interface Who {
  name: string;
  /** "<@U123>" when the person is found in Slack. */
  mention: string | null;
}

/** A link to the task in Bitrix24, or just its title without a portal. */
function link(item: { taskId: number; title: string }, taskUrl?: (id: number) => string) {
  const title = item.title.replace(/[<>|]/g, ' ').trim() || `Task ${item.taskId}`;
  return taskUrl && item.taskId > 0 ? `<${taskUrl(item.taskId)}|${title}>` : title;
}

const section = (text: string) => ({ type: 'section', text: { type: 'mrkdwn', text } });
/** Slack refuses a section over 3000 characters (invalid_blocks, 2026-10-23). */
const SECTION_MAX = 2900;
/**
 * Lines as few sections as fit Slack's limit, a long list split over several (at most 45, so the
 * message stays under Slack's 50 blocks); `first` heads the first one.
 */
export function slackSections(lines: readonly string[], first?: string) {
  const out: string[] = [];
  let cur = first ?? '';
  for (const raw of lines) {
    const line = raw.length > SECTION_MAX ? `${raw.slice(0, SECTION_MAX - 1)}…` : raw;
    if (cur && cur.length + 1 + line.length > SECTION_MAX) {
      out.push(cur);
      cur = line;
    } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) out.push(cur);
  return out.slice(0, 45).map(section);
}
const context = (text: string) => ({
  type: 'context',
  elements: [{ type: 'mrkdwn', text }],
});
const head = (who: Who) => `*${who.name}*${who.mention ? ` (${who.mention})` : ''}`;
const noteLine = (note: string | undefined) =>
  note?.trim() ? `:memo: ${note.trim().replace(/\n+/g, ' ')}` : null;

/** The morning plan, e.g. "Ram Kumar (@ram) · Plan for Wed 14 Oct · 2 overdue · 1 due today". */
export function slackPlan(
  who: Who,
  dayLabel: string,
  items: readonly DailyItem[],
  note?: string,
  taskUrl?: (id: number) => string,
  /** Late planned: the time it was first posted ("12:10"); added-later tasks show their time. */
  opts: { late?: string; addedLabel?: (iso: string) => string } = {},
): SlackText {
  const overdue = items.filter((i) => i.why === 'overdue').length;
  const today = items.filter((i) => i.why === 'today' || i.why === 'noDeadline').length;
  const counts = [
    `${items.length} task${items.length === 1 ? '' : 's'}`,
    overdue ? `${overdue} overdue` : null,
    today ? `${today} due today` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const lines = items.map((i) => {
    const tag =
      i.why === 'overdue'
        ? `:red_circle: ${i.daysOverdue ?? 1}d overdue`
        : i.why === 'today'
          ? ':large_orange_circle: due today'
          : i.why === 'carried'
            ? ':repeat: carried over'
            : i.why === 'upcoming'
              ? ':calendar: taken early'
              : i.why === 'noDeadline'
                ? ':large_orange_circle: due today (deadline set)'
                : ':large_blue_circle: planned';
    const later = i.addedAt
      ? ` · :heavy_plus_sign: added ${opts.addedLabel?.(i.addedAt) ?? 'later'}`
      : '';
    return `• ${link(i, taskUrl)} — ${i.project} · ${tag}${later}`;
  });
  const late = opts.late ? ` · :hourglass_flowing_sand: *Late planned* (${opts.late})` : '';
  const title = `${head(who)} · :sunrise: Plan for ${dayLabel}${late}`;
  const note$ = noteLine(note);
  return {
    text: `${who.name}: plan for ${dayLabel} (${counts})`,
    blocks: [
      section(title),
      ...(lines.length ? slackSections(lines) : [section('_No tasks planned._')]),
      ...(note$ ? [section(note$)] : []),
      context(`${counts} · posted from Nural Pulse`),
    ],
  };
}

/** Tasks added to a posted plan during the day: a reply in the plan's thread (2026-10-22). */
export function slackPlanAdded(
  who: Who,
  time: string,
  items: readonly DailyItem[],
  taskUrl?: (id: number) => string,
): SlackText {
  const n = `${items.length} task${items.length === 1 ? '' : 's'}`;
  return {
    text: `${who.name} added ${n} to the plan at ${time}`,
    blocks: [
      section(`${head(who)} · :heavy_plus_sign: Added to the plan at ${time}`),
      ...slackSections(items.map((i) => `• ${link(i, taskUrl)} — ${i.project}`)),
    ],
  };
}

/**
 * The 11:30 nudge in the daily work update group (2026-10-22): who has not planned yet,
 * mentioned so Slack notifies them; anyone posting after it is tagged Late planned.
 */
export function slackNotPlanned(
  dayLabel: string,
  people: readonly string[],
  expected: number,
  by: string,
): SlackText {
  return {
    text: `Not planned yet ${dayLabel}: ${people.length} of ${expected}`,
    blocks: [
      ...slackSections(
        people.length ? people.map((p) => `• ${p}`) : ['_Everyone has planned._'],
        `:alarm_clock: *Not planned yet · ${dayLabel}* (${people.length} of ${expected})`,
      ),
      context(`A plan posted after ${by} is tagged Late planned · Nural Pulse`),
    ],
  };
}

/** The evening wrap-up: each planned task done or WIP, and unplanned work added. */
export function slackWrap(
  who: Who,
  dayLabel: string,
  items: readonly WrapItem[],
  note?: string,
  taskUrl?: (id: number) => string,
): SlackText {
  const planned = items.filter((i) => !i.extra);
  const extra = items.filter((i) => i.extra);
  const n = (s: DailyState) => items.filter((i) => i.state === s).length;
  const icon: Record<DailyState, string> = {
    done: ':white_check_mark: Done',
    wip: ':arrows_counterclockwise: WIP',
    pending: ':hourglass_flowing_sand: Pending',
    hold: ':double_vertical_bar: On hold',
  };
  const line = (i: WrapItem) =>
    `• ${icon[i.state] ?? icon.wip} — ${link(i, taskUrl)} — ${i.project}`;
  const counts = [
    `${n('done')} done`,
    `${n('wip')} WIP`,
    n('pending') ? `${n('pending')} pending` : null,
    n('hold') ? `${n('hold')} on hold` : null,
    extra.length ? `${extra.length} unplanned` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const note$ = noteLine(note);
  return {
    text: `${who.name}: day wrap-up for ${dayLabel} (${counts})`,
    blocks: [
      section(`${head(who)} · :city_sunset: Wrap-up for ${dayLabel}`),
      ...(planned.length ? slackSections(planned.map(line)) : [section('_Nothing was planned._')]),
      ...(extra.length ? slackSections(extra.map(line), '*Also did*') : []),
      ...(note$ ? [section(note$)] : []),
      context(`${counts} · posted from Nural Pulse`),
    ],
  };
}

// ---------------------------------------------------------------- who posted (2026-10-17)

/** One person's day as far as posting goes. */
export interface DayPost {
  userId: number;
  plannedAt: Date | string | null;
  wrappedAt: Date | string | null;
}

/**
 * Who has and has not planned and wrapped up their day, among the people expected to (everyone
 * active with the Daily update right). Report tiles and the Slack check-ins to the directors.
 */
export function dailyCompliance(expected: readonly number[], posts: readonly DayPost[]) {
  const by = new Map(posts.map((p) => [p.userId, p]));
  const planned = expected.filter((id) => !!by.get(id)?.plannedAt);
  const wrapped = expected.filter((id) => !!by.get(id)?.wrappedAt);
  return {
    expected: [...expected],
    planned,
    notPlanned: expected.filter((id) => !by.get(id)?.plannedAt),
    wrapped,
    notWrapped: expected.filter((id) => !by.get(id)?.wrappedAt),
    /** Planned in the morning but no wrap-up yet. */
    plannedNotWrapped: planned.filter((id) => !by.get(id)?.wrappedAt),
  };
}

/**
 * The check-in to the directors (2026-10-17), as a Slack direct message: at 11:30 who has and has
 * not planned their day; at 19:00 who has and has not wrapped up (and who planned without wrapping
 * up). Names, counts and a link to Report › Daily task update.
 */
export function slackCheckIn(
  kind: 'plan' | 'wrap',
  dayLabel: string,
  c: {
    expected: number;
    planned: readonly string[];
    notPlanned: readonly string[];
    wrapped: readonly string[];
    notWrapped: readonly string[];
    plannedNotWrapped: readonly string[];
    /** Planned after the check-in time (Late planned, 2026-10-22), for the evening message. */
    latePlanned?: readonly string[];
  },
  reportUrl?: string,
): SlackText {
  const list = (names: readonly string[]) =>
    names.length ? names.map((n) => `• ${n}`).join('\n') : '_Nobody._';
  const link = reportUrl ? ` · <${reportUrl}|Open the report>` : '';
  if (kind === 'plan') {
    const title = `:sunrise: *Daily plans · ${dayLabel}*: ${c.planned.length} of ${c.expected} have planned their day`;
    return {
      text: `Daily plans ${dayLabel}: ${c.planned.length} of ${c.expected} planned, ${c.notPlanned.length} not yet`,
      blocks: [
        section(title),
        section(`*Not planned yet (${c.notPlanned.length})*\n${list(c.notPlanned)}`),
        section(`*Planned (${c.planned.length})*\n${list(c.planned)}`),
        context(`Sent by Nural Pulse at 11:30${link}`),
      ],
    };
  }
  const title = `:city_sunset: *Day wrap-ups · ${dayLabel}*: ${c.wrapped.length} of ${c.expected} have posted what they did`;
  return {
    text: `Day wrap-ups ${dayLabel}: ${c.wrapped.length} of ${c.expected} wrapped up, ${c.notWrapped.length} not yet`,
    blocks: [
      section(title),
      section(
        `*Not wrapped up (${c.notWrapped.length})*\n${list(c.notWrapped)}` +
          (c.plannedNotWrapped.length
            ? `\n_Of them, planned this morning: ${c.plannedNotWrapped.join(', ')}_`
            : ''),
      ),
      section(`*Wrapped up (${c.wrapped.length})*\n${list(c.wrapped)}`),
      section(`*Did not plan today (${c.notPlanned.length})*\n${list(c.notPlanned)}`),
      ...(c.latePlanned?.length
        ? [section(`*Planned late (${c.latePlanned.length})*\n${list(c.latePlanned)}`)]
        : []),
      context(`Sent by Nural Pulse at 19:00${link}`),
    ],
  };
}
