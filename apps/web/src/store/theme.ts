// Theme (Light, Dark or System): a per-browser choice, kept in localStorage. "System" follows
// the computer's light or dark setting and changes with it.
import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'nural-theme';

const media = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

const resolve = (c: ThemeChoice): 'light' | 'dark' =>
  c === 'system' ? (media()?.matches ? 'dark' : 'light') : c;

function apply(resolved: 'light' | 'dark') {
  document.documentElement.dataset.theme = resolved;
}

interface ThemeState {
  choice: ThemeChoice;
  resolved: 'light' | 'dark';
  set: (c: ThemeChoice) => void;
}

export const useTheme = create<ThemeState>((set) => {
  const choice = stored();
  const resolved = resolve(choice);
  apply(resolved);
  // "System" follows the computer when its setting changes.
  media()?.addEventListener('change', () => {
    const { choice: c } = useTheme.getState();
    if (c !== 'system') return;
    const r = resolve(c);
    apply(r);
    set({ resolved: r });
  });
  return {
    choice,
    resolved,
    set: (c) => {
      try {
        localStorage.setItem(KEY, c);
      } catch {
        // Private mode: the choice lasts for this visit.
      }
      const r = resolve(c);
      apply(r);
      set({ choice: c, resolved: r });
    },
  };
});
