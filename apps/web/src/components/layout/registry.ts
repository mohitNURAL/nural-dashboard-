// The drag groups on screen (tiles, cards, sections), for the Customise panel (2026-10-11).
import { create } from 'zustand';

/** "dev.tiles" → "dev.tiles.hidden": the data points the person hid, per group. */
export const hiddenKey = (group: string) => `${group}.hidden`;

interface Registry {
  groups: Record<string, { noun: 'tile' | 'card' | 'section'; ids: string[] }>;
  register: (group: string, noun: 'tile' | 'card' | 'section', ids: string[]) => void;
  unregister: (group: string) => void;
}

export const useLayoutRegistry = create<Registry>((set) => ({
  groups: {},
  register: (group, noun, ids) => set((s) => ({ groups: { ...s.groups, [group]: { noun, ids } } })),
  unregister: (group) =>
    set((s) => {
      const groups = { ...s.groups };
      delete groups[group];
      return { groups };
    }),
}));
