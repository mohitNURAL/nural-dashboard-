// Which projects KPI Project health lists: the Projects tile and its parts set it. Since
// 2026-10-15 the same rule and words as the Development Projects tile: Active, Silent, Hold.
import { create } from 'zustand';
import type { ProjectWorkRow } from '../../api/types';

export type ProjectWork = ProjectWorkRow['status'];
export type ProjectShow = 'all' | ProjectWork;
export const useProjectShow = create<{ show: ProjectShow; set: (s: ProjectShow) => void }>(
  (set) => ({ show: 'all', set: (show) => set({ show }) }),
);
export const WORK_LABEL: Record<ProjectWork, string> = {
  active: 'Active',
  silent: 'Silent',
  hold: 'Hold',
};
