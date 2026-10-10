// Per-request metric context and the shapes the web app receives (IDs resolved to names).
import {
  ageingDays,
  issueAgeDays,
  isOpenIssue,
  isOverdue,
  isPending,
  reworkCount,
  STAGE_COLORS,
  stageGroup,
  type GroupBy,
  type MetricContext,
  type MetricTask,
} from '@nural/shared';
import type { Dataset, DeptGroup } from '../data/dataset';

export interface AppOptions {
  tz: string;
  /** Overridable for tests. */
  now?: () => Date;
}

export const contextOf = (ds: Dataset, opts: AppOptions): MetricContext => ({
  now: opts.now?.() ?? new Date(),
  tz: opts.tz,
  testers: ds.testers,
});

export interface PersonRef {
  id: number;
  name: string;
  deptGroup: DeptGroup;
}

export const person = (ds: Dataset, id: number): PersonRef => {
  const u = ds.users.get(id);
  return { id, name: u?.name ?? `User ${id}`, deptGroup: u?.deptGroup ?? 'Other' };
};

export const project = (ds: Dataset, id: number) =>
  id ? { id, name: ds.projects.get(id)?.name ?? `Group ${id}` } : null;

/** Adds `person` to rows keyed by a user `id`. */
export const withPeople = <R extends { id: number }>(ds: Dataset, rows: R[]) =>
  rows.map((r) => ({ ...r, person: person(ds, r.id) }));

/**
 * Names rows keyed by assignee or project (the cards' Assignee / Project switch). Every row
 * gets `name`; assignee rows keep `person` for the department group.
 */
export const withGroupNames = <R extends { id: number }>(ds: Dataset, rows: R[], by: GroupBy) =>
  rows.map((r) =>
    by === 'project'
      ? { ...r, name: project(ds, r.id)?.name ?? 'No project', person: null }
      : { ...r, name: person(ds, r.id).name, person: person(ds, r.id) },
  );

const PRIORITY = ['low', 'normal', 'high'] as const;

export const taskUrl = (ds: Dataset, t: MetricTask) =>
  t.groupId
    ? `${ds.portalOrigin}/workgroups/group/${t.groupId}/tasks/task/view/${t.id}/`
    : `${ds.portalOrigin}/company/personal/user/${t.responsibleId}/tasks/task/view/${t.id}/`;

/** One table row (DEV-06..08, QA-08, QA-09). */
export function taskRow(ds: Dataset, ctx: MetricContext, t: MetricTask) {
  const group = stageGroup(t);
  const linkedTaskId =
    t.parentId ?? t.relatedIds.find((id) => ds.byId.get(id) && !ds.byId.get(id)!.isIssue) ?? null;
  return {
    id: t.id,
    title: t.title,
    url: taskUrl(ds, t),
    project: project(ds, t.groupId),
    assignee: person(ds, t.responsibleId),
    creator: person(ds, t.createdBy),
    stage: t.stage,
    stageTitle: t.stageTitle,
    stageColor: t.stage ? STAGE_COLORS[t.stage] : null,
    stageGroup: group,
    tags: t.tags,
    priority: PRIORITY[t.priority] ?? 'normal',
    deadline: t.deadline,
    createdAt: t.createdAt,
    closedAt: t.closedAt,
    /** Days past deadline for pending tasks (negative = not yet due). */
    ageingDays: isPending(t) ? ageingDays(t, ctx) : null,
    overdue: isOverdue(t, ctx),
    isIssue: t.isIssue,
    issueType: t.issueType,
    ...(t.isIssue && {
      ageDays: isOpenIssue(t) ? issueAgeDays(t, ctx) : null,
      rework: reworkCount(t, ds.byId),
      linkedTaskId,
    }),
  };
}
