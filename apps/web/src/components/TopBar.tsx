// Top bar (SRS 6): Nural logo, app name, KPI, Development and QA tabs, alerts, Live indicator, user
// menu.
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { toast } from 'sonner';
import { usePrefs, useResetLayout, useSavePrefs } from '../api/prefs';
import { useTourRequest } from '../features/tour/useGuidedTour';
import { voiceAvailable } from '../features/tour/voice';
import { ROLE_LABEL, useMe } from '../api/me';
import { initials } from '../features/dev/format';
import { useTheme, type ThemeChoice } from '../store/theme';
import type { Tab } from '../features/filters/toParams';
import { useLive } from '../store/live';
import { AlertsBell } from './AlertsBell';
import { LiveIndicator } from './LiveIndicator';

const TABS: { id: Tab; label: string }[] = [
  { id: 'kpi', label: 'KPI' },
  { id: 'dev', label: 'Development' },
  { id: 'qa', label: 'QA' },
  { id: 'support', label: 'Support' },
];

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  /** Full access only (NFR-4); members do not get the KPI tab. */
  kpiAllowed: boolean;
  /** The support team and management only. */
  supportAllowed: boolean;
  /** Tabs with what's new for this person (a dot after the name). */
  newTabs?: Set<Tab>;
}

export function TopBar({ tab, onTab, kpiAllowed, supportAllowed, newTabs }: Props) {
  return (
    <header className="chrome bg-chrome text-white">
      <div className="mx-auto flex h-14 max-w-page items-center gap-4 px-4 lg:gap-8 lg:px-6">
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-title">Nural</span>
          <span className="hidden text-h3 font-normal text-primary-soft-300 sm:inline">
            Dev and QA Dashboard
          </span>
        </div>
        <nav
          className="flex h-full items-stretch gap-2"
          role="tablist"
          aria-label="Dashboard"
          data-tour="tabs"
        >
          {TABS.filter(
            (t) => (t.id !== 'kpi' || kpiAllowed) && (t.id !== 'support' || supportAllowed),
          ).map((t) => (
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
              {newTabs?.has(t.id) && (
                <span
                  className="ml-1.5 inline-block h-2 w-2 rounded-full bg-accent align-super"
                  title="New here"
                  aria-label="new"
                />
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span data-tour="bell" className="flex">
            <AlertsBell onTab={onTab} />
          </span>
          <span data-tour="live" className="flex">
            <LiveIndicator />
          </span>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: JSX.Element }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="3" fill="currentColor" />
        <path
          d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
        <path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
        <rect
          x="1.5"
          y="2.5"
          width="13"
          height="9"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5.5 14h5M8 11.5V14"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

/** Sign out clears the session cookie and shows the signed-out page (sign in again from it). */
async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  window.location.href = '/api/auth/signed-out';
}

/**
 * The profile button: the person's monogram (Mohit Srivastava → MS). Its panel holds the name and
 * role, the theme (Light, Dark, System), live-update toasts and Sign out.
 */
function UserMenu() {
  const { data: me } = useMe();
  const toastsEnabled = useLive((s) => s.toastsEnabled);
  const setToastsEnabled = useLive((s) => s.setToastsEnabled);
  const theme = useTheme((s) => s.choice);
  const setTheme = useTheme((s) => s.set);
  const resetLayout = useResetLayout();
  const { data: prefs } = usePrefs();
  const savePrefs = useSavePrefs();
  const requestTour = useTourRequest((s) => s.request);
  const signedIn = me?.auth === 'bitrix';
  const name = signedIn ? me.name : 'Local copy';
  const monogram = signedIn ? initials(me.name) : 'LC';
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Profile: ${name}`}
        data-tour="profile"
        title={name}
        className="grid h-8 w-8 place-items-center rounded-full bg-primary font-heading text-button text-white ring-2 ring-white/20 hover:brightness-110"
      >
        {monogram}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-card border border-border bg-surface text-text shadow-pop"
        >
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary font-heading text-h3 text-white">
              {monogram}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-h3 text-primary-dark">{name}</span>
              <span className="block text-table text-text-muted">
                {me ? (signedIn ? ROLE_LABEL[me.role] : 'Sign-in off on this copy') : '…'}
              </span>
            </span>
          </div>

          <div className="space-y-2 border-b border-border p-4">
            <span className="block font-heading text-label uppercase text-text-muted">Theme</span>
            <div
              className="grid grid-cols-3 gap-1 rounded-control bg-primary-soft-100 p-1"
              role="radiogroup"
              aria-label="Theme"
            >
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  className={clsx(
                    'flex items-center justify-center gap-1.5 rounded py-1.5 font-heading text-button',
                    theme === t.value
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-text-muted hover:text-primary-dark',
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 p-4">
            <span>Show live update toasts</span>
            <input
              type="checkbox"
              checked={toastsEnabled}
              onChange={(e) => setToastsEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
          </label>

          <div className="space-y-2 border-t border-border p-4">
            <Popover.Close asChild>
              <button
                type="button"
                onClick={requestTour}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-control bg-primary font-heading text-button text-white hover:brightness-110"
              >
                Take the tour of this tab
              </button>
            </Popover.Close>
            {voiceAvailable() && (
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span>Read the tour aloud</span>
                <input
                  type="checkbox"
                  checked={!!prefs?.tour.voice}
                  onChange={(e) => {
                    const voice = e.target.checked;
                    savePrefs((p) => ({ tour: { ...p.tour, voice } }));
                  }}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
              </label>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border p-4">
            <span>
              Layout
              <span className="block text-table text-text-muted">
                Drag ⠿ to move tiles and cards
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                resetLayout();
                toast.success('Layout reset to the default order.');
              }}
              className="rounded-control border border-border px-3 py-1.5 font-heading text-button text-primary hover:border-primary"
            >
              Reset
            </button>
          </div>

          {signedIn && (
            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-control border border-border font-heading text-button text-bad hover:border-bad hover:bg-bad-soft/20"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                  <path
                    d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10.5 11l3-3-3-3M13.5 8H6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
