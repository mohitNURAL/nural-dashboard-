// What the KPI tab's "All tasks" accordion shows: the tasks behind a clicked number, labelled.
// A store, so any card can open it. A number of one project or person also sets that filter.
import { useCallback } from 'react';
import { create } from 'zustand';
import { toParams, type FilterState } from '../filters/toParams';
import { useFilters } from '../filters/useFilters';

export interface KpiList {
  label?: string;
  /** /api/tasks params, e.g. { kpi: 'overdue', kpiAgeing: '30+' }. */
  params?: Record<string, string>;
  /** "i" text: the rule behind the number. */
  info?: string;
  filterKey?: string;
  /** Opened from the Tasks in hand planner: the list shows "Back to planner". */
  back?: 'planner';
}

interface State {
  list: KpiList;
  reveal: boolean;
  open: (l: KpiList) => void;
  reset: () => void;
  revealed: () => void;
}

export const useKpiList = create<State>((set) => ({
  list: {},
  reveal: false,
  open: (list) => set({ list, reveal: true }),
  reset: () => set({ list: {} }),
  revealed: () => set({ reveal: false }),
}));

export const kpiFilterKey = (f: FilterState) => JSON.stringify(toParams('kpi', f));

export function useOpenKpiList() {
  const { filters, setFilters } = useFilters();
  const open = useKpiList((s) => s.open);
  return useCallback(
    (l: KpiList, focus?: { by: 'project' | 'assignee'; id: number }) => {
      let next = filters;
      if (focus?.id) {
        next = { ...filters, [focus.by]: [focus.id] };
        setFilters({ [focus.by]: [focus.id] });
      }
      open({ ...l, filterKey: kpiFilterKey(next) });
    },
    [filters, setFilters, open],
  );
}
