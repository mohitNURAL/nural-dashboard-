// Task lists (tiles, accordions) and the task drawer, shared by both tabs.
import { parseAsInteger, useQueryState } from 'nuqs';
import { useApi } from '../../api/queries';
import type { TaskDetail, TaskPage } from '../../api/types';

export type TaskListKind = 'tasks' | 'issues' | 'testing';
export type TaskSort = 'deadline' | '-deadline' | 'created' | '-created' | 'id' | '-id';

export interface TaskListQuery {
  kind?: TaskListKind;
  preset: string;
  q?: string;
  sort?: TaskSort;
  page?: number;
  pageSize?: number;
}

export function useTaskList(
  filterParams: Record<string, string>,
  { kind = 'tasks', preset, q, sort, page = 1, pageSize = 50 }: TaskListQuery,
  enabled = true,
) {
  const params: Record<string, string> = {
    ...filterParams,
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
