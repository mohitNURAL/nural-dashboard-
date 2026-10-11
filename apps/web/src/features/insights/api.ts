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

/** One project or person behind an Insights tile: why it is there, its numbers, its tasks. */
export interface Entity {
  id: number;
  name: string;
  /** Why it counts, in words: "5 of 11 open overdue; 0 % on time". */
  reason: string;
  /** Its numbers, shown as chips: e.g. [["Open", 11], ["Overdue", 5]]. */
  stats: [string, number][];
  ids: number[];
}

/** What a tile opens first: the projects or people it counts (2026-10-12). */
export interface EntityList {
  label: string;
  kind: 'project' | 'person';
  rows: Entity[];
  /** The tile's number, when more than the rows listed. */
  total: number;
}

/**
 * What the page's list shows: the tasks behind a clicked finding, or for a tile the projects or
 * people it counts (a row then opens that one's tasks, with a way back to the list).
 */
export const useInsightList = create<{
  label: string | null;
  ids: number[];
  entities: EntityList | null;
  /** Set while one row of an entity list is open: the list to go back to. */
  back: EntityList | null;
  reveal: number;
  open: (label: string, ids: number[]) => void;
  openEntities: (list: EntityList) => void;
  openEntity: (e: Entity) => void;
  goBack: () => void;
  clear: () => void;
}>((set) => ({
  label: null,
  ids: [],
  entities: null,
  back: null,
  reveal: 0,
  open: (label, ids) =>
    set((s) => ({
      label,
      ids: [...new Set(ids)].slice(0, 3000),
      entities: null,
      back: null,
      reveal: s.reveal + 1,
    })),
  openEntities: (entities) =>
    set((s) => ({ label: entities.label, ids: [], entities, back: null, reveal: s.reveal + 1 })),
  openEntity: (e) =>
    set((s) => ({
      label: `${s.entities?.label ?? ''} · ${e.name}`,
      ids: [...new Set(e.ids)].slice(0, 3000),
      back: s.entities,
      entities: null,
    })),
  goBack: () =>
    set((s) => (s.back ? { label: s.back.label, ids: [], entities: s.back, back: null } : s)),
  clear: () => set({ label: null, ids: [], entities: null, back: null }),
}));
