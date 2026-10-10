// Stat tile (SRS 6): label, big number, sub-line, optional status colour; clickable.
import clsx from 'clsx';
import type { ReactNode } from 'react';

interface Props {
  label: string;
  /** A number, or text such as "Today"; undefined shows a skeleton. */
  value: number | string | undefined;
  sub?: string;
  tone?: 'bad';
  active?: boolean;
  onClick?: () => void;
  /** Shown to the right of the value, e.g. a ring chart. */
  aside?: ReactNode;
}

export function StatTile({ label, value, sub, tone, active, onClick, aside }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex min-w-0 flex-col rounded-card border bg-surface p-3 text-left transition-colors',
        'hover:bg-primary-soft-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
        tone === 'bad' ? 'border-bad' : active ? 'border-primary' : 'border-border',
        active && 'ring-2 ring-primary-soft',
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-heading text-label uppercase text-text-muted">
            {label}
          </span>
          {value === undefined ? (
            <span className="skeleton mt-2 h-7 w-16" />
          ) : (
            <span
              className={clsx(
                'mt-1 truncate font-heading text-tile',
                tone === 'bad' ? 'text-bad' : 'text-primary-dark',
              )}
            >
              {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
            </span>
          )}
          <span className="min-h-[14px] truncate text-table text-text-muted" title={sub}>
            {sub}
          </span>
        </span>
        {aside}
      </span>
    </button>
  );
}
