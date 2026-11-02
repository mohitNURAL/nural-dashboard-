// Boxes close only from their own close (×) button (2026-11-02): a click outside or Escape
// leaves them open, so a half-filled form (task edit, Add task, Daily update) is never lost.
// Spread on every Radix Dialog.Content: <Dialog.Content {...keepOpen} ...>.

const stay = (e: Event) => e.preventDefault();

export const keepOpen = {
  onInteractOutside: stay,
  onEscapeKeyDown: stay,
} as const;
