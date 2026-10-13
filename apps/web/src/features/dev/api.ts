// Development tab queries (SRS 7 module 5). All take the filter bar's params.
import { useMemo } from 'react';
import { useApi, withGroupBy } from '../../api/queries';
import type {
  DevAssignees,
  DevMatrix,
  DevProjects,
  DevRanking,
  DevSummary,
  GroupBy,
} from '../../api/types';
import { toParams } from '../filters/toParams';
import { useDevScope, useFilters } from '../filters/useFilters';

/** Filter bar params plus the All / Dev / Issues switch, sent on every Development request. */
export function useDevParams() {
  const { filters } = useFilters();
  const [scope] = useDevScope();
  return useMemo(() => ({ ...toParams('dev', filters), scope }), [filters, scope]);
}

export const useDevSummary = () => useApi<DevSummary>('/api/dev/summary', useDevParams());

export function useDevAssignees(by: GroupBy = 'assignee') {
  const params = useDevParams();
  return useApi<DevAssignees>('/api/dev/assignees', withGroupBy(params, by));
}
export const useDevProjects = () => useApi<DevProjects>('/api/dev/projects', useDevParams());
export const useDevRanking = () => useApi<DevRanking>('/api/dev/ranking', useDevParams());

export function useDevMatrix(splitTag: string | null, by: GroupBy = 'assignee') {
  const params = withGroupBy(useDevParams(), by);
  return useApi<DevMatrix>('/api/dev/matrix', splitTag ? { ...params, splitTag } : params);
}
