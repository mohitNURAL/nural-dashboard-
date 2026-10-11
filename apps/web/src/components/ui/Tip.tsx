// Tooltip for icon buttons (2026-10-11): a short label, and an optional line below it, on hover
// and keyboard focus (Radix Tooltip, in the top bar's navy so it reads on light and dark alike).
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export function Tip({
  label,
  hint,
  side = 'top',
  children,
}: {
  label: string;
  hint?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** One element that takes a ref (a button). */
  children: ReactNode;
}) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className="z-[70] max-w-[240px] rounded-control bg-chrome px-2.5 py-1.5 font-heading text-button text-white shadow-pop data-[state=delayed-open]:animate-[tip-in_140ms_ease-out]"
        >
          {label}
          {hint && (
            <span className="mt-0.5 block font-body text-table font-normal text-primary-soft-300">
              {hint}
            </span>
          )}
          <Tooltip.Arrow className="fill-[var(--chrome)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
