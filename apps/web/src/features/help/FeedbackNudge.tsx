// The feedback prompt (2026-10-12, SRS 20): after a day of use a friendly card asks how it is
// going, read aloud when Voice is on, with a button straight to Help › Feedback. It waits until
// no tour is running and never shows to people without the Feedback page.
import { useEffect, useState } from 'react';
import { useMe } from '../../api/me';
import { usePrefs, useSavePrefs } from '../../api/prefs';
import { IconClose, IconFeedback } from '../../components/ui/icons';
import type { Tab } from '../filters/toParams';
import { tourRunning } from '../tour/runTour';
import { speak, voiceAvailable } from '../tour/voice';
import { answer, shouldAsk } from './nudge';

export function FeedbackNudge({ onGo }: { onGo: (t: Tab) => void }) {
  const { data: me } = useMe();
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  const [show, setShow] = useState(false);
  const first = me?.name.split(' ')[0] ?? 'there';
  const text = `Hi ${first}! Enjoying the dashboard? Tell us what helps, what slows you down and what you wish it did. Your ideas shape what we build next.`;

  useEffect(() => {
    // Not for automated browsers (guide screenshots, checks).
    if (!me || !prefs || me.helpFeedback === false || me.auth === 'off' || navigator.webdriver)
      return;
    if (!shouldAsk(prefs, Date.now())) return;
    // A little after the page settles, and not over a tour.
    const t = window.setInterval(() => {
      if (tourRunning()) return;
      window.clearInterval(t);
      setShow(true);
      if (prefs.tour.voice && voiceAvailable()) speak(text);
    }, 6000);
    return () => window.clearInterval(t);
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, !!prefs]);

  if (!show) return null;
  const close = (days: number | 'never') => {
    save((p) => ({ tour: answer(p.tour, Date.now(), days) }));
    setShow(false);
  };
  return (
    <div
      role="dialog"
      aria-label="Tell us how it is going"
      className="fixed bottom-5 right-20 z-[55] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-card border border-border bg-surface shadow-pop"
      style={{ animation: 'tour-in 320ms cubic-bezier(0.2,0,0,1)' }}
    >
      <div className="flex gap-3 p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center text-primary">
          <IconFeedback size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-h3 text-primary-dark">
            Hi {first}, enjoying the dashboard?
          </p>
          <p className="mt-1 text-table text-text">
            Tell us what helps, what slows you down and what you wish it did. Your ideas shape what
            we build next.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                close(30);
                onGo('feedback');
              }}
              className="btn btn-page h-9 px-3"
            >
              Give feedback
            </button>
            <button type="button" onClick={() => close(7)} className="btn btn-stroke h-9 px-3">
              Later
            </button>
            <button
              type="button"
              onClick={() => close('never')}
              className="h-9 px-1 font-heading text-[12px] text-text-muted hover:text-primary"
            >
              Don’t ask again
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => close(7)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
        >
          <IconClose size={14} />
        </button>
      </div>
    </div>
  );
}
