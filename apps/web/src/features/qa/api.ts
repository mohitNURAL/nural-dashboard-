// QA tab queries (SRS 7 module 5). All take the filter bar's params.
import { useMemo } from 'react';
import { useApi, withGroupBy } from '../../api/queries';
import type { GroupBy, QaIssues, QaRetest, QaSummary, QaTesting } from '../../api/types';
import { toParams } from '../filters/toParams';
import { useFilters } from '../filters/useFilters';

export function useQaParams() {
  const { filters } = useFilters();
  return useMemo(() => toParams('qa', filters), [filters]);
}

export const useQaSummary = () => useApi<QaSummary>('/api/qa/summary', useQaParams());
/** `type` narrows one card to bugs or feedback, over the filter bar's choice. */
export function useQaIssues(by: GroupBy = 'assignee', type: 'bug' | 'feedback' | null = null) {
  const params = withGroupBy(useQaParams(), by);
  return useApi<QaIssues>('/api/qa/issues', type ? { ...params, type } : params);
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

/** Retesting awaited: every task in QA Backlog or In QA, per assignee or project. */
export const useQaRetest = (by: GroupBy = 'assignee') =>
  useApi<QaRetest>('/api/qa/retest', withGroupBy(useQaParams(), by));
