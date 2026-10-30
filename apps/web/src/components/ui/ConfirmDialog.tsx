// Confirmation popups (2026-10-12) in the dashboard's own style, in place of the browser's
// confirm(). `await confirm({...})` resolves true on the main button, false on Cancel, Escape or
// a click outside. One host (<ConfirmHost/>, mounted once in App) shows them one at a time.
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { IconClose } from './icons';

export type Tone = 'primary' | 'good' | 'warn' | 'bad';

export interface ConfirmOptions {
  title: string;
  /** What will happen, in a sentence or two. */
  message?: ReactNode;
  /** Optional facts shown as a list: e.g. "Task 4120", "Status: In progress → Completed". */
  details?: { label: string; value: ReactNode }[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface State {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  ask: (o: ConfirmOptions) => Promise<boolean>;
  answer: (ok: boolean) => void;
}

const useConfirmStore = create<State>((set, get) => ({
  current: null,
  ask: (o) =>
    new Promise<boolean>((resolve) => {
      get().current?.resolve(false);
      set({ current: { ...o, resolve } });
    }),
  answer: (ok) => {
    get().current?.resolve(ok);
    set({ current: null });
  },
}));

/** Ask for confirmation: resolves true when the person confirms. */
export const confirm = (o: ConfirmOptions) => useConfirmStore.getState().ask(o);

// Flat fills (Nural brand): the confirm button's fill and label carry the tone.
const TONE: Record<Tone, { button: string; ring: string; mark: string }> = {
  primary: {
    button: 'bg-accent text-on-accent hover:bg-accent-dark',
    ring: 'bg-primary/15 text-primary',
    mark: '?',
  },
  good: {
    button: 'bg-accent text-on-accent hover:bg-accent-dark',
    ring: 'bg-good/15 text-good',
    mark: '✓',
  },
  warn: {
    button: 'bg-navy text-white hover:bg-navy-deep',
    ring: 'bg-warn/15 text-warn',
    mark: '!',
  },
  bad: {
    button: 'bg-bad text-white hover:bg-bad-dark',
    ring: 'bg-bad/15 text-bad',
    mark: '!',
  },
};

export function ConfirmHost() {
  const { current, answer } = useConfirmStore();
  const tone = TONE[current?.tone ?? 'primary'];
  return (
    <Dialog.Root open={!!current} onOpenChange={(o) => !o && answer(false)}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-confirm overlay"
          style={{ animation: 'fade-in 160ms ease-out' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-confirm w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-card border border-border bg-surface shadow-pop"
          style={{ animation: 'tour-in 200ms cubic-bezier(0.2,0,0,1)' }}
        >
          {current && (
            <>
              <div className="flex gap-4 px-5 pb-2 pt-5">
                <span
                  aria-hidden
                  className={clsx(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-heading text-h2 font-extrabold',
                    tone.ring,
                  )}
                >
                  {tone.mark}
                </span>
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="font-heading text-h2 text-primary-dark">
                    {current.title}
                  </Dialog.Title>
                  {current.message && (
                    <Dialog.Description className="mt-1 text-body text-text-muted">
                      {current.message}
                    </Dialog.Description>
                  )}
                </div>
                <Dialog.Close
                  aria-label="Close"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
                >
                  <IconClose size={16} />
                </Dialog.Close>
              </div>
              {current.details && current.details.length > 0 && (
                <dl className="mx-5 mt-2 space-y-1.5 rounded-xl border border-border bg-primary-soft-100/40 px-4 py-3 text-table">
                  {current.details.map((d) => (
                    <div key={d.label} className="flex gap-3">
                      <dt className="w-24 shrink-0 font-heading text-label uppercase text-text-muted">
                        {d.label}
                      </dt>
                      <dd className="min-w-0 text-text">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex justify-end gap-2 px-5 pb-5 pt-4">
                <button
                  type="button"
                  onClick={() => answer(false)}
                  className="h-10 rounded-full border border-primary-dark px-4 font-heading text-button uppercase text-primary-dark hover:bg-primary-soft-100"
                >
                  {current.cancelLabel ?? 'Cancel'}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => answer(true)}
                  className={clsx(
                    'h-10 rounded-full px-5 font-heading text-button uppercase transition',
                    tone.button,
                  )}
                >
                  {current.confirmLabel ?? 'Confirm'}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
