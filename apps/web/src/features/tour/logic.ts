// When the guided tour plays and what it shows (SRS 16). Pure functions, tested in logic.test.ts.
import type { TourPrefs } from '../../api/prefs';
import type { Tab } from '../filters/toParams';
import type { TourStep } from './steps';
import type { WhatsNew } from './whatsNew';

/** The tour plays by itself on a person's first three sign-ins. */
export const TOUR_SIGN_INS = 3;

/** Tab order of the dashboard, filtered to what the person may open. */
export function tabsFor(access: { kpi: boolean; support: boolean }): Tab[] {
  return (['kpi', 'dev', 'qa', 'support'] as const).filter(
    (t) => (t !== 'kpi' || access.kpi) && (t !== 'support' || access.support),
  );
}

/** A tab's tour is due on sign-ins 1 to 3, once per tab per sign-in. */
export function tabTourDue(loginCount: number, tour: TourPrefs, tab: Tab): boolean {
  return loginCount >= 1 && loginCount <= TOUR_SIGN_INS && (tour.shown?.[tab] ?? 0) !== loginCount;
}

/** The role and top-bar steps go first in the first tab tour of a sign-in. */
export function firstOfSignIn(loginCount: number, tour: TourPrefs): boolean {
  return !Object.values(tour.shown ?? {}).includes(loginCount);
}

/** The next tab whose tour is still due this sign-in (to offer "Continue to …"). */
export function nextDueTab(
  loginCount: number,
  tour: TourPrefs,
  tabs: Tab[],
  current: Tab,
): Tab | undefined {
  const after = [...tabs.slice(tabs.indexOf(current) + 1), ...tabs.slice(0, tabs.indexOf(current))];
  return after.find((t) => tabTourDue(loginCount, tour, t));
}

/**
 * What's-new entries the person has not seen, on tabs they can open. None during the first three
 * sign-ins: the full tour covers everything then (and marks these seen).
 */
export function unseenFeatures(
  loginCount: number,
  tour: TourPrefs,
  tabs: Tab[],
  all: WhatsNew[],
): WhatsNew[] {
  if (loginCount <= TOUR_SIGN_INS) return [];
  const seen = new Set(tour.seen ?? []);
  return all.filter((w) => tabs.includes(w.tab) && !seen.has(w.id));
}

/**
 * The steps to show: the member wording for members, and only steps whose element is on screen
 * (`present`); a step without a target is a centred message and always shown.
 */
export function visibleSteps(
  steps: TourStep[],
  member: boolean,
  present: (selector: string) => boolean,
): TourStep[] {
  return steps
    .filter((s) => !s.target || present(s.target))
    .map((s) => (member && s.member ? { ...s, text: s.member } : s));
}
