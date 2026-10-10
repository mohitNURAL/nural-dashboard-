// Drill-down: a clicked count opens "All tasks" narrowed to exactly that count and titled with it
// (DEV-01..05). Cards call useDrill(); DevTab provides the handler.
import type { DevPreset, GroupBy } from '@nural/shared';
import { createContext, useContext } from 'react';

export interface Drill {
  /** Accordion title suffix, e.g. "Neha Gautam · Pending". */
  label: string;
  preset: DevPreset;
  /** Extra /api/tasks params that override the filter bar (assignee, project, stage, ...). */
  params?: Record<string, string>;
}

export const DrillContext = createContext<(d: Drill) => void>(() => {});
export const useDrill = () => useContext(DrillContext);

/** Narrow a list to one breakdown row (an assignee or a project). */
export const rowParams = (by: GroupBy, id: number): Record<string, string> =>
  by === 'project' ? { project: String(id) } : { assignee: String(id) };
