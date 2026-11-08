// The Development tab's Tasks in hand planner: its endpoint, filters and task lists, shared by the
// Tasks in hand tile and the planner preview card.
import type { InHandCalendarSource } from '../../components/InHandCalendar';
import { useFilterSummary } from '../filters/useFilters';
import { useDevParams } from './api';
import { useDrillTo } from './drill';

export function useDevPlannerSource(): InHandCalendarSource {
  const drill = useDrillTo();
  const params = useDevParams();
  const showing = useFilterSummary('dev');
  return {
    path: '/api/dev/inhand/calendar',
    params,
    showing: showing ?? undefined,
    onOpen: (label, p, overdue) =>
      drill({ label, preset: overdue ? 'overdue' : 'pending', params: p, back: 'planner' }),
  };
}
