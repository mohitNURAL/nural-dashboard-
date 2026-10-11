// Top bar (SRS 6): Nural logo, app name, KPI, Development and QA tabs, alerts, Live indicator, user
// menu.
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { ROLE_LABEL, useMe } from '../api/me';
import { useTheme, type ThemeChoice } from '../store/theme';
import type { Tab } from '../features/filters/toParams';
import { useLive } from '../store/live';
import { AlertsBell } from './AlertsBell';
import { LiveIndicator } from './LiveIndicator';

const TABS: { id: Tab; label: string }[] = [
  { id: 'kpi', label: 'KPI' },
  { id: 'dev', label: 'Development' },
  { id: 'qa', label: 'QA' },
];

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  /** Full access only (NFR-4); members do not get the KPI tab. */
  kpiAllowed: boolean;
}

export function TopBar({ tab, onTab, kpiAllowed }: Props) {
  return (
    <header className="chrome bg-chrome text-white">
      <div className="mx-auto flex h-14 max-w-page items-center gap-4 px-4 lg:gap-8 lg:px-6">
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-title">Nural</span>
          <span className="hidden text-h3 font-normal text-primary-soft-300 sm:inline">
            Dev and QA Dashboard
          </span>
        </div>
        <nav className="flex h-full items-stretch gap-2" role="tablist" aria-label="Dashboard">
          {TABS.filter((t) => t.id !== 'kpi' || kpiAllowed).map((t) => (
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
          <AlertsBell onTab={onTab} />
          <LiveIndicator />
          <ThemeSwitch />
          <SignedIn />
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

/** Light, Dark or System (follows the computer's setting); remembered in this browser. */
function ThemeSwitch() {
  const choice = useTheme((s) => s.choice);
  const set = useTheme((s) => s.set);
  return (
    <div className="flex rounded-full bg-white/10 p-0.5" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={choice === t.value}
          aria-label={`${t.label} theme`}
          title={`${t.label} theme`}
          onClick={() => set(t.value)}
          className={clsx(
            'grid h-7 w-7 place-items-center rounded-full',
            choice === t.value ? 'bg-white text-chrome' : 'text-primary-soft-300 hover:text-white',
          )}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

/** Sign out clears the session cookie and shows the signed-out page (sign in again from it). */
async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  window.location.href = '/api/auth/signed-out';
}

/** The signed-in name and a Sign out button; on a local copy, that sign-in is off. */
function SignedIn() {
  const { data: me } = useMe();
  if (!me) return null;
  if (me.auth !== 'bitrix') {
    return (
      <span
        className="hidden rounded-control border border-primary px-2 py-1 text-table text-primary-soft-300 md:inline"
        title="Sign in with Bitrix24 works on the live dashboard only; task changes are disabled here."
      >
        Local copy · sign-in off
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="hidden max-w-48 truncate text-body text-primary-soft-300 md:inline">
        {me.name} · {ROLE_LABEL[me.role]}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-control border border-primary-muted px-3 py-1 font-heading text-button text-white hover:bg-primary"
      >
        Sign out
      </button>
    </span>
  );
}

function UserMenu() {
  const { data: me } = useMe();
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
          {me?.auth === 'bitrix' && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="truncate font-bold">{me.name}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="shrink-0 font-heading text-button text-primary hover:underline"
              >
                Sign out
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
