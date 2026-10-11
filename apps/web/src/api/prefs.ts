// Per-person settings (GET/PUT /api/prefs): sign-in count, layout order and guided-tour state.
// Kept under its own query key (not 'api'), so live updates do not refetch it over a pending save.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiGet, apiPost } from './client';

export interface TourPrefs {
  /** Read steps aloud (browser voice). */
  voice?: boolean;
  /** Per tab, the sign-in number its tour was last shown at. */
  shown?: Record<string, number>;
  /** What's-new entries already walked through or dismissed. */
  seen?: string[];
}

export interface Prefs {
  loginCount: number;
  /** Order per group, e.g. { "dev.tiles": ["total", "pending"] }. */
  layout: Record<string, string[]>;
  tour: TourPrefs;
}

export const PREFS_KEY = ['prefs'];

export const usePrefs = () =>
  useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => apiGet<Prefs>('/api/prefs'),
    staleTime: Infinity,
  });

let timer: number | undefined;

/** Changes the settings at once on screen and saves them shortly after (one call per burst). */
export function useSavePrefs() {
  const qc = useQueryClient();
  return useCallback(
    (change: (p: Prefs) => Partial<Pick<Prefs, 'layout' | 'tour'>>) => {
      const old = qc.getQueryData<Prefs>(PREFS_KEY);
      if (!old) return;
      qc.setQueryData(PREFS_KEY, { ...old, ...change(old) });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const latest = qc.getQueryData<Prefs>(PREFS_KEY);
        if (!latest) return;
        void apiPost('/api/prefs', { layout: latest.layout, tour: latest.tour }, 'PUT').catch(
          () => undefined,
        );
      }, 500);
    },
    [qc],
  );
}

/** Profile menu: tiles, cards and sections back to the default order everywhere. */
export function useResetLayout() {
  const save = useSavePrefs();
  return () => save(() => ({ layout: {} }));
}
