// The "?" on a tile, card or section: a guided tour of just that data point (2026-10-11), in the
// person's own wording (members: their own tasks). Points without a written step get a short
// one from their name.
import { useMe } from '../../api/me';
import { usePrefs, useSavePrefs } from '../../api/prefs';
import type { Tab } from '../filters/toParams';
import { pointLabel } from './labels';
import { visibleSteps } from './logic';
import { runTour } from './runTour';
import { TAB_STEPS, type TourStep } from './steps';

const SECTION_TEXT =
  'Click the header to open the list. Click a row for the full task; click a Stage, Status or Tags cell to change it; tick rows for bulk edit; Excel downloads the list.';

/** The steps for one data point. */
export function pointSteps(group: string, id: string): TourStep[] {
  const target = `[data-group="${group}"] [data-slot="${id}"]`;
  const tab = group.split('.')[0] as Tab;
  const written = (TAB_STEPS[tab] ?? []).filter((s) => s.target === target);
  if (written.length) return written;
  return [
    {
      target,
      title: pointLabel(group, id),
      text: group.endsWith('.sections')
        ? SECTION_TEXT
        : 'Click any number to list its tasks; the "i" says what it counts.',
    },
  ];
}

export function usePointTour() {
  const { data: me } = useMe();
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  return (group: string, id: string) => {
    const steps = visibleSteps(pointSteps(group, id), !(me?.full ?? true), (s) =>
      Boolean(document.querySelector(s)),
    );
    runTour(steps, {
      kind: 'About this',
      voice: !!prefs?.tour.voice,
      onVoice: (on) => save((p) => ({ tour: { ...p.tour, voice: on } })),
      onEnd: () => undefined,
    });
  };
}
