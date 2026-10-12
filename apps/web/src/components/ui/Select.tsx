// One dropdown for the whole dashboard (2026-10-12): the native select (keyboard, screen readers
// and phones work as people expect) in one look: same height, border, radius, focus ring and
// chevron everywhere. Takes every select attribute; `className` is for width and spacing only
// (it sizes to its content unless given a width, e.g. w-full in forms).
import clsx from 'clsx';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { IconChevron } from './icons';

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  size?: 'sm' | 'md';
};

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { size = 'md', className, children, ...rest },
  ref,
) {
  return (
    <span className={clsx('relative inline-flex min-w-[7rem]', className)}>
      <select
        ref={ref}
        {...rest}
        className={clsx(
          'w-full cursor-pointer appearance-none rounded-control border border-border bg-surface pl-3 pr-8 text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-8 text-table' : 'h-10 text-body',
        )}
      >
        {children}
      </select>
      <IconChevron
        size={13}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-text-muted"
      />
    </span>
  );
});
