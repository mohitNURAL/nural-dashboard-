// Shared components of the Employee module: avatars, status pills, page heading.
import clsx from 'clsx';
import { initials } from '../dev/format';
import type { SignInStatus } from './api';
import { STATUS } from './labels';

/** A round monogram in a colour of its own (the same person always gets the same colour). */
export function Avatar({ id, name, size = 32 }: { id: number; name: string; size?: number }) {
  const hue = (id * 47) % 360;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-heading font-bold text-white shadow-sm"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 55% 52%), hsl(${(hue + 40) % 360} 60% 40%))`,
      }}
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

/** Page heading of the Employee module. */
export function PageHead({
  title,
  sub,
  icon,
  children,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-pop">
        {icon}
      </span>
      <div className="min-w-0">
        <h1 className="font-heading text-title text-primary-dark">{title}</h1>
        <p className="text-text-muted">{sub}</p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
