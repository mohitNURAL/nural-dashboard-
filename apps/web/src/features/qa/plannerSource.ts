// The QA tab's Tasks in hand planner (the testing team's tasks): its endpoint, filters and task
// lists, shared by the Tasks in hand tile and the planner preview card.
import type { InHandCalendarSource } from '../../components/InHandCalendar';
import { useFilterSummary } from '../filters/useFilters';
import { useQaParams } from './api';
import { useOpenIssues } from './issueList';

export function useQaPlannerSource(): InHandCalendarSource {
  const openList = useOpenIssues();
  const params = useQaParams();
  const showing = useFilterSummary('qa');
  return {
    path: '/api/qa/inhand/calendar',
    params,
    showing: showing ?? undefined,
    onOpen: (label, p, overdue) =>
      openList({
        kind: 'testing',
        preset: overdue ? 'overdue' : 'pending',
        label,
        params: p,
        back: 'planner',
      }),
  };
}
