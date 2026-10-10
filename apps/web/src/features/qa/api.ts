// QA tab queries (SRS 7 module 5). All take the filter bar's params.
import { useMemo } from 'react';
import { useApi } from '../../api/queries';
import type { QaIssues, QaSummary, QaTesting } from '../../api/types';
import { toParams } from '../filters/toParams';
import { useFilters } from '../filters/useFilters';

export function useQaParams() {
  const { filters } = useFilters();
  return useMemo(() => toParams('qa', filters), [filters]);
}

export const useQaSummary = () => useApi<QaSummary>('/api/qa/summary', useQaParams());
export const useQaIssues = () => useApi<QaIssues>('/api/qa/issues', useQaParams());

/** Testing work is not bug or feedback, so the Bug or Feedback filter does not apply (QA-06). */
export function useQaTesting() {
  const params = useQaParams();
  const rest = useMemo(
    () => Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'type')),
    [params],
  );
  return useApi<QaTesting>('/api/qa/testing', rest);
}
