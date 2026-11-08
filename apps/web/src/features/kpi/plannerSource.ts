// The KPI tab's Tasks in hand planner: its endpoint, filters and task lists, shared by the Tasks in
// hand tile and the planner preview card.
import type { InHandCalendarSource } from '../../components/InHandCalendar';
import { useFilterSummary } from '../filters/useFilters';
import { useKpiParams } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';

export function useKpiPlannerSource(): InHandCalendarSource {
  const open = useOpenKpiList();
  const params = useKpiParams();
  const showing = useFilterSummary('kpi');
  return {
    path: '/api/kpi/inhand/calendar',
    params,
    showing: showing ?? undefined,
    onOpen: (label, p, overdue) =>
      open({
        label,
        params: { kpi: overdue ? 'overdue' : 'open', ...p },
        info: overdue ? KPI_INFO.overdue : KPI_INFO.inHand,
        back: 'planner',
      }),
  };
}
