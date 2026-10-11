// When to ask for feedback (2026-10-12, SRS 20): once a person has used the dashboard for a day,
// on a later visit. "Later" asks again in 7 days, "Give feedback" in 30, "Don't ask again" never.
// Kept in their tour settings: shown.feedbackask = the day (since 1970) to ask from; seen holds
// "feedback-never".
import type { Prefs } from '../../api/prefs';

const DAY = 86_400_000;
export const NEVER = 'feedback-never';
export const ASK_KEY = 'feedbackask';
export const dayOf = (t: number) => Math.floor(t / DAY);

export function shouldAsk(
  p: Pick<Prefs, 'loginCount' | 'tour'> & { firstSignInAt?: string | null },
  now: number,
) {
  if (p.tour.seen?.includes(NEVER)) return false;
  const askFrom = p.tour.shown?.[ASK_KEY];
  if (askFrom !== undefined) return dayOf(now) >= askFrom;
  // A day after the first sign-in; people from before it was kept: from their second sign-in.
  return p.firstSignInAt ? now - Date.parse(p.firstSignInAt) >= DAY : p.loginCount >= 2;
}

/** The setting after an answer: ask again in `days`, or never. */
export function answer(tour: Prefs['tour'], now: number, days: number | 'never'): Prefs['tour'] {
  if (days === 'never') return { ...tour, seen: [...(tour.seen ?? []), NEVER].slice(-500) };
  return { ...tour, shown: { ...tour.shown, [ASK_KEY]: dayOf(now) + days } };
}
