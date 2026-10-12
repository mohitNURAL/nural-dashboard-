// Task lists (tiles, accordions) and the task drawer, shared by both tabs.
import { parseAsInteger, useQueryState } from 'nuqs';
import { useApi } from '../../api/queries';
import type { TaskDetail, TaskPage } from '../../api/types';

export type TaskListKind = 'tasks' | 'issues' | 'testing' | 'kpi' | 'all';
export type TaskSort = 'deadline' | '-deadline' | 'created' | '-created' | 'id' | '-id';

export interface TaskListQuery {
  kind?: TaskListKind;
  preset: string;
  q?: string;
  sort?: TaskSort;
  page?: number;
  pageSize?: number;
  /** Column filters: values picked per column (project, assignee, stage, …). */
  columns?: ColumnFilters;
}

/** The task-list column filters (2026-10-12): picked from each column's list of values. */
export const COLUMN_FILTERS = [
  ['project', 'Project'],
  ['assignee', 'Assignee'],
  ['creator', 'Creator'],
  ['stage', 'Stage'],
  ['status', 'Status'],
  ['priority', 'Priority'],
  ['tag', 'Tags'],
  ['type', 'Type'],
] as const;
export type ColumnFilterKey = (typeof COLUMN_FILTERS)[number][0];
export type ColumnFilters = Partial<Record<ColumnFilterKey, string[]>>;

/** fProject=1,2 … for the API. */
export function columnParams(c: ColumnFilters = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(c))
    if (v?.length) out[`f${k[0]!.toUpperCase()}${k.slice(1)}`] = v.join(',');
  return out;
}

/** The same params as the list (all pages), for GET /api/tasks/export. */
export function taskExportUrl(
  filterParams: Record<string, string>,
  { kind = 'tasks', preset, q, sort, columns }: TaskListQuery,
  name: string,
  /** The reader's columns and row order (table/useTableLayout.ts): the file follows them. */
  layout: { cols?: string[]; hidden?: string[]; order?: string[] } = {},
): string {
  const params: Record<string, string> = {
    ...filterParams,
    ...columnParams(columns),
    kind,
    preset,
    name,
  };
  if (q) params.q = q;
  if (sort) params.sort = sort;
  if (layout.cols?.length) params.cols = layout.cols.join(',');
  if (layout.hidden?.length) params.hidden = layout.hidden.join(',');
  if (layout.order?.length) params.order = layout.order.slice(0, 1000).join(',');
  return `/api/tasks/export?${new URLSearchParams(params).toString()}`;
}

export function useTaskList(
  filterParams: Record<string, string>,
  { kind = 'tasks', preset, q, sort, page = 1, pageSize = 50, columns }: TaskListQuery,
  enabled = true,
) {
  const params: Record<string, string> = {
    ...filterParams,
    ...columnParams(columns),
    facets: 'true',
    kind,
    preset,
    page: String(page),
    pageSize: String(pageSize),
  };
  if (q) params.q = q;
  if (sort) params.sort = sort;
  return useApi<TaskPage>('/api/tasks', params, { enabled });
}

export const useTask = (id: number | null) =>
  useApi<TaskDetail>(`/api/tasks/${id ?? 0}`, {}, { enabled: id !== null });

/** The task open in the drawer lives in the URL (`?task=41580`) so it can be linked. */
export const useOpenTask = () => useQueryState('task', parseAsInteger);
