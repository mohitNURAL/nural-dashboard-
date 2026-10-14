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
  type TaskStatus,
  hasRole,
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
export const STATUS_LABEL: Record<TaskStatus, string> = {
  completed: 'Completed',
  pending: 'Pending',
  hold: 'On hold',
  issueRaised: 'Issue raised',
};

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
    for (const id of hasRole(stage, 'start') ? [0, ...ids] : ids)
      q.append('STAGE_ID[]', String(id));
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

/**
 * Task-list column filters (2026-10-12): the search box finds ID and title; each column has its
 * own filter, picked from a list of the values in the list (type to narrow it), several at once.
 */
export const COLUMN_FILTERS = [
  'project',
  'assignee',
  'creator',
  'stage',
  'status',
  'priority',
  'tag',
  'type',
] as const;
export type ColumnFilter = (typeof COLUMN_FILTERS)[number];

/** A task's value(s) for one column filter. */
export function columnValues(
  ds: Dataset,
  ctx: MetricContext,
  t: MetricTask,
  f: ColumnFilter,
): { value: string; label: string }[] {
  const r = taskRow(ds, ctx, t);
  switch (f) {
    case 'project':
      return [{ value: String(t.groupId), label: r.project?.name ?? 'No project' }];
    case 'assignee':
      return [{ value: String(t.responsibleId), label: r.assignee.name }];
    case 'creator':
      return [{ value: String(t.createdBy), label: r.creator.name }];
    case 'stage':
      return [{ value: t.stage ?? '', label: t.stage ?? 'No stage' }];
    case 'status':
      return [
        {
          value: r.status,
          label: STATUS_LABEL[r.status],
        },
      ];
    case 'priority':
      return [{ value: r.priority, label: r.priority[0]!.toUpperCase() + r.priority.slice(1) }];
    case 'tag':
      return t.tags.length
        ? t.tags.map((g) => ({ value: g.toLowerCase(), label: g }))
        : [{ value: '', label: 'No tag' }];
    case 'type':
      return [
        {
          value: t.isIssue ? (t.issueType ?? 'issue') : 'task',
          label: t.isIssue
            ? t.issueType === 'bug'
              ? 'Bug'
              : t.issueType === 'feedback'
                ? 'Feedback'
                : 'Issue'
            : 'Task',
        },
      ];
  }
}

/** Keeps the tasks matching every chosen column filter (any of its values). */
export function applyColumnFilters(
  ds: Dataset,
  ctx: MetricContext,
  list: MetricTask[],
  chosen: Partial<Record<ColumnFilter, string[]>>,
): MetricTask[] {
  const active = COLUMN_FILTERS.filter((f) => chosen[f]?.length);
  if (!active.length) return list;
  return list.filter((t) =>
    active.every((f) => {
      const want = new Set(chosen[f]);
      return columnValues(ds, ctx, t, f).some((v) => want.has(v.value));
    }),
  );
}

/**
 * The options of each column filter, with counts: worked out from the list with the other
 * column filters applied, so each list offers what can still be picked.
 */
export function columnOptions(
  ds: Dataset,
  ctx: MetricContext,
  list: MetricTask[],
  chosen: Partial<Record<ColumnFilter, string[]>>,
) {
  const out = {} as Record<ColumnFilter, { value: string; label: string; count: number }[]>;
  for (const f of COLUMN_FILTERS) {
    const others = { ...chosen, [f]: [] };
    const counts = new Map<string, { value: string; label: string; count: number }>();
    for (const t of applyColumnFilters(ds, ctx, list, others))
      for (const v of columnValues(ds, ctx, t, f)) {
        const c = counts.get(v.value) ?? { ...v, count: 0 };
        c.count++;
        counts.set(v.value, c);
      }
    out[f] = [...counts.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
  }
  return out;
}
