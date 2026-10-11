// Side drawer (2026-10-11): the one place to move around. Closed it is a rail of icons; hovering
// (or keyboard focus) slides it open over the page and leaving closes it. The menu button pins it
// open, pushing the page aside, until it is clicked again (remembered in this browser). Each group
// folds shut from its header (remembered too). On small screens it opens from the top bar's menu
// button instead.
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { Tab } from '../../features/filters/toParams';
import { IconChevron, IconMenu, IconPin } from '../ui/icons';
import { Tip } from '../ui/Tip';
import { RAIL, useDrawer, useFolded, WIDE } from './drawerStore';
import type { NavGroup } from './nav';

export function SideDrawer({
  groups,
  tab,
  onTab,
  newTabs,
}: {
  groups: NavGroup[];
  tab: Tab;
  onTab: (t: Tab) => void;
  newTabs?: Set<Tab>;
}) {
  const { pinned, setPinned, mobileOpen, setMobileOpen } = useDrawer();
  const { folded, toggle: toggleFold } = useFolded();
  const [hover, setHover] = useState(false);
  const open = pinned || hover || mobileOpen;
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 top-14 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
        />
      )}
      <aside
        data-tour="drawer"
        aria-label="Menu"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(false);
        }}
        style={{ width: open ? WIDE : RAIL }}
        className={clsx(
          'chrome fixed bottom-0 left-0 top-14 z-50 flex flex-col overflow-hidden border-r border-white/10 bg-chrome text-white transition-[width,box-shadow,transform] duration-200 ease-out',
          open && !pinned && 'shadow-[8px_0_32px_rgba(0,0,0,0.35)]',
          // Small screens: hidden until opened from the top bar.
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <Tip
            label={pinned ? 'Unpin the menu' : 'Pin the menu open'}
            hint={
              pinned ? 'It closes when the mouse leaves' : 'It stays open until you click again'
            }
            side="right"
          >
            <button
              type="button"
              onClick={() => {
                setPinned(!pinned);
                setMobileOpen(false);
              }}
              aria-pressed={pinned}
              aria-label={pinned ? 'Unpin the menu' : 'Pin the menu open'}
              className={clsx(
                'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition',
                pinned
                  ? 'bg-accent/20 text-accent'
                  : 'text-primary-soft-300 hover:bg-white/10 hover:text-white',
              )}
            >
              {pinned ? <IconPin /> : <IconMenu />}
            </button>
          </Tip>
          <span
            className={clsx(
              'whitespace-nowrap font-heading text-label uppercase tracking-[0.14em] text-primary-soft-300 transition-opacity duration-150',
              open ? 'opacity-100' : 'opacity-0',
            )}
          >
            {pinned ? 'Menu pinned' : 'Menu'}
          </span>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 pb-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="relative mb-1.5 h-6">
                <span
                  className={clsx(
                    'absolute inset-x-1 top-1/2 h-px bg-white/10 transition-opacity',
                    open ? 'opacity-0' : 'opacity-100',
                  )}
                />
                <button
                  type="button"
                  onClick={() => toggleFold(g.label)}
                  aria-expanded={!folded.includes(g.label)}
                  tabIndex={open ? 0 : -1}
                  className={clsx(
                    'absolute inset-x-0 top-0 flex h-6 items-center justify-between rounded-lg px-2 font-heading text-label uppercase tracking-[0.14em] text-primary-soft-300/80 transition hover:bg-white/[0.06] hover:text-white',
                    open ? 'opacity-100' : 'pointer-events-none opacity-0',
                  )}
                >
                  <span className="whitespace-nowrap">{g.label}</span>
                  <IconChevron
                    size={14}
                    className={clsx(
                      'transition-transform',
                      !folded.includes(g.label) && 'rotate-90',
                    )}
                  />
                </button>
              </div>
              <ul className="space-y-1">
                {g.items
                  // A folded group still shows the page you are on.
                  .filter((item) => !folded.includes(g.label) || item.id === tab)
                  .map((item) => {
                    const active = item.id === tab;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onTab(item.id);
                            setMobileOpen(false);
                          }}
                          aria-current={active ? 'page' : undefined}
                          aria-label={item.label}
                          data-nav={item.id}
                          className={clsx(
                            'group/nav relative flex h-11 w-full items-center gap-3 rounded-xl pl-2.5 text-left transition',
                            active
                              ? 'bg-gradient-to-r from-accent/25 to-primary/20 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                              : 'text-primary-soft-300 hover:bg-white/[0.07] hover:text-white',
                          )}
                        >
                          {active && (
                            <span className="absolute -left-3 top-2 h-7 w-1 rounded-r-full bg-accent shadow-[0_0_12px_var(--accent)]" />
                          )}
                          <span
                            className={clsx(
                              'relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition',
                              active ? 'text-accent' : 'group-hover/nav:scale-110',
                            )}
                          >
                            {item.icon}
                            {newTabs?.has(item.id) && (
                              <span
                                aria-label="new"
                                className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-[var(--chrome)]"
                              />
                            )}
                          </span>
                          <span
                            className={clsx(
                              'min-w-0 transition-[opacity,transform] duration-150',
                              open ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0',
                            )}
                          >
                            <span className="block truncate font-heading text-h3">
                              {item.label}
                            </span>
                            <span className="block truncate text-table text-primary-soft-300/80">
                              {item.hint}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <div
          className={clsx(
            'shrink-0 border-t border-white/10 px-4 py-3 text-table text-primary-soft-300/70 transition-opacity',
            open ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span className="whitespace-nowrap">Hover to open · click ☰ to pin</span>
        </div>
      </aside>
    </>
  );
}
