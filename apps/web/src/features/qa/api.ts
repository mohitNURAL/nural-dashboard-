// QA tab queries (SRS 7 module 5). All take the filter bar's params.
import { useMemo } from 'react';
import { useApi, withGroupBy } from '../../api/queries';
import type { GroupBy, QaIssues, QaSummary, QaTesting } from '../../api/types';
import { toParams } from '../filters/toParams';
import { useFilters } from '../filters/useFilters';

export function useQaParams() {
  const { filters } = useFilters();
  return useMemo(() => toParams('qa', filters), [filters]);
}

export const useQaSummary = () => useApi<QaSummary>('/api/qa/summary', useQaParams());
export function useQaIssues(by: GroupBy = 'assignee') {
  return useApi<QaIssues>('/api/qa/issues', withGroupBy(useQaParams(), by));
}

/** Testing work is not bug or feedback, so the Bug or Feedback filter does not apply (QA-06). */
export function useQaTesting() {
  const params = useQaParams();
  const rest = useMemo(
    () => Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'type')),
    [params],
  );
  return useApi<QaTesting>('/api/qa/testing', rest);
}
