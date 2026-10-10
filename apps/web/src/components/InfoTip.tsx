// A small "i" next to a number or title that explains, in one line, how it is worked out, and
// under it what the current filters cover. Opens on hover and on keyboard focus (Radix Tooltip).
import * as Tooltip from '@radix-ui/react-tooltip';
import { useInfoContext } from './infoContext';

export function InfoTip({ text, label }: { text: string; label?: string }) {
  const showing = useInfoContext();
  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label ? `About ${label}` : 'About this number'}
          onClick={(e) => e.stopPropagation()}
          className="inline-grid h-3.5 w-3.5 shrink-0 cursor-help place-items-center rounded-full border border-current align-middle font-heading text-[9px] font-bold normal-case leading-none tracking-normal text-text-muted hover:text-primary focus-visible:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          i
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-w-[260px] rounded-control bg-primary-dark px-2.5 py-1.5 font-body text-table normal-case leading-snug tracking-normal text-white shadow-pop"
        >
          {text}
          {showing && <span className="mt-1 block text-primary-soft-300">{showing}</span>}
          <Tooltip.Arrow className="fill-[var(--primary-dark)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
