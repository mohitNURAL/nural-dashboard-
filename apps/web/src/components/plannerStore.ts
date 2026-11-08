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

/** What the planner opens on, from the dashboard's planner preview: a task's log or a row's overdue. */
export type PlannerFocus =
  { type: 'task'; id: number } | { type: 'overdue'; row: number; name: string };

interface State {
  open: boolean;
  /** Who opened it, and so draws it: the Tasks in hand tile or the planner preview card. */
  from: 'tile' | 'preview';
  focus: PlannerFocus | null;
  show: (focus?: PlannerFocus, from?: 'tile' | 'preview') => void;
  close: () => void;
  /** The dialog has opened on the focus. */
  clearFocus: () => void;
}

export const usePlanner = create<State>((set, get) => ({
  open: false,
  from: 'tile',
  focus: null,
  show: (focus, from = 'tile') => set({ open: true, focus: focus ?? null, from }),
  close: () => set({ open: false, focus: null }),
  clearFocus: () => {
    if (get().focus) set({ focus: null });
  },
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
  /** Day view: Short (one line a task) or Full (each task with its details), 2026-11-08. */
  pd: parseAsStringLiteral(['short', 'full'] as const).withDefault('short'),
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
    density: s.pd,
    /** A new view opens on its default period. */
    setView: (v: (typeof PLANNER_VIEWS)[number]) => void set({ pv: v, ps: null }),
    setStart: (start: string | null) => void set({ ps: start }),
    setBy: (by: 'assignee' | 'project') => void set({ pg: by }),
    setAssignees: (ids: number[]) => void set({ pa: ids.length ? ids : null }),
    setProjects: (ids: number[]) => void set({ pp: ids.length ? ids : null }),
    setQ: (q: string) => void set({ pq: q || null }),
    setDensity: (d: 'short' | 'full') => void set({ pd: d === 'short' ? null : d }),
    /** Opens a given week of the Day view (the dashboard's planner preview). */
    openWeek: (start: string | null, by: 'assignee' | 'project') =>
      void set({ pv: 'day', ps: start, pg: by }),
  };
}
