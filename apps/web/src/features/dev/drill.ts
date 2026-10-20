// Drill-down: a clicked count opens "All tasks" narrowed to exactly that count and titled with it
// (DEV-01..05, header alerts). Kept in a store so the header can open it from either tab; the
// Development tab opens and scrolls to the list when `reveal` is set.
import type { DevPreset, GroupBy } from '@nural/shared';
import { useCallback } from 'react';
import { create } from 'zustand';
import { toParams, type FilterState } from '../filters/toParams';
import { useDevScope, useFilters } from '../filters/useFilters';

export interface Drill {
  /** Accordion title suffix, e.g. "Neha Gautam · Pending". */
  label: string;
  preset: DevPreset;
  /** Extra /api/tasks params that override the filter bar (assignee, project, stage, ...). */
  params?: Record<string, string>;
  /** Ignore the filter bar entirely (header alerts are computed without it). */
  replaceFilters?: boolean;
  /**
   * The filter bar this drill belongs to (filterKey). When the filters change to anything else
   * (cleared, reset, another pick), the Development tab drops the drill back to "All tasks".
   */
  filterKey?: string;
  /** Opened from a popup: the list shows "Back to Projects at work" or "Back to planner". */
  back?: 'projects' | 'planner';
}

/** Identity of the Development filter state, including the All / Dev / Issues switch. */
export const filterKey = (f: FilterState, scope: string) =>
  JSON.stringify({ ...toParams('dev', f), scope });

interface DrillState {
  drill: Drill | null;
  /** Set by open(); the Development tab clears it after opening the list. */
  reveal: boolean;
  open: (d: Drill) => void;
  clear: () => void;
  revealed: () => void;
  /** Set by the header bell; the Development tab opens and scrolls to Alert details. */
  showAlerts: boolean;
  openAlerts: () => void;
  alertsShown: () => void;
}

export const useDrillStore = create<DrillState>((set) => ({
  drill: null,
  reveal: false,
  open: (drill) => set({ drill, reveal: true }),
  clear: () => set({ drill: null }),
  revealed: () => set({ reveal: false }),
  showAlerts: false,
  openAlerts: () => set({ showAlerts: true }),
  alertsShown: () => set({ showAlerts: false }),
}));

export const useDrill = () => useDrillStore((s) => s.open);

/** Narrow a list to one breakdown row (an assignee or a project). */
export const rowParams = (by: GroupBy, id: number): Record<string, string> =>
  by === 'project' ? { project: String(id) } : { assignee: String(id) };

/**
 * Opens a drill-down and, for a clicked row (an assignee or a project), also sets that filter,
 * so the whole tab follows the click. The drill remembers the resulting filter state.
 */
export function useDrillTo() {
  const { filters, setFilters } = useFilters();
  const [scope] = useDevScope();
  const open = useDrill();
  return useCallback(
    (d: Drill, focus?: { by: GroupBy; id: number }) => {
      let next = filters;
      if (focus?.id) {
        next = { ...filters, [focus.by]: [focus.id] };
        setFilters({ [focus.by]: [focus.id] });
      }
      open({ ...d, filterKey: filterKey(next, scope) });
    },
    [filters, scope, setFilters, open],
  );
}
