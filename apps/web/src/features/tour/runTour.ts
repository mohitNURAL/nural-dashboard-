// Plays a list of tour steps (driver.js): the element is highlighted with the page dimmed, and a
// bubble explains it. Every bubble has a step badge, a progress bar and a Voice button (read aloud,
// remembered per person). The bubble follows its element: cards that load or grow after the
// bubble is placed move the element, so while the tour runs it is re-placed whenever the element
// moves (the cause of bubbles far from their data point, 2026-10-11).
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { TourStep } from './steps';
import { speak, stopSpeaking, voiceAvailable } from './voice';

interface Options {
  voice: boolean;
  onVoice: (on: boolean) => void;
  /** Text of the last step's button, e.g. "Next: QA tab →". */
  doneLabel?: string;
  /** Small label above the title, e.g. "Guided tour" or "What's new". */
  kind?: string;
  /** Called when the tour ends; `finished` = the last step's button was pressed. */
  onEnd: (finished: boolean) => void;
}

let active: ReturnType<typeof driver> | undefined;

export const tourRunning = () => !!active?.isActive();

/**
 * What to highlight for a step: the element, or for one taller than most of the screen (an open
 * list) its header, so the bubble next to it stays on screen.
 */
function resolve(selector: string): Element | undefined {
  const el = document.querySelector(selector);
  if (!el) return undefined;
  // A page inside a folded menu module: point at the module instead.
  const folded = el.closest('[data-folded="true"]');
  if (folded) return folded.querySelector('[data-module-head]') ?? folded;
  if (el.getBoundingClientRect().height <= window.innerHeight * 0.6) return el;
  return el.querySelector('header, button[aria-expanded], h2') ?? el;
}

const html = (tag: string, cls: string, text = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
};

export function runTour(
  steps: TourStep[],
  { voice: voiceOn, onVoice, doneLabel, kind = 'Guided tour', onEnd }: Options,
) {
  if (!steps.length || tourRunning()) return;
  let voice = voiceOn && voiceAvailable();
  let finished = false;
  const read = (i: number) => {
    const s = steps[i];
    if (voice && s) speak(`${s.title}. ${s.text}`);
  };
  // The element of the current step, tracked here: driver.js can leave its own mark on earlier
  // elements, which put bubbles next to the wrong card.
  let current: Element | undefined;
  const mark = (el: Element | undefined) => {
    document.querySelectorAll('[data-tour-active], .driver-active-element').forEach((e) => {
      if (e === el) return;
      e.removeAttribute('data-tour-active');
      e.classList.remove('driver-active-element');
    });
    el?.setAttribute('data-tour-active', '');
    current = el;
  };

  const d = driver({
    popoverClass: 'nural-tour',
    showProgress: false,
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    doneBtnText: doneLabel ?? 'Finish',
    overlayOpacity: 0.7,
    stagePadding: 8,
    stageRadius: 12,
    popoverOffset: 14,
    smoothScroll: false,
    allowClose: true,
    steps: steps.map((s) => ({
      element: s.target ? () => resolve(s.target!) as Element : undefined,
      popover: { title: s.title, description: s.text },
    })),
    onHighlightStarted: (el, _step, { state }) => {
      mark(el);
      glow(steps[state.activeIndex ?? 0]?.affects);
    },
    onHighlighted: (el, _step, { state }) => {
      mark(el);
      // A bubble moved by keepNear lost its arrow; each step starts with it again.
      document
        .querySelector<HTMLElement>('.driver-popover.nural-tour .driver-popover-arrow')
        ?.style.removeProperty('display');
      read(state.activeIndex ?? 0);
      // Cards still loading can move the element: place the bubble again once settled.
      window.setTimeout(() => d.refresh(), 350);
    },
    onNextClick: (_el, _step, { driver: dr }) => {
      if (dr.isLastStep()) finished = true;
      dr.moveNext();
    },
    onPopoverRender: (popover, { state }) => {
      const i = state.activeIndex ?? 0;
      // Badge and progress above the title.
      const head = html('div', 'nural-tour-head');
      head.append(
        html('span', 'nural-tour-kind', kind),
        html('span', 'nural-tour-count', `${i + 1} / ${steps.length}`),
      );
      const bar = html('div', 'nural-tour-bar');
      const fill = html('span', '');
      fill.style.width = `${((i + 1) / steps.length) * 100}%`;
      bar.append(fill);
      popover.wrapper.prepend(head, bar);

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
        if (voice) read(i);
        else stopSpeaking();
      };
      popover.footerButtons.prepend(btn);
    },
    onDestroyed: () => {
      glow(undefined);
      window.clearInterval(follow);
      mark(undefined);
      stopSpeaking();
      active = undefined;
      onEnd(finished);
    },
  });

  // Keep the bubble and the highlight on the element as the page settles or scrolls.
  let last = '';
  const follow = window.setInterval(() => {
    const el = current;
    if (!el?.isConnected) return;
    const r = el.getBoundingClientRect();
    const now = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
    if (last && now !== last) d.refresh();
    last = now;
    keepNear(el);
  }, 250);

  active = d;
  d.drive();
}

/**
 * The bubble belongs next to its element. driver.js places it before our header and progress bar
 * are added, which can leave it far off (a wide card: the bubble ends up across the screen).
 * When it is more than a short gap away, put it right under the element (or above, or beside it
 * when there is no room), kept on screen, without the arrow.
 */
function keepNear(el: Element) {
  const pop = document.querySelector<HTMLElement>('.driver-popover.nural-tour');
  if (!pop) return;
  const e = el.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  const gapX = Math.max(e.left - p.right, p.left - e.right, 0);
  const gapY = Math.max(e.top - p.bottom, p.top - e.bottom, 0);
  if (Math.max(gapX, gapY) <= 48) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const m = 14;
  const clampX = (x: number) => Math.min(Math.max(8, x), W - p.width - 8);
  const clampY = (y: number) => Math.min(Math.max(8, y), H - p.height - 8);
  let left: number;
  let top: number;
  if (H - e.bottom >= p.height + m) {
    left = clampX(e.left + Math.min(24, e.width / 4));
    top = e.bottom + m;
  } else if (e.top >= p.height + m) {
    left = clampX(e.left + Math.min(24, e.width / 4));
    top = e.top - p.height - m;
  } else if (e.left >= p.width + m) {
    left = e.left - p.width - m;
    top = clampY(e.top);
  } else {
    left = clampX(e.right + m);
    top = clampY(e.top);
  }
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  pop.style.right = 'auto';
  pop.style.bottom = 'auto';
  pop.querySelector<HTMLElement>('.driver-popover-arrow')?.style.setProperty('display', 'none');
}

/** Lights the data points a switch changes (step.affects) above the dimmed page; none clears. */
function glow(selectors: string[] | undefined) {
  document.querySelectorAll('.tour-affected').forEach((e) => e.classList.remove('tour-affected'));
  for (const sel of selectors ?? [])
    document.querySelectorAll(sel).forEach((e) => e.classList.add('tour-affected'));
}
