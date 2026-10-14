// Daily update (2026-10-14, SRS 23): each person's morning plan and evening wrap-up, posted to
// the Slack daily work update group. Pure functions: what to suggest in the morning, whether a
// planned task is done by the evening, and the two Slack messages.
import { isWorkingDay, type WorkCalendar } from './calendar';
import { isDeployed, isDueToday, isOverdue, isPending, isSentToQa } from './metrics';
import { dayKey } from './time';
import type { MetricContext, MetricTask } from './types';

const DAY_MS = 86_400_000;

/** Why a task is on the plan: overdue, due today, or added by the person. */
export type DailyWhy = 'overdue' | 'today' | 'added';

export interface DailyItem {
  taskId: number;
  title: string;
  project: string;
  why: DailyWhy;
  /** Overdue: whole days past the deadline (at least 1). */
  daysOverdue?: number;
}

export interface WrapItem {
  taskId: number;
  title: string;
  project: string;
  state: 'done' | 'wip';
  /** Unplanned work added in the evening (created in Bitrix24). */
  extra?: boolean;
}

type Ctx = Pick<MetricContext, 'now' | 'tz'>;
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

/** A task the person can put on their plan: theirs and still open (not completed or on hold). */
export const isPlannable = (t: MetricTask, userId: number) =>
  t.responsibleId === userId && isPending(t) && !isDeployed(t);

/**
 * The morning suggestions: the person's open tasks that are overdue (most overdue first), then
 * those due today. A task is listed once.
 */
export function dailySuggestions(
  tasks: readonly MetricTask[],
  userId: number,
  ctx: Ctx,
  project: (groupId: number) => string,
): DailyItem[] {
  const c = full(ctx);
  const mine = tasks.filter((t) => isPlannable(t, userId));
  const overdue = mine
    .filter((t) => isOverdue(t, c) && !isDueToday(t, c))
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())
    .map((t): DailyItem => ({
      taskId: t.id,
      title: t.title,
      project: project(t.groupId),
      why: 'overdue',
      daysOverdue: Math.max(1, Math.floor((ctx.now.getTime() - t.deadline!.getTime()) / DAY_MS)),
    }));
  const today = mine
    .filter((t) => isDueToday(t, c))
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())
    .map((t): DailyItem => ({
      taskId: t.id,
      title: t.title,
      project: project(t.groupId),
      why: 'today',
    }));
  return [...overdue, ...today];
}

/** Done by the evening: completed in Bitrix24 (status 5, or 4 awaiting control) or sent to QA. */
export const wrapState = (t: MetricTask | undefined): 'done' | 'wip' =>
  t && (t.status === 5 || t.status === 4 || isSentToQa(t)) ? 'done' : 'wip';

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
): SlackText {
  const overdue = items.filter((i) => i.why === 'overdue').length;
  const today = items.filter((i) => i.why === 'today').length;
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
          : ':large_blue_circle: planned';
    return `• ${link(i, taskUrl)} — ${i.project} · ${tag}`;
  });
  const title = `${head(who)} · :sunrise: Plan for ${dayLabel}`;
  const note$ = noteLine(note);
  return {
    text: `${who.name}: plan for ${dayLabel} (${counts})`,
    blocks: [
      section(title),
      section(lines.length ? lines.join('\n') : '_No tasks planned._'),
      ...(note$ ? [section(note$)] : []),
      context(`${counts} · posted from Nural Pulse`),
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
  const done = items.filter((i) => i.state === 'done').length;
  const wip = items.filter((i) => i.state === 'wip').length;
  const line = (i: WrapItem) =>
    `• ${i.state === 'done' ? ':white_check_mark: Done' : ':arrows_counterclockwise: WIP'} — ${link(i, taskUrl)} — ${i.project}`;
  const counts = [`${done} done`, `${wip} WIP`, extra.length ? `${extra.length} unplanned` : null]
    .filter(Boolean)
    .join(' · ');
  const note$ = noteLine(note);
  return {
    text: `${who.name}: day wrap-up for ${dayLabel} (${counts})`,
    blocks: [
      section(`${head(who)} · :city_sunset: Wrap-up for ${dayLabel}`),
      section(planned.length ? planned.map(line).join('\n') : '_Nothing was planned._'),
      ...(extra.length ? [section(`*Also did*\n${extra.map(line).join('\n')}`)] : []),
      ...(note$ ? [section(note$)] : []),
      context(`${counts} · posted from Nural Pulse`),
    ],
  };
}
