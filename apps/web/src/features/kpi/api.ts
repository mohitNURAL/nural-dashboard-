// KPI tab queries (SRS 13.5). All take the filter bar's params plus Department and period.
import { useMemo } from 'react';
import { useApi } from '../../api/queries';
import type {
  KpiActivity,
  KpiInsights,
  KpiOverdue,
  KpiPerson,
  KpiProject,
  KpiSummary,
  KpiWorkload,
} from '../../api/types';
import { toParams } from '../filters/toParams';
import { useFilters, useKpiControls } from '../filters/useFilters';

export function useKpiParams() {
  const { filters } = useFilters();
  const { dept, period } = useKpiControls();
  return useMemo(() => {
    const p: Record<string, string> = { ...toParams('kpi', filters) };
    if (dept !== 'all') p.dept = dept;
    if (period !== 'week') p.period = period;
    return p;
  }, [filters, dept, period]);
}

export const useKpiSummary = () => useApi<KpiSummary>('/api/kpi/summary', useKpiParams());
export const useKpiProjects = () =>
  useApi<{ rows: KpiProject[] }>('/api/kpi/projects', useKpiParams());
export const useKpiPeople = () => useApi<{ rows: KpiPerson[] }>('/api/kpi/people', useKpiParams());
export const useKpiWorkload = () =>
  useApi<{ rows: KpiWorkload[] }>('/api/kpi/workload', useKpiParams());
export const useKpiOverdue = () => useApi<KpiOverdue>('/api/kpi/overdue', useKpiParams());
export const useKpiActivity = () => useApi<KpiActivity>('/api/kpi/activity', useKpiParams());
export const useKpiInsights = () => useApi<KpiInsights>('/api/kpi/insights', useKpiParams());
