// Drill-down: a clicked count opens "All tasks" narrowed to exactly that count and titled with it
// (DEV-01..05, header alerts). Kept in a store so the header can open it from either tab; the
// Development tab opens and scrolls to the list when `reveal` is set.
import type { DevPreset, GroupBy } from '@nural/shared';
import { create } from 'zustand';

export interface Drill {
  /** Accordion title suffix, e.g. "Neha Gautam · Pending". */
  label: string;
  preset: DevPreset;
  /** Extra /api/tasks params that override the filter bar (assignee, project, stage, ...). */
  params?: Record<string, string>;
  /** Ignore the filter bar entirely (header alerts are computed without it). */
  replaceFilters?: boolean;
}

interface DrillState {
  drill: Drill | null;
  /** Set by open(); the Development tab clears it after opening the list. */
  reveal: boolean;
  open: (d: Drill) => void;
  clear: () => void;
  revealed: () => void;
}

export const useDrillStore = create<DrillState>((set) => ({
  drill: null,
  reveal: false,
  open: (drill) => set({ drill, reveal: true }),
  clear: () => set({ drill: null }),
  revealed: () => set({ reveal: false }),
}));

export const useDrill = () => useDrillStore((s) => s.open);

/** Narrow a list to one breakdown row (an assignee or a project). */
export const rowParams = (by: GroupBy, id: number): Record<string, string> =>
  by === 'project' ? { project: String(id) } : { assignee: String(id) };
