// The QA Last filed popup (2026-10-16): open or closed.
import { create } from 'zustand';

export const useFiledPopup = create<{ open: boolean; show: () => void; close: () => void }>(
  (set) => ({ open: false, show: () => set({ open: true }), close: () => set({ open: false }) }),
);
