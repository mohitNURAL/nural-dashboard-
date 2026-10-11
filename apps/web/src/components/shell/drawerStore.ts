// Side drawer state: pinned (remembered in this browser) and open on small screens.
import { create } from 'zustand';

const KEY = 'nural.drawer.pinned';
const readPinned = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const RAIL = 64;
export const WIDE = 264;

export const useDrawer = create<{
  pinned: boolean;
  mobileOpen: boolean;
  setPinned: (p: boolean) => void;
  setMobileOpen: (o: boolean) => void;
}>((set) => ({
  pinned: readPinned(),
  mobileOpen: false,
  setPinned: (pinned) => {
    try {
      localStorage.setItem(KEY, pinned ? '1' : '0');
    } catch {
      // Private window: pinned for this visit only.
    }
    set({ pinned });
  },
  setMobileOpen: (mobileOpen) => set({ mobileOpen }),
}));

/** Menu groups folded shut (by label), remembered in this browser. */
const FOLD_KEY = 'nural.drawer.folded';
const readFolded = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

export const useFolded = create<{ folded: string[]; toggle: (group: string) => void }>((set) => ({
  folded: readFolded(),
  toggle: (group) =>
    set((s) => {
      const folded = s.folded.includes(group)
        ? s.folded.filter((g) => g !== group)
        : [...s.folded, group];
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(folded));
      } catch {
        // Private window: for this visit only.
      }
      return { folded };
    }),
}));
