// One dropdown for the whole dashboard (2026-10-12): the native select (keyboard, screen readers
// and phones work as people expect) in one look: same height, border, radius, focus ring and
// chevron everywhere. Takes every select attribute; `className` is for width and spacing only
// (it sizes to its content unless given a width, e.g. w-full in forms).
// The closed box of the search dropdowns (SearchCombobox, DateRangePicker) uses the same
// DROPDOWN_BOX and DropdownChevron (2026-10-14), so every dropdown looks and behaves alike.
import clsx from 'clsx';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { IconChevron } from './icons';

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  size?: 'sm' | 'md';
};

/** Border, background, hover and focus of every dropdown's closed box (height set apart). */
export const DROPDOWN_BOX =
  'rounded-control border bg-surface text-text outline-none transition hover:border-primary-muted focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50';

/** Heights: md (forms, filter bar) and sm (inside cards and tables). */
export const DROPDOWN_SIZE = { sm: 'h-8 text-table', md: 'h-10 text-body' } as const;

/** The chevron at the right of every dropdown. */
export function DropdownChevron({ className }: { className?: string }) {
  return (
    <IconChevron
      size={13}
      aria-hidden
      className={clsx('pointer-events-none shrink-0 rotate-90 text-text-muted', className)}
    />
  );
}

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
          'w-full cursor-pointer appearance-none border-border pl-3 pr-8',
          DROPDOWN_BOX,
          DROPDOWN_SIZE[size],
        )}
      >
        {children}
      </select>
      <DropdownChevron className="absolute right-3 top-1/2 -translate-y-1/2" />
    </span>
  );
});
