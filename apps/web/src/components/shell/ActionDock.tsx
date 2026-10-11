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
import { IconBook, IconCompass, IconReset, IconSliders, IconSpeaker } from '../ui/icons';
import { Tip } from '../ui/Tip';

/** The PDF guides (docs/guides, built by docs/guides/src; names in screenshots replaced). */
const GUIDES = [
  {
    file: 'Nural Dashboard - User guide.pdf',
    title: 'User guide',
    hint: 'The whole dashboard: signing in, finding your way, changing tasks, making it yours',
  },
  {
    file: 'Nural Dashboard - Module guide.pdf',
    title: 'Module guide',
    hint: 'Page by page: who can open it and what every tile, card and list shows',
  },
];

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
      <Popover.Root>
        <Tip label="Guides" hint="User guide and Module guide (PDF)" side="left">
          <Popover.Trigger asChild>
            <button type="button" aria-label="Guides" data-tour="guides" className={BTN}>
              <IconBook />
            </button>
          </Popover.Trigger>
        </Tip>
        <Popover.Portal>
          <Popover.Content
            side="left"
            align="center"
            sideOffset={12}
            collisionPadding={12}
            className="z-50 w-80 rounded-card border border-border bg-surface p-2 text-text shadow-pop"
          >
            <p className="px-2 pb-2 pt-1 font-heading text-h3 text-primary-dark">Guides</p>
            {GUIDES.map((g) => (
              <a
                key={g.file}
                href={`/guides/${encodeURIComponent(g.file)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 rounded-control p-2 hover:bg-primary-soft-100"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-white">
                  <IconBook size={18} />
                </span>
                <span>
                  <span className="block font-heading text-button text-primary-dark">
                    {g.title}
                  </span>
                  <span className="block text-table text-text-muted">{g.hint}</span>
                </span>
              </a>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
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
