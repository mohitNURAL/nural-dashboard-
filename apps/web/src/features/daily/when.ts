// When the Daily update opens by itself (2026-10-14, SRS 23): on a working day, the morning plan
// until it is posted, and from the end of the working day (18:30) the wrap-up until it is posted.
// "Later" waits 2 hours; it is kept in the person's tour settings (shown.dailysnooze = until, ms).
import type { Prefs } from '../../api/prefs';
import type { DailyToday } from './api';

export const SNOOZE_KEY = 'dailysnooze';
export const SNOOZE_MS = 2 * 3_600_000;

export type DailyMode = 'plan' | 'wrap';

export function dailyPrompt(
  t: Pick<DailyToday, 'working' | 'plan' | 'wrap' | 'nowMin' | 'wrapFromMin'>,
  tour: Prefs['tour'],
  now: number,
): DailyMode | null {
  if (!t.working || t.wrap) return null;
  const until = tour.shown?.[SNOOZE_KEY];
  if (until !== undefined && now < until) return null;
  if (t.nowMin >= t.wrapFromMin) return 'wrap';
  return t.plan ? null : 'plan';
}

/** The setting after "Later": ask again in 2 hours. */
export const snooze = (tour: Prefs['tour'], now: number): Prefs['tour'] => ({
  ...tour,
  shown: { ...tour.shown, [SNOOZE_KEY]: now + SNOOZE_MS },
});

/** Sign out: the wrap-up first when there is a plan and no wrap-up yet on a working day. */
export const wrapBeforeSignOut = (t: Pick<DailyToday, 'working' | 'plan' | 'wrap'>) =>
  t.working && !!t.plan && !t.wrap;
