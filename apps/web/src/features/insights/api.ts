// Insights data (apps/api/src/routes/insights.ts) and the task list it opens.
import { create } from 'zustand';
import { useApi } from '../../api/queries';

export interface ProjectLag {
  id: number;
  name: string;
  owner: string | null;
  open: number;
  overdue: number;
  overdueShare: number;
  closedNow: number;
  closedPrev: number;
  idleDays: number | null;
  lagging: boolean;
  reasons: string[];
  score: number;
  overdueIds: number[];
  openIds: number[];
}

export interface PersonLag {
  id: number;
  name: string;
  open: number;
  overdue: number;
  closedNow: number;
  closedPrev: number;
  onTime: number | null;
  lagging: boolean;
  reasons: string[];
  overdueIds: number[];
  closedIds: number[];
}

export interface PersonLoad {
  id: number;
  name: string;
  open: number;
  overdue: number;
  dueSoon: number;
  closedNow: number;
  projects: number;
  level: 'over' | 'under' | 'ok';
  reason: string | null;
  openIds: number[];
  dueSoonIds: number[];
}

export interface Shared {
  id: number;
  name: string;
  projects: { id: number; name: string; open: number; overdue: number; activity: number }[];
}

export interface Pull {
  pulling: number;
  suffering: number;
  pullingName: string;
  sufferingName: string;
  people: number[];
  peopleNames: string[];
  overdueIds: number[];
}

export interface Release {
  id: number;
  title: string;
  project: string;
  assignee: string;
  deadline: string;
  stage: string | null;
  week: 'this' | 'next';
  risk: 'high' | 'medium' | 'low';
  reason: string;
}

export interface KeyPoint {
  kind: 'project' | 'person' | 'overload' | 'underload' | 'pull' | 'release';
  weight: number;
  subject: number;
  text: string;
  taskIds: number[];
}

export type TileKey =
  'laggingProjects' | 'laggingPeople' | 'overloaded' | 'underloaded' | 'shared' | 'atRisk';

export interface Insights {
  window: number;
  viewScope: 'all' | 'own';
  tiles: Record<TileKey, number>;
  ids: Record<Exclude<TileKey, 'shared'>, number[]>;
  keyPoints: KeyPoint[];
  projects: ProjectLag[];
  people: PersonLag[];
  load: PersonLoad[];
  overlap: { shared: Shared[]; pulls: Pull[] };
  releases: Release[];
  absences: null | unknown;
}

export const useInsights = (window: number) =>
  useApi<Insights>('/api/insights', window === 14 ? {} : { window: String(window) });

/** The tasks behind a clicked finding, shown in the page's task list. */
export const useInsightList = create<{
  label: string | null;
  ids: number[];
  reveal: number;
  open: (label: string, ids: number[]) => void;
  clear: () => void;
}>((set) => ({
  label: null,
  ids: [],
  reveal: 0,
  open: (label, ids) =>
    set((s) => ({ label, ids: [...new Set(ids)].slice(0, 3000), reveal: s.reveal + 1 })),
  clear: () => set({ label: null, ids: [] }),
}));
