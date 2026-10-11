// Insights (SRS 18, 2026-10-11): what is holding us back, worked out from Bitrix24 data (and
// absences from Infowan once connected). Pure functions over the KPI task view (kpi.ts), so the
// rules for open, overdue and completed are the same as on every tab. Every finding carries the
// IDs of the tasks behind it, so the page can open them. The data is the viewer's own scope: a
// member's insights cover their own tasks.
import { addWorkingHours, dayHours, workingHours } from './calendar';
import { KPI, periodBounds, type KpiContext, type KpiScope, type KpiTask } from './kpi';
import type { StageTitle } from './types';

/** The rules' thresholds, in one place (SRS 18). */
export const INSIGHT = {
  /** Look-back window for activity and closures (calendar days), unless the page picks another. */
  windowDays: 14,
  /** A project lags: at least this many overdue tasks and this share of its open tasks. */
  projectOverdueMin: 3,
  projectOverdueShare: 0.25,
  /** A project or person slows down: closed in the window this far below the window before. */
  slowdownShare: 0.5,
  slowdownMinPrev: 4,
  /** A person lags: at least this many overdue tasks and this share of their open tasks. */
  personOverdueMin: 3,
  personOverdueShare: 0.3,
  /** A person's on-time % below this (with at least `onTimeMinClosed` closed with a deadline). */
  onTimeLow: 0.5,
  onTimeMinClosed: 3,
  /** "Due soon" for load: within this many working days. */
  dueSoonWorkingDays: 5,
  /** Overloaded: at least this many open tasks and twice the team's middle (median), or this many due soon. */
  overloadOpenMin: 10,
  overloadDueSoon: 8,
  /** Underloaded: at most this many open tasks and closed in the window. */
  underloadOpenMax: 2,
  underloadClosedMax: 2,
  /** Overlap: a project takes this share of a person's activity while they have overdue work elsewhere. */
  pullShare: 0.7,
  /** Release risk: due within this many working days and not started. */
  riskWorkingDays: 2,
} as const;

const DAY_MS = 86_400_000;

export interface Windows {
  now: { start: Date; end: Date };
  prev: { start: Date; end: Date };
}

/** The window (last N days up to now) and the one before it. */
export function windows(ctx: KpiContext, days: number = INSIGHT.windowDays): Windows {
  const end = ctx.now;
  const start = new Date(end.getTime() - days * DAY_MS);
  return {
    now: { start, end },
    prev: { start: new Date(start.getTime() - days * DAY_MS), end: start },
  };
}

const within = (d: Date | null, r: { start: Date; end: Date }) => !!d && d >= r.start && d < r.end;
const isClosedIn = (k: KpiTask, r: { start: Date; end: Date }, bulk: Set<number>) =>
  !k.open && !k.hold && !bulk.has(k.t.id) && within(k.actualEnd, r);

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const pct = (n: number) => `${Math.round(n * 100)} %`;

// ---------------------------------------------------------------- projects

export interface ProjectLag {
  id: number;
  open: number;
  overdue: number;
  overdueShare: number;
  closedNow: number;
  closedPrev: number;
  /** Working days since the last action (stage move, closure or comment); null without open work. */
  idleDays: number | null;
  lagging: boolean;
  /** Why, in plain words. */
  reasons: string[];
  /** 0–100: how far behind (for ranking). */
  score: number;
  overdueIds: number[];
  openIds: number[];
}

export function projectLag(
  scope: KpiScope,
  ctx: KpiContext,
  w: Windows = windows(ctx),
): ProjectLag[] {
  const byProject = new Map<number, KpiTask[]>();
  for (const k of scope.inProjects) {
    const list = byProject.get(k.t.groupId) ?? [];
    list.push(k);
    byProject.set(k.t.groupId, list);
  }
  const lastComment = new Map<number, Date>();
  for (const c of ctx.comments ?? []) {
    const prev = lastComment.get(c.taskId);
    if (!prev || c.at > prev) lastComment.set(c.taskId, c.at);
  }
  const rows: ProjectLag[] = [];
  for (const [id, list] of byProject) {
    const open = list.filter((k) => k.open);
    const overdue = open.filter((k) => k.overdue);
    const closedNow = list.filter((k) => isClosedIn(k, w.now, scope.bulk)).length;
    const closedPrev = list.filter((k) => isClosedIn(k, w.prev, scope.bulk)).length;
    let last: Date | null = null;
    for (const k of list) {
      for (const d of [
        k.t.events.at(-1)?.at ?? null,
        k.actualEnd,
        lastComment.get(k.t.id) ?? null,
      ]) {
        if (d && (!last || d > last)) last = d;
      }
    }
    const idleDays =
      open.length && last
        ? workingHours(last, ctx.now, ctx.cal) / dayHours(ctx.cal)
        : open.length
          ? Infinity
          : null;
    const share = open.length ? overdue.length / open.length : 0;
    const reasons: string[] = [];
    if (overdue.length >= INSIGHT.projectOverdueMin && share >= INSIGHT.projectOverdueShare) {
      reasons.push(`${overdue.length} of ${open.length} open tasks overdue (${pct(share)})`);
    }
    if (open.length && idleDays !== null && idleDays >= KPI.silentWorkingDays) {
      reasons.push(
        Number.isFinite(idleDays)
          ? `no action for ${Math.floor(idleDays)} working days`
          : 'no action recorded',
      );
    }
    if (
      open.length &&
      closedPrev >= INSIGHT.slowdownMinPrev &&
      closedNow <= closedPrev * (1 - INSIGHT.slowdownShare)
    ) {
      reasons.push(`closed ${closedNow} in the last period vs ${closedPrev} before`);
    }
    const score = Math.min(
      100,
      Math.round(
        share * 60 +
          Math.min(overdue.length, 20) +
          (reasons.length > 1 ? 15 : 0) +
          (idleDays && idleDays >= KPI.silentWorkingDays ? 10 : 0),
      ),
    );
    rows.push({
      id,
      open: open.length,
      overdue: overdue.length,
      overdueShare: share,
      closedNow,
      closedPrev,
      idleDays: idleDays === null ? null : Number.isFinite(idleDays) ? Math.floor(idleDays) : null,
      lagging: reasons.length > 0,
      reasons,
      score,
      overdueIds: overdue.map((k) => k.t.id),
      openIds: open.map((k) => k.t.id),
    });
  }
  return rows.sort(
    (a, b) =>
      Number(b.lagging) - Number(a.lagging) ||
      b.score - a.score ||
      b.overdue - a.overdue ||
      a.id - b.id,
  );
}

// ---------------------------------------------------------------- people

export interface PersonLag {
  id: number;
  open: number;
  overdue: number;
  closedNow: number;
  closedPrev: number;
  /** Of the tasks closed in the window that had a deadline: share on time; null if too few. */
  onTime: number | null;
  lagging: boolean;
  reasons: string[];
  score: number;
  overdueIds: number[];
  closedIds: number[];
}

export function peopleLag(
  scope: KpiScope,
  ctx: KpiContext,
  w: Windows = windows(ctx),
): PersonLag[] {
  const byPerson = new Map<number, KpiTask[]>();
  for (const k of scope.all) {
    if (!k.t.responsibleId) continue;
    const list = byPerson.get(k.t.responsibleId) ?? [];
    list.push(k);
    byPerson.set(k.t.responsibleId, list);
  }
  const rows: PersonLag[] = [];
  for (const [id, list] of byPerson) {
    const open = list.filter((k) => k.open);
    const overdue = open.filter((k) => k.overdue);
    const closed = list.filter((k) => isClosedIn(k, w.now, scope.bulk));
    const closedPrev = list.filter((k) => isClosedIn(k, w.prev, scope.bulk)).length;
    const withDeadline = closed.filter((k) => k.onTime !== null);
    const onTime =
      withDeadline.length >= INSIGHT.onTimeMinClosed
        ? withDeadline.filter((k) => k.onTime).length / withDeadline.length
        : null;
    const reasons: string[] = [];
    const share = open.length ? overdue.length / open.length : 0;
    if (overdue.length >= INSIGHT.personOverdueMin && share >= INSIGHT.personOverdueShare) {
      reasons.push(`${overdue.length} of ${open.length} open tasks overdue`);
    }
    if (onTime !== null && onTime < INSIGHT.onTimeLow)
      reasons.push(`${pct(onTime)} on time in the last period`);
    if (
      open.length >= 5 &&
      closedPrev >= INSIGHT.slowdownMinPrev &&
      closed.length <= closedPrev * (1 - INSIGHT.slowdownShare)
    ) {
      reasons.push(`closed ${closed.length} in the last period vs ${closedPrev} before`);
    }
    rows.push({
      id,
      open: open.length,
      overdue: overdue.length,
      closedNow: closed.length,
      closedPrev,
      onTime,
      lagging: reasons.length > 0,
      reasons,
      score: Math.min(
        100,
        Math.round(
          share * 50 + Math.min(overdue.length, 25) + (onTime !== null ? (1 - onTime) * 25 : 0),
        ),
      ),
      overdueIds: overdue.map((k) => k.t.id),
      closedIds: closed.map((k) => k.t.id),
    });
  }
  return rows.sort(
    (a, b) => Number(b.lagging) - Number(a.lagging) || b.score - a.score || a.id - b.id,
  );
}

// ---------------------------------------------------------------- load

export type LoadLevel = 'over' | 'under' | 'ok';

export interface PersonLoad {
  id: number;
  open: number;
  overdue: number;
  /** Open, due within the next 5 working days. */
  dueSoon: number;
  closedNow: number;
  projects: number;
  level: LoadLevel;
  reason: string | null;
  openIds: number[];
  dueSoonIds: number[];
}

/**
 * Overloaded: many open tasks (at least 10 and twice the team's median) or many due in the next
 * 5 working days. Underloaded: almost nothing open and little closed while one of their projects
 * has overdue work: someone who could take tasks over.
 */
export function load(scope: KpiScope, ctx: KpiContext, w: Windows = windows(ctx)): PersonLoad[] {
  const soon = addWorkingHours(ctx.now, INSIGHT.dueSoonWorkingDays * dayHours(ctx.cal), ctx.cal);
  const byPerson = new Map<number, KpiTask[]>();
  const overdueByProject = new Map<number, number>();
  for (const k of scope.inProjects) {
    if (k.overdue) overdueByProject.set(k.t.groupId, (overdueByProject.get(k.t.groupId) ?? 0) + 1);
    if (!k.t.responsibleId) continue;
    const list = byPerson.get(k.t.responsibleId) ?? [];
    list.push(k);
    byPerson.set(k.t.responsibleId, list);
  }
  const opens = [...byPerson.values()].map((l) => l.filter((k) => k.open).length);
  const mid = median(opens);
  const rows: PersonLoad[] = [];
  for (const [id, list] of byPerson) {
    const open = list.filter((k) => k.open);
    const dueSoon = open.filter((k) => !k.overdue && k.t.deadline && k.t.deadline <= soon);
    const closedNow = list.filter((k) => isClosedIn(k, w.now, scope.bulk)).length;
    const projects = new Set(list.map((k) => k.t.groupId));
    let level: LoadLevel = 'ok';
    let reason: string | null = null;
    if (
      (open.length >= INSIGHT.overloadOpenMin && open.length >= 2 * mid) ||
      dueSoon.length >= INSIGHT.overloadDueSoon
    ) {
      level = 'over';
      reason =
        dueSoon.length >= INSIGHT.overloadDueSoon
          ? `${dueSoon.length} tasks due in the next ${INSIGHT.dueSoonWorkingDays} working days`
          : `${open.length} open tasks (team middle ${Math.round(mid)})`;
    } else if (open.length <= INSIGHT.underloadOpenMax && closedNow <= INSIGHT.underloadClosedMax) {
      const behind = [...projects]
        .map((g) => overdueByProject.get(g) ?? 0)
        .reduce((a, b) => a + b, 0);
      if (behind > 0) {
        level = 'under';
        reason = `${open.length} open and ${closedNow} closed lately, while their projects have ${behind} overdue`;
      }
    }
    rows.push({
      id,
      open: open.length,
      overdue: open.filter((k) => k.overdue).length,
      dueSoon: dueSoon.length,
      closedNow,
      projects: projects.size,
      level,
      reason,
      openIds: open.map((k) => k.t.id),
      dueSoonIds: dueSoon.map((k) => k.t.id),
    });
  }
  const order: Record<LoadLevel, number> = { over: 0, under: 1, ok: 2 };
  return rows.sort((a, b) => order[a.level] - order[b.level] || b.open - a.open || a.id - b.id);
}

// ---------------------------------------------------------------- overlap

export interface SharedPerson {
  id: number;
  /** Per project: open and overdue tasks, and the person's actions there in the window. */
  projects: { id: number; open: number; overdue: number; activity: number }[];
}

export interface Pull {
  /** The project taking the person's time. */
  pulling: number;
  /** The project whose tasks go overdue meanwhile. */
  suffering: number;
  people: number[];
  /** Overdue tasks of those people in the suffering project. */
  overdueIds: number[];
}

/** A person's action on a task in the window: a stage move by them, or the task completed. */
const activityOn = (k: KpiTask, person: number, r: { start: Date; end: Date }, bulk: Set<number>) =>
  k.t.events.filter(
    (e) => within(e.at, r) && (e.by === person || (e.by === null && k.t.responsibleId === person)),
  ).length + (isClosedIn(k, r, bulk) ? 1 : 0);

/**
 * People with open work in two or more projects, and which project is pulling them off another:
 * one project takes 70 % or more of their actions in the window while they have overdue tasks in
 * the other.
 */
export function overlap(
  scope: KpiScope,
  ctx: KpiContext,
  w: Windows = windows(ctx),
): { shared: SharedPerson[]; pulls: Pull[] } {
  const byPerson = new Map<number, KpiTask[]>();
  for (const k of scope.inProjects) {
    if (!k.t.responsibleId) continue;
    const list = byPerson.get(k.t.responsibleId) ?? [];
    list.push(k);
    byPerson.set(k.t.responsibleId, list);
  }
  const shared: SharedPerson[] = [];
  const pulls = new Map<string, Pull>();
  for (const [id, list] of byPerson) {
    const byProject = new Map<number, KpiTask[]>();
    for (const k of list) byProject.set(k.t.groupId, [...(byProject.get(k.t.groupId) ?? []), k]);
    const withOpen = [...byProject].filter(([, l]) => l.some((k) => k.open));
    if (withOpen.length < 2) continue;
    const projects = [...byProject].map(([g, l]) => ({
      id: g,
      open: l.filter((k) => k.open).length,
      overdue: l.filter((k) => k.overdue).length,
      activity: l.reduce((n, k) => n + activityOn(k, id, w.now, scope.bulk), 0),
      overdueIds: l.filter((k) => k.overdue).map((k) => k.t.id),
    }));
    shared.push({
      id,
      projects: projects
        .map((p) => ({ id: p.id, open: p.open, overdue: p.overdue, activity: p.activity }))
        .sort((a, b) => b.activity - a.activity || b.open - a.open),
    });
    const total = projects.reduce((n, p) => n + p.activity, 0);
    if (!total) continue;
    const top = projects.reduce((a, b) => (b.activity > a.activity ? b : a));
    if (top.activity / total < INSIGHT.pullShare) continue;
    for (const p of projects) {
      if (p.id === top.id || !p.overdue) continue;
      const key = `${top.id}>${p.id}`;
      const pull = pulls.get(key) ?? {
        pulling: top.id,
        suffering: p.id,
        people: [],
        overdueIds: [],
      };
      pull.people.push(id);
      pull.overdueIds.push(...p.overdueIds);
      pulls.set(key, pull);
    }
  }
  return {
    shared: shared.sort((a, b) => b.projects.length - a.projects.length || a.id - b.id),
    pulls: [...pulls.values()].sort(
      (a, b) => b.overdueIds.length - a.overdueIds.length || b.people.length - a.people.length,
    ),
  };
}

// ---------------------------------------------------------------- releases

export type Risk = 'high' | 'medium' | 'low';

export interface Release {
  id: number;
  deadline: Date;
  stage: StageTitle | null;
  week: 'this' | 'next';
  risk: Risk;
  reason: string;
}

/** Not started: nothing done on it yet. */
const NOT_STARTED: readonly (StageTitle | null)[] = ['To do', 'Issue Raised', null];
const UNDER_WAY: readonly (StageTitle | null)[] = ['In progress'];

/**
 * Open tasks due this week and next (their planned completion dates), with the risk of slipping:
 * high when overdue or due within 2 working days and not started; medium when still in
 * progress; low when already pushed or merged and waiting for QA.
 */
export function releasePlan(scope: KpiScope, ctx: KpiContext): Release[] {
  const thisWeek = periodBounds(ctx.now, 'week', ctx.cal, 0);
  const nextWeek = periodBounds(ctx.now, 'week', ctx.cal, -1);
  const close = addWorkingHours(ctx.now, INSIGHT.riskWorkingDays * dayHours(ctx.cal), ctx.cal);
  const out: Release[] = [];
  for (const k of scope.all) {
    const d = k.t.deadline;
    if (!k.open || !d) continue;
    const week =
      d >= thisWeek.start && d < thisWeek.end
        ? 'this'
        : d >= nextWeek.start && d < nextWeek.end
          ? 'next'
          : null;
    if (!week) continue;
    const stage = k.t.stage;
    let risk: Risk = 'low';
    let reason = `in ${stage ?? 'no stage'}`;
    if (k.overdue) {
      risk = 'high';
      reason = `already ${k.daysOverdue || 1} day${k.daysOverdue === 1 ? '' : 's'} overdue`;
    } else if (NOT_STARTED.includes(stage)) {
      risk = d <= close ? 'high' : 'medium';
      reason = d <= close ? 'not started, due within 2 working days' : 'not started yet';
    } else if (UNDER_WAY.includes(stage)) {
      risk = 'medium';
      reason = 'still in progress';
    }
    out.push({ id: k.t.id, deadline: d, stage, week, risk, reason });
  }
  const order: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
  return out.sort(
    (a, b) =>
      (a.week === b.week ? 0 : a.week === 'this' ? -1 : 1) ||
      order[a.risk] - order[b.risk] ||
      a.deadline.getTime() - b.deadline.getTime(),
  );
}

// ---------------------------------------------------------------- what is holding us back

export interface KeyPoint {
  kind: 'project' | 'person' | 'overload' | 'underload' | 'pull' | 'release';
  /** Higher first. */
  weight: number;
  /** Who or what it is about (project or person ID; pull: the suffering project). */
  subject: number;
  text: string;
  taskIds: number[];
}

/**
 * The findings ranked by how much they hold us back, at most `limit`. Causes (a project pulling
 * people off another) come before symptoms (overdue projects and people).
 */
export function keyPoints(
  parts: {
    projects: ProjectLag[];
    people: PersonLag[];
    load: PersonLoad[];
    pulls: Pull[];
    releases: Release[];
  },
  name: { project: (id: number) => string; person: (id: number) => string },
  limit = 8,
): KeyPoint[] {
  const out: KeyPoint[] = [];
  for (const p of parts.projects.filter((x) => x.lagging)) {
    out.push({
      kind: 'project',
      weight: 40 + p.score,
      subject: p.id,
      text: `${name.project(p.id)}: ${p.reasons.join('; ')}`,
      taskIds: p.overdueIds.length ? p.overdueIds : p.openIds,
    });
  }
  for (const pull of parts.pulls) {
    out.push({
      kind: 'pull',
      // A cause (people pulled away) ranks above the symptoms it explains.
      weight: 150 + pull.overdueIds.length * 2,
      subject: pull.suffering,
      text: `${name.project(pull.pulling)} is taking the time of ${pull.people.map(name.person).join(', ')} while ${name.project(pull.suffering)} has ${pull.overdueIds.length} of their tasks overdue`,
      taskIds: pull.overdueIds,
    });
  }
  for (const p of parts.people.filter((x) => x.lagging)) {
    out.push({
      kind: 'person',
      weight: 30 + p.score,
      subject: p.id,
      text: `${name.person(p.id)}: ${p.reasons.join('; ')}`,
      taskIds: p.overdueIds,
    });
  }
  for (const l of parts.load.filter((x) => x.level === 'over')) {
    out.push({
      kind: 'overload',
      weight: 35 + l.dueSoon * 2 + l.overdue,
      subject: l.id,
      text: `${name.person(l.id)} is overloaded: ${l.reason}`,
      taskIds: l.dueSoonIds.length ? l.dueSoonIds : l.openIds,
    });
  }
  for (const l of parts.load.filter((x) => x.level === 'under')) {
    out.push({
      kind: 'underload',
      weight: 25,
      subject: l.id,
      text: `${name.person(l.id)} has room: ${l.reason}`,
      taskIds: l.openIds,
    });
  }
  const atRisk = parts.releases.filter((r) => r.week === 'this' && r.risk === 'high');
  if (atRisk.length) {
    out.push({
      kind: 'release',
      weight: 45 + atRisk.length * 2,
      subject: 0,
      text: `${atRisk.length} task${atRisk.length > 1 ? 's' : ''} due this week at high risk of slipping`,
      taskIds: atRisk.map((r) => r.id),
    });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, limit);
}
