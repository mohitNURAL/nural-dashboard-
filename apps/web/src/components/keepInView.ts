// Scroll a drilled-down list into view and keep it there while the page settles.
import type { RefObject } from 'react';

const SETTLE_MS = 2500;

/**
 * Scrolls to the element and keeps it at the top while the page settles: a new filter makes
 * the cards above reload and change height, which would push the list out of view. Stops after
 * SETTLE_MS or as soon as the user scrolls.
 */
export function keepInView(ref: RefObject<HTMLElement | null>) {
  const snap = () => ref.current?.scrollIntoView({ block: 'start' });
  const frame = requestAnimationFrame(snap);
  const observer = new ResizeObserver(snap);
  observer.observe(document.body);
  const stop = () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    for (const e of USER_SCROLL) window.removeEventListener(e, stop);
    clearTimeout(timer);
  };
  const timer = setTimeout(stop, SETTLE_MS);
  for (const e of USER_SCROLL) window.addEventListener(e, stop, { passive: true });
  return stop;
}

const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
