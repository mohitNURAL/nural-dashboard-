// The QA Open / pending popup (2026-10-21): open or closed.
import { create } from 'zustand';

export const useOpenPopup = create<{ open: boolean; show: () => void; close: () => void }>(
  (set) => ({ open: false, show: () => set({ open: true }), close: () => set({ open: false }) }),
);
