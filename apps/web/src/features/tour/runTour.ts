// Plays a list of tour steps (driver.js): the element is highlighted with the page dimmed, and a
// bubble explains it. Every bubble has a Voice button (read aloud, remembered per person).
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { TourStep } from './steps';
import { speak, stopSpeaking, voiceAvailable } from './voice';

interface Options {
  voice: boolean;
  onVoice: (on: boolean) => void;
  /** Text of the last step's button, e.g. "Next: QA tab →". */
  doneLabel?: string;
  /** Called when the tour ends; `finished` = the last step's button was pressed. */
  onEnd: (finished: boolean) => void;
}

let active: ReturnType<typeof driver> | undefined;

export const tourRunning = () => !!active?.isActive();

export function runTour(steps: TourStep[], { voice: voiceOn, onVoice, doneLabel, onEnd }: Options) {
  if (!steps.length || tourRunning()) return;
  let voice = voiceOn && voiceAvailable();
  let finished = false;
  const read = (i: number) => {
    const s = steps[i];
    if (voice && s) speak(`${s.title}. ${s.text}`);
  };
  const d = driver({
    popoverClass: 'nural-tour',
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: doneLabel ?? 'Done',
    overlayOpacity: 0.7,
    stagePadding: 6,
    stageRadius: 10,
    smoothScroll: true,
    allowClose: true,
    steps: steps.map((s) => ({
      element: s.target,
      popover: { title: s.title, description: s.text },
    })),
    onHighlighted: (_el, _step, { state }) => read(state.activeIndex ?? 0),
    onNextClick: (_el, _step, { driver: dr }) => {
      if (dr.isLastStep()) finished = true;
      dr.moveNext();
    },
    onPopoverRender: (popover, { state }) => {
      if (!voiceAvailable()) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nural-tour-voice';
      const paint = () => {
        btn.textContent = voice ? '🔊 Voice on' : '🔈 Voice off';
        btn.setAttribute('aria-pressed', String(voice));
        btn.title = voice ? 'Stop reading aloud' : 'Read each step aloud';
      };
      paint();
      btn.onclick = () => {
        voice = !voice;
        paint();
        onVoice(voice);
        if (voice) read(state.activeIndex ?? 0);
        else stopSpeaking();
      };
      popover.footerButtons.prepend(btn);
    },
    onDestroyed: () => {
      stopSpeaking();
      active = undefined;
      onEnd(finished);
    },
  });
  active = d;
  d.drive();
}
