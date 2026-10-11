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

/**
 * The menu module that is open (2026-10-12): one at a time, the module of the page you are on
 * by default. Opening another page opens its module; clicking a module's header opens or closes
 * it by hand.
 */
export const useMenuModule = create<{ open: string | null; setOpen: (m: string | null) => void }>(
  (set) => ({ open: null, setOpen: (open) => set({ open }) }),
);
