// Which projects KPI Project health lists (2026-10-12): the Active projects tile and its parts
// (Recent action, Silent, Others) set it.
import { create } from 'zustand';
import type { ProjectActivity } from '../../api/types';

export type ProjectShow = 'all' | 'active' | ProjectActivity;
export const useProjectShow = create<{ show: ProjectShow; set: (s: ProjectShow) => void }>(
  (set) => ({ show: 'all', set: (show) => set({ show }) }),
);
export const ACTIVITY_LABEL: Record<ProjectActivity, string> = {
  recent: 'Recent action',
  silent: 'Silent',
  other: 'Others',
};
