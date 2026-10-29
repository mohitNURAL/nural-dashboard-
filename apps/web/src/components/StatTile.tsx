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
  /**
   * A data point inside the number that is not one of its parts (e.g. Unassigned on the Pending
   * tile, 2026-10-16): its own amber line, clickable.
   */
  note?: TilePart;
}

export function StatTile({
  label,
  value,
  sub,
  tone,
  active,
  onClick,
  aside,
  parts,
  info,
  note,
}: Props) {
  return (
    <div
      className={clsx(
        'group/tile relative flex min-w-0 flex-col overflow-hidden rounded-card border bg-surface transition duration-200',
        'hover:border-primary-soft-300',
        tone === 'bad' ? 'border-bad' : active ? 'border-primary' : 'border-border',
        active && 'ring-2 ring-primary/30',
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
        className={clsx(
          'flex w-full items-center gap-2 rounded-card p-3 pb-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
          // Room for the "i" in the corner, so an aside (the ring) does not sit under it.
          info && 'pr-7',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          {/* Clear, not faded (2026-10-15): the name in bold Blue B500, the rest in body text. */}
          <span className="truncate font-heading text-label font-bold uppercase tracking-wide text-primary">
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
              <span className="font-medium text-text">{p.label}</span>
              <button
                type="button"
                onClick={p.onClick}
                disabled={!p.value || !p.onClick}
                title={`Open ${label}: ${p.label}`}
                className={clsx(
                  'font-heading font-bold tabular-nums hover:underline disabled:no-underline',
                  tone === 'bad' && p.value ? 'text-bad' : 'text-primary-dark',
                  !p.value && 'font-normal text-text',
                )}
              >
                {p.value.toLocaleString('en-IN')}
              </button>
            </span>
          ))}
        </span>
      )}
      {note && (
        <span className="px-3 pt-1 text-table">
          <button
            type="button"
            onClick={note.onClick}
            disabled={!note.value || !note.onClick}
            title={`Open ${label}: ${note.label}`}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-heading font-bold enabled:hover:underline',
              note.value ? 'bg-warn/15 text-warn' : 'bg-primary-soft-100 text-text-muted',
            )}
          >
            {note.label}
            <span className="tabular-nums">{note.value.toLocaleString('en-IN')}</span>
          </button>
        </span>
      )}
      <span
        className="min-h-[14px] truncate px-3 pb-3 pt-0.5 text-table font-medium text-text"
        title={sub}
      >
        {sub}
      </span>
    </div>
  );
}
