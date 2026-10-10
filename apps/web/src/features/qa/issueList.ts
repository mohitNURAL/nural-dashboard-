// What the QA tab's "All issues" accordion shows: a tile's preset, optionally narrowed (e.g. to
// Bug, or to one developer's issues in a stage) and relabelled. A store, so any card can open it.
import type { DevPreset, GroupBy, IssuePreset } from '@nural/shared';
import { useCallback } from 'react';
import { create } from 'zustand';
import { toParams, type FilterState } from '../filters/toParams';
import { useFilters } from '../filters/useFilters';

export interface IssueList {
  /** Issues (default), the testers' own testing tasks (QA-06), or every task (Retesting awaited). */
  kind?: 'issues' | 'testing' | 'all';
  preset: IssuePreset | DevPreset;
  label?: string;
  params?: Record<string, string>;
  /** Filter state this list belongs to; any other filter change resets "All issues". */
  filterKey?: string;
}

interface IssueListState {
  list: IssueList;
  /** Set by open(); the QA tab opens and scrolls to "All issues", then clears it. */
  reveal: boolean;
  open: (l: IssueList) => void;
  reset: () => void;
  revealed: () => void;
}

export const useIssueList = create<IssueListState>((set) => ({
  list: { preset: 'all' },
  reveal: false,
  open: (list) => set({ list, reveal: true }),
  reset: () => set({ list: { preset: 'all' } }),
  revealed: () => set({ reveal: false }),
}));

export const qaFilterKey = (f: FilterState) => JSON.stringify(toParams('qa', f));

/**
 * Opens "All issues" for a clicked number; a number of one assignee or project also sets that
 * filter, so the whole tab follows the click.
 */
export function useOpenIssues() {
  const { filters, setFilters } = useFilters();
  const open = useIssueList((s) => s.open);
  return useCallback(
    (l: IssueList, focus?: { by: GroupBy; id: number }) => {
      let next = filters;
      if (focus?.id) {
        next = { ...filters, [focus.by]: [focus.id] };
        setFilters({ [focus.by]: [focus.id] });
      }
      open({ ...l, filterKey: qaFilterKey(next) });
    },
    [filters, setFilters, open],
  );
}
