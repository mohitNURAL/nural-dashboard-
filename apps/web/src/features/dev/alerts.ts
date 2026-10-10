// Header alerts (GET /api/alerts): overdue groups and "over N days in a stage" groups. Shared by
// the bell badge and the Alert details accordion on the Development tab.
import type { DevPreset } from '@nural/shared';
import { useCallback } from 'react';
import { useApi } from '../../api/queries';
import type { AlertsResponse } from '../../api/types';
import { EMPTY_FILTERS } from '../filters/toParams';
import { useDevScope, useFilters } from '../filters/useFilters';
import { filterKey, useDrill } from './drill';

export const useAlerts = () => useApi<AlertsResponse>('/api/alerts', {});

export type OverdueLine = AlertsResponse['overdue'][number];
export type StuckLine = AlertsResponse['stuck'][number];

export const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** What to open for an alert, or a group of them (e.g. every overdue task of one project). */
export interface AlertTarget {
  label: string;
  preset: DevPreset;
  params: Record<string, string>;
  /** Filter bar after the jump: the project and, when the alert names the assignee, them. */
  projectId: number | null;
  assigneeId: number | null;
}

export const overdueTarget = (a: OverdueLine): AlertTarget => ({
  label: `${a.person.name} · ${a.project?.name ?? 'No project'} · overdue`,
  preset: 'overdue',
  params: { scope: 'all', assignee: String(a.personId), project: String(a.projectId) },
  projectId: a.projectId,
  assigneeId: a.personId,
});

export const stuckTarget = (a: StuckLine, stuckDays: number): AlertTarget => ({
  label: `${a.person.name} · ${a.project?.name ?? 'No project'} · ${a.stage} over ${days(stuckDays)}`,
  preset: 'total',
  params: {
    scope: 'all',
    owner: String(a.personId),
    project: String(a.projectId),
    stage: a.stage,
    stuck: 'true',
  },
  projectId: a.projectId,
  // A tester or the QA lead is not the assignee, so only the project goes in the filter bar.
  assigneeId: a.role === 'assignee' ? a.personId : null,
});

/**
 * Opens an alert: the filter bar is set to its project (and assignee), the switch to All, and
 * "All tasks" opens with exactly the alert's tasks. Alerts ignore the filter bar, so the list
 * does too.
 */
export function useOpenAlert() {
  const { setFilters } = useFilters();
  const [, setScope] = useDevScope();
  const drill = useDrill();
  return useCallback(
    (t: AlertTarget) => {
      const next = {
        ...EMPTY_FILTERS,
        project: t.projectId ? [t.projectId] : [],
        assignee: t.assigneeId ? [t.assigneeId] : [],
      };
      setScope('all');
      setFilters(next);
      drill({
        label: t.label,
        preset: t.preset,
        params: t.params,
        replaceFilters: true,
        filterKey: filterKey(next, 'all'),
      });
    },
    [setFilters, setScope, drill],
  );
}
