// The Tasks in hand planner (2026-10-20): open or closed, and how it was left (view, grouping,
// search), so "Back to planner" on a task list reopens it exactly as it was.
import { create } from 'zustand';
import type { GroupBy, InHandCalendar } from '../api/types';

type View = InHandCalendar['view'];

interface State {
  open: boolean;
  view: View;
  by: GroupBy;
  q: string;
  show: () => void;
  close: () => void;
  setView: (v: View) => void;
  setBy: (b: GroupBy) => void;
  setQ: (q: string) => void;
}

export const usePlanner = create<State>((set) => ({
  open: false,
  view: 'week',
  by: 'assignee',
  q: '',
  show: () => set({ open: true }),
  close: () => set({ open: false }),
  setView: (view) => set({ view }),
  setBy: (by) => set({ by }),
  setQ: (q) => set({ q }),
}));
