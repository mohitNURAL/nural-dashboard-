// Safety net against a frozen page (2026-11-02). A window (Radix dialog) blocks clicks on the page
// behind it (`pointer-events: none` and a scroll lock on <body>) and the spotlight locks the
// page's scroll. If one of them is put away in an unusual order (two windows closing at once, a
// window opened from a list that closed), that lock can stay behind with nothing on screen:
// every click does nothing. Once a second, a lock with no window or spotlight left is lifted.
// Installed once by App.
import { spotlightOpen } from '../spotlight/spotlight';

const anyWindowOpen = () =>
  !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );

export function watchForStuckLocks() {
  const check = () => {
    const body = document.body;
    if (anyWindowOpen()) return;
    if (body.style.pointerEvents === 'none') body.style.pointerEvents = '';
    if (body.hasAttribute('data-scroll-locked')) body.removeAttribute('data-scroll-locked');
    const html = document.documentElement;
    if (!spotlightOpen() && html.style.overflow === 'hidden') html.style.overflow = '';
  };
  const timer = window.setInterval(check, 1000);
  return () => window.clearInterval(timer);
}
