// Stat tile (SRS 6): label, big number, sub-line, optional status colour; clickable.
import clsx from 'clsx';

interface Props {
  label: string;
  value: number | undefined;
  sub?: string;
  tone?: 'bad';
  active?: boolean;
  onClick?: () => void;
}

export function StatTile({ label, value, sub, tone, active, onClick }: Props) {
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
      <span className="truncate font-heading text-label uppercase text-text-muted">{label}</span>
      {value === undefined ? (
        <span className="skeleton mt-2 h-7 w-16" />
      ) : (
        <span
          className={clsx(
            'mt-1 font-heading text-tile',
            tone === 'bad' ? 'text-bad' : 'text-primary-dark',
          )}
        >
          {value.toLocaleString('en-IN')}
        </span>
      )}
      <span className="min-h-[14px] truncate text-table text-text-muted" title={sub}>
        {sub}
      </span>
    </button>
  );
}
