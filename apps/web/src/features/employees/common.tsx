// Shared components of the Employee module: avatars, status pills, page heading.
import clsx from 'clsx';
import { initials } from '../dev/format';
import type { SignInStatus } from './api';
import { STATUS } from './labels';

/**
 * A round monogram in a flat brand fill (the same person always gets the same one): Primary 500,
 * Primary 700 or Secondary 500 with a navy label (Nural brand, 2026-10-29).
 */
const AVATAR_FILL = ['bg-primary text-white', 'bg-navy text-white', 'bg-accent text-on-accent'];
export function Avatar({ id, name, size = 32 }: { id: number; name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-heading font-bold',
        AVATAR_FILL[id % AVATAR_FILL.length],
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

export function StatusPill({ status }: { status: SignInStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-heading text-label font-bold ring-1',
        s.cls,
      )}
    >
      <span
        className={clsx(
          'h-1.5 w-1.5 rounded-full bg-current',
          status === 'active' && 'animate-pulse',
        )}
      />
      {s.label}
    </span>
  );
}
