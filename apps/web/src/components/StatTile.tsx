// Stat tile (SRS 6): label, big number, sub-line, optional status colour; clickable. An optional
// breakdown row splits the number (e.g. Dev and Issues), each part clickable on its own.
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';

export interface TilePart {
  label: string;
  value: number;
  onClick?: () => void;
}

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
  /** Parts of the value, shown under it. */
  parts?: TilePart[];
  /** One-line explanation behind the "i" icon. */
  info?: string;
}

export function StatTile({ label, value, sub, tone, active, onClick, aside, parts, info }: Props) {
  return (
    <div
      className={clsx(
        'relative flex min-w-0 flex-col rounded-card border bg-surface transition-colors',
        'hover:bg-primary-soft-100',
        tone === 'bad' ? 'border-bad' : active ? 'border-primary' : 'border-border',
        active && 'ring-2 ring-primary-soft',
      )}
    >
      {info && (
        <span className="absolute right-2 top-2 z-10">
          <InfoTip text={info} label={label} />
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="flex w-full items-center gap-2 rounded-card p-3 pb-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
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
        </span>
        {aside}
      </button>
      {parts && parts.length > 0 && (
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 px-3 text-table">
          {parts.map((p, i) => (
            <span key={p.label} className="inline-flex items-center gap-1">
              {i > 0 && (
                <span className="text-border" aria-hidden>
                  |
                </span>
              )}
              <span className="text-text-muted">{p.label}</span>
              <button
                type="button"
                onClick={p.onClick}
                disabled={!p.value || !p.onClick}
                title={`Open ${label}: ${p.label}`}
                className={clsx(
                  'font-heading font-bold tabular-nums hover:underline disabled:no-underline',
                  tone === 'bad' && p.value ? 'text-bad' : 'text-primary-dark',
                  !p.value && 'text-text-muted',
                )}
              >
                {p.value.toLocaleString('en-IN')}
              </button>
            </span>
          ))}
        </span>
      )}
      <span
        className="min-h-[14px] truncate px-3 pb-3 pt-0.5 text-table text-text-muted"
        title={sub}
      >
        {sub}
      </span>
    </div>
  );
}
