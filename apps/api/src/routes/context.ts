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
  taskStatus,
  type GroupBy,
  type MetricContext,
  type MetricTask,
  type StageTitle,
} from '@nural/shared';
import type { Dataset, DeptGroup } from '../data/dataset';
import { statusOf } from './actions';

export interface AppOptions {
  tz: string;
  /** Overridable for tests. */
  now?: () => Date;
}

export const contextOf = (ds: Dataset, opts: AppOptions): MetricContext => ({
  now: opts.now?.() ?? new Date(),
  tz: opts.tz,
  testers: ds.testers,
  developers: ds.developers,
  qaLead: ds.qaLead,
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

export interface BoardFilter {
  responsibleId?: number;
  createdBy?: number;
  /** One stage, or several (e.g. every pending stage for an overdue alert). */
  stages?: readonly StageTitle[];
  /** Bitrix24's own "Overdue" status (deadline passed, not completed). */
  overdue?: boolean;
}

/** Bitrix24 task status filter value for "Overdue". */
const BITRIX_OVERDUE_STATUS = '-1';

/**
 * A workgroup's task board in Bitrix24, opened with its filter set (`apply_filter=Y`), where
 * alerts are acted on. A dashboard stage can cover several Bitrix24 columns, so stage IDs go
 * as a list; "To do" also includes 0, Bitrix24's stage for tasks never moved on the board.
 */
export function boardUrl(ds: Dataset, groupId: number, f: BoardFilter = {}): string | null {
  if (!groupId) return null;
  const q = new URLSearchParams({ apply_filter: 'Y' });
  if (f.responsibleId) q.append('RESPONSIBLE_ID', String(f.responsibleId));
  if (f.createdBy) q.append('CREATED_BY', String(f.createdBy));
  if (f.overdue) q.append('STATUS[]', BITRIX_OVERDUE_STATUS);
  for (const stage of f.stages ?? []) {
    const ids = ds.stageIds?.get(groupId)?.get(stage) ?? [];
    for (const id of stage === 'To do' ? [0, ...ids] : ids) q.append('STAGE_ID[]', String(id));
  }
  return `${ds.portalOrigin}/workgroups/group/${groupId}/tasks/?${q.toString().replaceAll('%5B%5D', '[]')}`;
}

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
    /** Completed (QA Backlog, In QA, Done, LIVE) or pending (any stage behind), SRS 5. */
    status: taskStatus(t),
    /** Its Bitrix24 column ID (task actions: the stage dropdown); 0 = never moved, To do. */
    stageId: Number(t.stageId ?? 0),
    /** Bitrix24's own task status (task actions: the status dropdown). */
    bitrixStatus: statusOf(t.status),
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
      rework: reworkCount(t),
      linkedTaskId,
    }),
  };
}
