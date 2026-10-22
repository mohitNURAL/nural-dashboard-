// When the Daily update opens without the dock icon (SRS 23): only before signing out. It never
// opens by itself (2026-10-15).
import type { DailyToday } from './api';

/** add: the posted plan with Add more tasks open (2026-10-22). */
export type DailyMode = 'plan' | 'wrap' | 'add';

/** Sign out: the wrap-up first when there is a plan and no wrap-up yet on a working day. */
export const wrapBeforeSignOut = (t: Pick<DailyToday, 'working' | 'plan' | 'wrap'>) =>
  t.working && !!t.plan && !t.wrap;
