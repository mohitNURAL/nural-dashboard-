// Top bar (SRS 6): Nural logo, app name, Development and QA tabs, Live indicator, user menu.
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import type { Tab } from '../features/filters/toParams';
import { useLive } from '../store/live';
import { LiveIndicator } from './LiveIndicator';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dev', label: 'Development' },
  { id: 'qa', label: 'QA' },
];

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
}

export function TopBar({ tab, onTab }: Props) {
  return (
    <header className="bg-primary-dark text-white">
      <div className="mx-auto flex h-14 max-w-page items-center gap-4 px-4 lg:gap-8 lg:px-6">
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-title">Nural</span>
          <span className="hidden text-h3 font-normal text-primary-soft-300 sm:inline">
            Dev and QA Dashboard
          </span>
        </div>
        <nav className="flex h-full items-stretch gap-2" role="tablist" aria-label="Dashboard">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={clsx(
                'border-b-[3px] px-3 font-heading text-h3 transition-colors',
                tab === t.id
                  ? 'border-accent text-white'
                  : 'border-transparent text-primary-muted hover:text-white',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <LiveIndicator />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function UserMenu() {
  const toastsEnabled = useLive((s) => s.toastsEnabled);
  const setToastsEnabled = useLive((s) => s.setToastsEnabled);
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="User menu"
        className="grid h-8 w-8 place-items-center rounded-full bg-primary text-white hover:bg-primary-muted"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="5.5" r="3" fill="currentColor" />
          <path d="M2 14c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" fill="currentColor" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-60 rounded-card border border-border bg-surface p-3 text-text shadow-pop"
        >
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>Show live update toasts</span>
            <input
              type="checkbox"
              checked={toastsEnabled}
              onChange={(e) => setToastsEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
          </label>
          <p className="mt-2 text-table text-text-muted">Sign in with Bitrix24 arrives later.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
