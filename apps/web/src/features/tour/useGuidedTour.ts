// Guided tour and what's new (SRS 16), mounted once in App.
// - First three sign-ins: opening a tab plays its tour once per sign-in; the first tour of a sign-in
//   opens with the person's role and the top bar, and the last step offers the next tab still due.
// - Later: what's-new entries the person has not seen show a "New" dot on their tab and a toast;
//   opening the tab walks through them once.
// - Any time: Profile → "Take the tour of this tab".
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { useMe, type Me } from '../../api/me';
import { usePrefs, useSavePrefs, type Prefs } from '../../api/prefs';
import type { Tab } from '../filters/toParams';
import {
  firstOfSignIn,
  nextDueTab,
  tabsFor,
  tabTourDue,
  TOUR_SIGN_INS,
  unseenFeatures,
  visibleSteps,
} from './logic';
import { runTour, tourRunning } from './runTour';
import { COMMON_STEPS, roleStep, TAB_LABEL, TAB_STEPS, type TourStep } from './steps';
import { WHATS_NEW } from './whatsNew';

/** Profile menu → "Take the tour of this tab" bumps this. */
export const useTourRequest = create<{ n: number; request: () => void }>((set) => ({
  n: 0,
  request: () => set((s) => ({ n: s.n + 1 })),
}));

const present = (selector: string) => !!document.querySelector(selector);
/** Lets the tab draw its tiles and cards before the tour looks for them. */
const SETTLE_MS = 1500;

export const tourTabs = (me: Me) => tabsFor({ kpi: me.kpi ?? me.full, support: me.support });

/** Tabs with what's new for this person (the "New" dot in the top bar). */
export function useNewTabs(): Set<Tab> {
  const { data: me } = useMe();
  const { data: prefs } = usePrefs();
  if (!me || !prefs || me.auth !== 'bitrix') return new Set();
  return new Set(
    unseenFeatures(prefs.loginCount, prefs.tour, tourTabs(me), WHATS_NEW)
      .filter((w) => w.steps.length)
      .map((w) => w.tab),
  );
}

export function useGuidedTour(tab: Tab, setTab: (t: Tab) => void) {
  const { data: me } = useMe();
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  const requested = useTourRequest((s) => s.n);
  const handledRequest = useRef(requested);
  const toasted = useRef(false);

  // Tab tour (first three sign-ins, or on request) and what's new for this tab.
  useEffect(() => {
    if (!me || !prefs || tourRunning()) return;
    const tabs = tourTabs(me);
    const manual = requested !== handledRequest.current;
    handledRequest.current = requested;
    // Dashboard tabs play by themselves (first sign-ins, what's new); Employee pages on request.
    if (!tabs.includes(tab) && !manual) return;
    const signedIn = me.auth === 'bitrix' && tabs.includes(tab);
    const due = signedIn && tabTourDue(prefs.loginCount, prefs.tour, tab);
    const features = signedIn
      ? unseenFeatures(prefs.loginCount, prefs.tour, tabs, WHATS_NEW).filter(
          (w) => w.tab === tab && w.steps.length,
        )
      : [];
    if (!manual && !due && !features.length) return;

    const timer = window.setTimeout(() => {
      if (tourRunning()) return;
      const member = !me.full;
      if (manual || due) {
        const first = manual || firstOfSignIn(prefs.loginCount, prefs.tour);
        const steps: TourStep[] = [
          ...(first ? [roleStep(me, tabs), ...COMMON_STEPS] : []),
          ...TAB_STEPS[tab],
        ];
        // Mark it shown now, so a reload does not replay it; during the first sign-ins the full
        // tour covers every what's-new entry, so those count as seen too.
        const tour = {
          ...prefs.tour,
          ...(due && {
            shown: { ...prefs.tour.shown, [tab]: prefs.loginCount },
            seen: [...new Set([...(prefs.tour.seen ?? []), ...WHATS_NEW.map((w) => w.id)])],
          }),
        };
        if (due) save(() => ({ tour }));
        const next = due ? nextDueTab(prefs.loginCount, tour, tabs, tab) : undefined;
        play(visibleSteps(steps, member, present), prefs, {
          doneLabel: next ? `Next: ${TAB_LABEL[next]} tab →` : 'Done',
          onEnd: (finished) => finished && next && setTab(next),
        });
        return;
      }
      // What's new on this tab.
      const ids = features.map((w) => w.id);
      save((p) => ({ tour: { ...p.tour, seen: [...new Set([...(p.tour.seen ?? []), ...ids])] } }));
      const steps = features.flatMap((w) =>
        w.steps.map((s) => ({ ...s, title: `New: ${s.title}` })),
      );
      play(visibleSteps(steps, member, present), prefs, {});
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
    // prefs.tour changes after each save; the tour state checks above keep it from replaying.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, me, prefs?.loginCount, requested]);

  // Once per page load after the first sign-ins: a toast for unseen features on other tabs.
  useEffect(() => {
    if (!me || !prefs || toasted.current || me.auth !== 'bitrix') return;
    if (prefs.loginCount <= TOUR_SIGN_INS) return;
    toasted.current = true;
    const unseen = unseenFeatures(prefs.loginCount, prefs.tour, tourTabs(me), WHATS_NEW).filter(
      (w) => w.steps.length && w.tab !== tab,
    );
    const first = unseen[0];
    if (!first) return;
    toast(`New on ${TAB_LABEL[first.tab]}: ${first.title}`, {
      id: 'whats-new',
      description:
        unseen.length > 1
          ? `And ${unseen.length - 1} more. Open the tab with the blue dot to see it.`
          : 'Open the tab to see how it works.',
      duration: 12_000,
      action: { label: 'Show me', onClick: () => setTab(first.tab) },
    });
  }, [me, prefs, tab, setTab]);

  function play(
    steps: TourStep[],
    p: Prefs,
    o: { doneLabel?: string; onEnd?: (finished: boolean) => void },
  ) {
    runTour(steps, {
      voice: !!p.tour.voice,
      onVoice: (on) => save((cur) => ({ tour: { ...cur.tour, voice: on } })),
      doneLabel: o.doneLabel,
      onEnd: (finished) => o.onEnd?.(finished),
    });
  }
}
