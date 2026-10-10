// Development tab queries (SRS 7 module 5). All take the filter bar's params.
import { useMemo } from 'react';
import { useApi } from '../../api/queries';
import type { DevAssignees, DevMatrix, DevRanking, DevSummary } from '../../api/types';
import { toParams } from '../filters/toParams';
import { useFilters } from '../filters/useFilters';

export function useDevParams() {
  const { filters } = useFilters();
  return useMemo(() => toParams('dev', filters), [filters]);
}

export const useDevSummary = () => useApi<DevSummary>('/api/dev/summary', useDevParams());
export const useDevAssignees = () => useApi<DevAssignees>('/api/dev/assignees', useDevParams());
export const useDevRanking = () => useApi<DevRanking>('/api/dev/ranking', useDevParams());

export function useDevMatrix(splitTag: string | null) {
  const params = useDevParams();
  return useApi<DevMatrix>('/api/dev/matrix', splitTag ? { ...params, splitTag } : params);
}
