// Top bar (SRS 6): Nural logo, where you are (Dashboard › QA), alerts, Live indicator and the
// profile menu. Navigation is in the side drawer (2026-10-11); page tools in the right-hand dock.
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { ROLE_LABEL, useMe } from '../api/me';
import { initials } from '../features/dev/format';
import { useTheme, type ThemeChoice } from '../store/theme';
import type { Tab } from '../features/filters/toParams';
import { useLive } from '../store/live';
import { AlertsBell } from './AlertsBell';
import { LiveIndicator } from './LiveIndicator';
import { crumbs } from './shell/nav';
import { useDrawer } from './shell/drawerStore';
import { IconChevron, IconMenu } from './ui/icons';
import { Tip } from './ui/Tip';

export function TopBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const [group, page] = crumbs(tab);
  const openMenu = useDrawer((s) => s.setMobileOpen);
  return (
    <header className="chrome sticky top-0 z-[45] bg-chrome text-white shadow-[0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex h-14 items-center gap-3 px-3 md:pl-5 lg:gap-6 lg:pr-6">
        <button
          type="button"
          aria-label="Open the menu"
          onClick={() => openMenu(true)}
          className="grid h-10 w-10 place-items-center rounded-xl text-primary-soft-300 hover:bg-white/10 hover:text-white md:hidden"
        >
          <IconMenu />
        </button>
        {/* Nural Pulse: the live heartbeat of every project and person. */}
        <div className="flex items-center gap-2" aria-label="Nural Pulse">
          <span className="bg-gradient-to-r from-white to-primary-soft-300 bg-clip-text font-heading text-title text-transparent">
            Nural
          </span>
          <span className="relative flex items-center gap-1.5 font-heading text-title font-extrabold text-accent">
            Pulse
            <span aria-hidden className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
          </span>
        </div>
        <nav aria-label="You are here" className="hidden items-center gap-1.5 sm:flex">
          <span className="h-5 w-px bg-white/15" />
          <span className="pl-2 font-heading text-button uppercase tracking-wider text-primary-soft-300">
            {group}
          </span>
          <IconChevron size={14} className="text-primary-soft-300/60" />
          <span className="font-heading text-h3 text-white" aria-current="page">
            {page}
          </span>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Tip label="Alerts" hint="Overdue and stuck tasks" side="bottom">
            <span data-tour="bell" className="flex">
              <AlertsBell onTab={onTab} />
            </span>
          </Tip>
          <Tip label="Live updates" hint="Changes in Bitrix24 arrive in seconds" side="bottom">
            <span data-tour="live" className="flex">
              <LiveIndicator />
            </span>
          </Tip>
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

/**
 * Sign out clears the session cookie and goes straight to Sign in with Bitrix24, as on the first
 * visit. A browser still signed in to Bitrix24 comes straight back to the dashboard.
 */
async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  window.location.href = '/api/auth/login';
}

/**
 * The profile button: the person's monogram (Mohit Srivastava → MS). Its panel holds the name and
 * role, the theme (Light, Dark, System), live-update toasts and Sign out. The tour, voice and
 * layout tools are in the right-hand dock.
 */
function UserMenu() {
  const { data: me } = useMe();
  const toastsEnabled = useLive((s) => s.toastsEnabled);
  const setToastsEnabled = useLive((s) => s.setToastsEnabled);
  const theme = useTheme((s) => s.choice);
  const setTheme = useTheme((s) => s.set);
  const signedIn = me?.auth === 'bitrix';
  const name = signedIn ? me.name : 'Local copy';
  const monogram = signedIn ? initials(me.name) : 'LC';
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Profile: ${name}`}
        data-tour="profile"
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
