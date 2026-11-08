// The Tasks in hand planner: open or closed (here), and how it was left in the URL (nuqs, like the
// filters): view, period, grouping, the Assignee and Project picks and the search, so a reload or
// "Back to planner" on a task list reopens it exactly as it was (2026-11-08, SRS 25).
import { PLANNER_VIEWS } from '@nural/shared';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs';
import { create } from 'zustand';

interface State {
  open: boolean;
  show: () => void;
  close: () => void;
}

export const usePlanner = create<State>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));

// Prefixed names: `assignee`, `project`, `from` and `to` are the tab's own filters.
const plannerParsers = {
  pv: parseAsStringLiteral(PLANNER_VIEWS).withDefault('day'),
  /** First column's first day; none = the view's default around today. */
  ps: parseAsString,
  pg: parseAsStringLiteral(['assignee', 'project'] as const).withDefault('assignee'),
  pa: parseAsArrayOf(parseAsInteger).withDefault([]),
  pp: parseAsArrayOf(parseAsInteger).withDefault([]),
  pq: parseAsString.withDefault(''),
};

/** The planner's view state, kept in the URL. */
export function usePlannerState() {
  const [s, set] = useQueryStates(plannerParsers);
  return {
    view: s.pv,
    start: s.ps,
    by: s.pg,
    assignees: s.pa,
    projects: s.pp,
    q: s.pq,
    /** A new view opens on its default period. */
    setView: (v: (typeof PLANNER_VIEWS)[number]) => void set({ pv: v, ps: null }),
    setStart: (start: string | null) => void set({ ps: start }),
    setBy: (by: 'assignee' | 'project') => void set({ pg: by }),
    setAssignees: (ids: number[]) => void set({ pa: ids.length ? ids : null }),
    setProjects: (ids: number[]) => void set({ pp: ids.length ? ids : null }),
    setQ: (q: string) => void set({ pq: q || null }),
  };
}
