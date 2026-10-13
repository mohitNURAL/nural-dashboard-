// The Projects at work popup (2026-10-13): open or closed, which projects it shows (a tile part
// picks Active or Silent) and which project is expanded. Kept in a store so "Back to Projects at
// work" on a task list reopens it as it was.
import { create } from 'zustand';

export type ProjectShow = 'all' | 'active' | 'silent';

interface State {
  open: boolean;
  show: ProjectShow;
  /** The one expanded project (opening another closes it). */
  expanded: number | null;
  openPopup: (show: ProjectShow) => void;
  /** Reopens it as it was left (the Back button on a task list). */
  reopen: () => void;
  close: () => void;
  toggle: (id: number) => void;
}

export const useProjectsPopup = create<State>((set) => ({
  open: false,
  show: 'all',
  expanded: null,
  openPopup: (show) => set({ open: true, show, expanded: null }),
  reopen: () => set({ open: true }),
  close: () => set({ open: false }),
  toggle: (id) => set((s) => ({ expanded: s.expanded === id ? null : id })),
}));
