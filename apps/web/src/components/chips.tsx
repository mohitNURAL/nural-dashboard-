// Small badges used in tables and the drawer (SRS 6: stage chip, tag chips, priority badge).
import clsx from 'clsx';
import type { Priority } from '../api/types';
import { initials } from '../features/dev/format';

export function StageChip({ title, color }: { title: string | null; color: string | null }) {
  if (!title) return <span className="text-text-muted">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-2 py-0.5 font-heading text-label text-text">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: color ?? 'var(--text-muted)' }}
        aria-hidden
      />
      {title}
    </span>
  );
}

export function TagChips({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((t) => (
        <span
          key={t}
          className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 font-heading text-label text-accent-darker"
        >
          {t}
        </span>
      ))}
      {tags.length > max && (
        <span
          className="font-heading text-label text-text-muted"
          title={tags.slice(max).join(', ')}
        >
          +{tags.length - max}
        </span>
      )}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  high: 'bg-bad-soft text-bad-dark',
  normal: 'bg-[#EFEEEE] text-text',
  low: 'bg-primary-soft text-primary',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={clsx(
        'rounded px-1.5 py-0.5 font-heading text-label font-bold uppercase',
        PRIORITY_STYLE[priority],
      )}
    >
      {priority}
    </span>
  );
}

export function Avatar({ name, highlight }: { name: string; highlight?: boolean }) {
  return (
    <span
      className={clsx(
        'grid h-7 w-7 shrink-0 place-items-center rounded-full border font-heading text-label font-bold',
        highlight
          ? 'border-primary bg-primary text-white'
          : 'border-primary-soft-300 bg-primary-soft-100 text-primary-dark',
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function CountBadge({ n, tone }: { n: number | undefined; tone?: 'bad' }) {
  if (n === undefined) return null;
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 font-heading text-label font-bold',
        tone === 'bad' ? 'bg-bad-soft text-bad-dark' : 'bg-primary-soft text-primary-dark',
      )}
    >
      {n.toLocaleString('en-IN')}
    </span>
  );
}

const STATUS_STYLE = {
  completed: 'bg-accent-soft text-accent-darker',
  pending: 'bg-warn/15 text-[#92400E]',
  hold: 'bg-[#EF3000]/10 text-[#B42400]',
} as const;
const STATUS_TEXT = { completed: 'Completed', pending: 'Pending', hold: 'On hold' } as const;

/** Completed / Pending / On hold (SRS 5). */
export function StatusChip({ status }: { status: 'completed' | 'pending' | 'hold' }) {
  return (
    <span
      className={clsx(
        'whitespace-nowrap rounded px-1.5 py-0.5 font-heading text-label font-bold',
        STATUS_STYLE[status],
      )}
    >
      {STATUS_TEXT[status]}
    </span>
  );
}
