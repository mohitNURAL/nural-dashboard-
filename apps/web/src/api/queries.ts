// TanStack Query setup. Every API query key starts with 'api' so a live update can
// invalidate them all in one call (useLiveUpdates).
import type { IssueType } from '@nural/shared';
import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';
import { toParams, type FilterState, type Tab } from '../features/filters/toParams';
import { apiGet } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export const API_KEY = 'api';

/** GET path with params; the previous result stays on screen while a new filter loads. */
export function useApi<T>(path: string, params: Record<string, string>) {
  return useQuery({
    queryKey: [API_KEY, path, params],
    queryFn: ({ signal }) => apiGet<T>(path, params, signal),
    placeholderData: keepPreviousData,
  });
}

export type DeptGroup = 'Development' | 'Testing' | 'Other';

/** GET /api/filters/options (apps/api/src/routes/filters.ts). */
export interface FilterOptionsResponse {
  projects: { id: number; name: string; count: number }[];
  assignees: { id: number; name: string; deptGroup: DeptGroup; count: number }[];
  tags: { value: string; count: number }[];
  issueTypes: { value: IssueType; count: number }[];
}

export const useFilterOptions = (tab: Tab, f: FilterState) =>
  useApi<FilterOptionsResponse>('/api/filters/options', { tab, ...toParams(tab, f) });
