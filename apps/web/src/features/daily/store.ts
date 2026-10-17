// Which Daily update view is open (SRS 23), and the ways it opens: the dock icon and Sign out.
import { create } from 'zustand';
import { apiGet } from '../../api/client';
import type { DailyToday } from './api';
import { wrapBeforeSignOut, type DailyMode } from './when';

interface DialogState {
  mode: DailyMode | null;
  /** Runs after posting or skipping (sign out). */
  after?: () => void;
  open: (mode: DailyMode, after?: () => void) => void;
  close: () => void;
}

export const useDailyDialog = create<DialogState>((set) => ({
  mode: null,
  open: (mode, after) => set({ mode, after }),
  close: () => set({ mode: null, after: undefined }),
}));

const today = () => apiGet<DailyToday>('/api/daily/today').catch(() => undefined);

/**
 * The dock icon: the plan, viewable and editable all day (2026-10-17), until the wrap-up time or
 * once wrapped up; then the wrap-up. The plan view also has "Wrap up now".
 */
export async function openDailyNow() {
  const t = await today();
  useDailyDialog.getState().open(t && (t.wrap || t.nowMin >= t.wrapFromMin) ? 'wrap' : 'plan');
}

/**
 * Sign out: on a working day with a plan and no wrap-up yet, the wrap-up opens first ("Post and
 * sign out" or "Sign out without posting"); otherwise straight out.
 */
export async function signOutAfterWrap(signOut: () => void, enabled: boolean) {
  if (!enabled) return signOut();
  const t = await today();
  if (t && wrapBeforeSignOut(t)) useDailyDialog.getState().open('wrap', signOut);
  else signOut();
}
