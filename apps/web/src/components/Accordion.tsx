// Accordion (SRS 6): header with count badge, closed by default; controlled so a tile can open it.
import clsx from 'clsx';
import { forwardRef, type ReactNode } from 'react';
import { CountBadge } from './chips';
import { InfoTip } from './InfoTip';

interface Props {
  title: string;
  hint?: string;
  count?: number;
  tone?: 'bad';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** One-line explanation behind the "i" icon at the right of the header. */
  info?: string;
}

export const Accordion = forwardRef<HTMLElement, Props>(function Accordion(
  { title, hint, count, tone, open, onOpenChange, children, info },
  ref,
) {
  return (
    <section
      ref={ref}
      className={clsx(
        'scroll-mt-20 rounded-card border bg-surface',
        tone === 'bad' ? 'border-bad' : 'border-border',
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-primary-soft-100"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden
            className={clsx('shrink-0 transition-transform', open && 'rotate-90')}
          >
            <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <h2 className="font-heading text-h3 text-primary-dark">{title}</h2>
          <CountBadge n={count} tone={tone} />
          {hint && <span className="ml-auto hidden text-text-muted sm:inline">{hint}</span>}
        </button>
        {info && (
          <span className="pr-4">
            <InfoTip text={info} label={title} />
          </span>
        )}
      </div>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </section>
  );
});
