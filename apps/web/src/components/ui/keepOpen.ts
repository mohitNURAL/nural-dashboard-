// Boxes close only from their own close (×) button (2026-11-02): a click outside or Escape
// leaves them open, so a half-filled form (task edit, Add task, Daily update) is never lost.
// Spread on every Radix Dialog.Content: <Dialog.Content {...keepOpen} ...>.
// So that a click outside never looks like a frozen screen, it shakes the box and lights up its
// close button (nudge).

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Shakes `box` and lights up its close button: "close me with this". */
export function nudge(box: Element | null | undefined, close?: Element | null) {
  if (!box) return;
  const button =
    close ?? box.querySelector('[aria-label="Close"], [aria-label^="Close "], [data-close]');
  if (!reduceMotion())
    box.animate(
      [
        { translate: '0 0' },
        { translate: '-8px 0' },
        { translate: '7px 0' },
        { translate: '-4px 0' },
        { translate: '0 0' },
      ],
      { duration: 320, easing: 'ease-out' },
    );
  if (button instanceof HTMLElement) {
    button.animate(
      [
        { boxShadow: '0 0 0 0 transparent', scale: '1' },
        {
          boxShadow: '0 0 0 6px color-mix(in srgb, var(--accent) 45%, transparent)',
          scale: '1.15',
        },
        { boxShadow: '0 0 0 0 transparent', scale: '1' },
      ],
      { duration: 700, easing: 'ease-out', iterations: 2 },
    );
    button.focus({ preventScroll: true });
  }
}

/** The open box on top: the highest layer (the confirmation sits above the task view). */
const topBox = () => {
  let top: Element | undefined;
  let topZ = -Infinity;
  for (const d of document.querySelectorAll('[role="dialog"][data-state="open"]')) {
    const z = Number(getComputedStyle(d).zIndex) || 0;
    if (z >= topZ) [top, topZ] = [d, z];
  }
  return top;
};

export const keepOpen = {
  onPointerDownOutside: (e: Event) => {
    e.preventDefault();
    nudge(topBox());
  },
  onFocusOutside: (e: Event) => e.preventDefault(),
  onEscapeKeyDown: (e: Event) => {
    e.preventDefault();
    nudge(topBox());
  },
} as const;
