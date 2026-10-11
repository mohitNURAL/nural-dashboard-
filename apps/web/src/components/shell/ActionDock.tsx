// Action dock (2026-10-11): a floating glass bar at the right edge with the page's tools as icons,
// each named by a tooltip: Customise (which tiles and cards show), the guided tour of this page,
// reading the tour aloud, and resetting the layout.
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { usePrefs, useSavePrefs } from '../../api/prefs';
import { useTourRequest } from '../../features/tour/useGuidedTour';
import { voiceAvailable } from '../../features/tour/voice';
import { useCustomisable } from '../layout/customisable';
import { CustomisePanel } from '../layout/CustomiseView';
import { IconCompass, IconReset, IconSliders, IconSpeaker } from '../ui/icons';
import { Tip } from '../ui/Tip';

const BTN =
  'relative grid h-10 w-10 place-items-center rounded-xl text-text-muted transition hover:bg-primary-soft-100 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

function DockButton({
  label,
  hint,
  active,
  onClick,
  children,
  ...rest
}: {
  label: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  'data-tour'?: string;
}) {
  return (
    <Tip label={label} hint={hint} side="left">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={clsx(
          BTN,
          active && 'bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent',
        )}
        {...rest}
      >
        {children}
      </button>
    </Tip>
  );
}

export function ActionDock({ tourable }: { tourable: boolean }) {
  const { ready, hiddenCount } = useCustomisable();
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  const requestTour = useTourRequest((s) => s.request);
  const voice = !!prefs?.tour.voice;

  const reset = () => {
    const before = prefs?.layout ?? {};
    save(() => ({ layout: {} }));
    toast.success('Layout reset to the default', {
      description: 'Order, widths and hidden data points, on every tab.',
      action: { label: 'Undo', onClick: () => save(() => ({ layout: before })) },
    });
  };

  return (
    <div
      data-tour="dock"
      role="toolbar"
      aria-label="Page tools"
      aria-orientation="vertical"
      className="fixed right-3 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-border/80 bg-surface/80 p-1.5 shadow-pop backdrop-blur-md"
    >
      {ready && (
        <Popover.Root>
          <Tip label="Customise" hint="Choose the tiles and cards to show" side="left">
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label="Customise"
                data-tour="customise"
                className={clsx(
                  BTN,
                  'bg-gradient-to-br from-primary to-accent text-white hover:text-white hover:brightness-110',
                )}
              >
                <IconSliders />
                {hiddenCount > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">
                    {hiddenCount}
                  </span>
                )}
              </button>
            </Popover.Trigger>
          </Tip>
          <Popover.Portal>
            <Popover.Content
              side="left"
              align="center"
              sideOffset={12}
              collisionPadding={12}
              className="z-50 max-h-[75vh] w-80 overflow-auto rounded-card border border-border bg-surface text-text shadow-pop"
            >
              <CustomisePanel />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {tourable && (
        <DockButton label="Guided tour" hint="A walk through this page" onClick={requestTour}>
          <IconCompass />
        </DockButton>
      )}
      {voiceAvailable() && (
        <DockButton
          label={voice ? 'Voice on' : 'Voice off'}
          hint={voice ? 'Tours are read aloud' : 'Read tours aloud'}
          active={voice}
          onClick={() => save((p) => ({ tour: { ...p.tour, voice: !voice } }))}
        >
          <IconSpeaker on={voice} />
        </DockButton>
      )}
      {ready && (
        <>
          <span className="mx-2 my-0.5 h-px bg-border" />
          <DockButton
            label="Reset layout"
            hint="Default order and widths, nothing hidden"
            onClick={reset}
          >
            <IconReset />
          </DockButton>
        </>
      )}
    </div>
  );
}
