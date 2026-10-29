// Side drawer (2026-10-11, modules 2026-10-12): the one place to move around. Closed it is a rail
// of icons; hovering (or keyboard focus) slides it open over the page and leaving closes it. The
// menu button pins it open, pushing the page aside, until it is clicked again (remembered in this
// browser). On small screens it opens from the top bar's menu button instead.
// Menu modules (Dashboard, Insights, Employees, ...) have an icon and a bold name; the module of
// the page you are on is highlighted and open, the others folded (one open at a time; a click on a
// module's header opens or closes it). Modules can be dragged into another order, and pages within
// their own module only (each module is its own drag area). The order is saved per person.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePrefs, useSavePrefs } from '../../api/prefs';
import type { Tab } from '../../features/filters/toParams';
import { applyOrder } from '../layout/order';
import { IconChevron, IconGrip, IconMenu, IconPin } from '../ui/icons';
import { Tip } from '../ui/Tip';
import { RAIL, useDrawer, useMenuModule, WIDE } from './drawerStore';
import { moduleOf, type NavGroup, type NavItem } from './nav';

/** Saved order keys: the modules, and the pages of each module. */
export const MENU_MODULES = 'menu.modules';
const pagesKey = (module: string) => `menu.${module}`;

function useSensorsForMenu() {
  return useSensors(
    // A short move starts a drag, so a click still opens the page.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

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
  const { open: openModule, setOpen: setOpenModule } = useMenuModule();
  const [hover, setHover] = useState(false);
  const open = pinned || hover || mobileOpen;
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  const sensors = useSensorsForMenu();

  // The page's own module opens whenever the page changes; the others fold.
  const current = moduleOf(tab) ?? null;
  useEffect(() => setOpenModule(current), [current, setOpenModule]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, setMobileOpen]);

  // The person's order of modules and of the pages in each.
  const layout = prefs?.layout;
  const ordered = useMemo(() => {
    const byLabel = new Map(groups.map((g) => [g.label, g]));
    return applyOrder(
      groups.map((g) => g.label),
      layout?.[MENU_MODULES],
    ).map((label) => {
      const g = byLabel.get(label)!;
      const byId = new Map(g.items.map((i) => [i.id, i]));
      const items = applyOrder(
        g.items.map((i) => i.id),
        layout?.[pagesKey(label)],
      ).map((id) => byId.get(id as Tab)!);
      return { ...g, items };
    });
  }, [groups, layout]);

  const onModuleDrop = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = ordered.map((g) => g.label);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    save((p) => ({ layout: { ...p.layout, [MENU_MODULES]: next } }));
  };
  const onPageDrop =
    (g: NavGroup) =>
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const ids = g.items.map((i) => i.id as string);
      const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
      save((p) => ({ layout: { ...p.layout, [pagesKey(g.label)]: next } }));
    };

  const go = (id: Tab) => {
    onTab(id);
    setMobileOpen(false);
  };

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 top-14 z-40 overlay md:hidden"
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
              'whitespace-nowrap font-heading text-label uppercase text-primary-soft-300 transition-opacity duration-150',
              open ? 'opacity-100' : 'opacity-0',
            )}
          >
            {pinned ? 'Menu pinned' : 'Menu'}
          </span>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden px-3 pb-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onModuleDrop}>
            <SortableContext
              items={ordered.map((g) => g.label)}
              strategy={verticalListSortingStrategy}
            >
              {ordered.map((g) => (
                <Module
                  key={g.label}
                  group={g}
                  drawerOpen={open}
                  expanded={openModule === g.label}
                  current={current === g.label}
                  onToggle={() => setOpenModule(openModule === g.label ? null : g.label)}
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onPageDrop(g)}
                  >
                    <SortableContext
                      items={g.items.map((i) => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {g.items.map((item) => (
                        <Page
                          key={item.id}
                          item={item}
                          active={item.id === tab}
                          drawerOpen={open}
                          isNew={!!newTabs?.has(item.id)}
                          onOpen={() => go(item.id)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </Module>
              ))}
            </SortableContext>
          </DndContext>
        </nav>

        <div
          className={clsx(
            'shrink-0 border-t border-white/10 px-4 py-3 text-table text-primary-soft-300/70 transition-opacity',
            open ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span className="whitespace-nowrap">Hover to open · ⠿ drag to reorder</span>
        </div>
      </aside>
    </>
  );
}

function Module({
  group,
  drawerOpen,
  expanded,
  current,
  onToggle,
  children,
}: {
  group: NavGroup;
  drawerOpen: boolean;
  expanded: boolean;
  current: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.label });
  return (
    <section
      ref={setNodeRef}
      data-module={group.label}
      data-folded={expanded ? undefined : 'true'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx('relative rounded-2xl', isDragging && 'z-10 bg-white/[0.06] shadow-lg')}
    >
      <div className="group/mod relative flex items-center">
        {current && <span className="absolute -left-3 top-2 h-7 w-1 rounded-r-full bg-accent" />}
        <button
          type="button"
          data-module-head
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${group.label} module`}
          className={clsx(
            'flex h-11 w-full items-center gap-3 rounded-xl pl-2.5 pr-2 text-left transition',
            current
              ? 'text-white underline decoration-white decoration-2 underline-offset-[6px]'
              : 'text-primary-soft-300 hover:bg-white/[0.07] hover:text-white',
          )}
        >
          <span
            className={clsx(
              'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition',
              current ? 'text-white' : '',
            )}
          >
            {group.icon}
          </span>
          <span
            className={clsx(
              'flex-1 truncate font-heading text-h3 font-extrabold tracking-wide transition-opacity duration-150',
              drawerOpen ? 'opacity-100' : 'opacity-0',
            )}
          >
            {group.label}
          </span>
          <IconChevron
            size={14}
            className={clsx(
              'shrink-0 transition-[transform,opacity]',
              expanded && 'rotate-90',
              drawerOpen ? 'opacity-70' : 'opacity-0',
            )}
          />
        </button>
        {drawerOpen && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag to move the ${group.label} module`}
            className="absolute right-8 grid h-7 w-5 cursor-grab place-items-center rounded text-primary-soft-300 opacity-0 transition hover:text-white focus-visible:opacity-100 group-hover/mod:opacity-80 active:cursor-grabbing"
          >
            <IconGrip size={14} />
          </button>
        )}
      </div>
      {/* Folded modules keep their pages in the page (for links and the tour), out of sight. */}
      <div
        className={clsx(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
        aria-hidden={!expanded}
        // React 18 has no `inert` prop: set it on the element.
        ref={(el) => {
          if (el) el.toggleAttribute('inert', !expanded);
        }}
      >
        <ul
          className={clsx(
            'min-h-0 space-y-1 overflow-hidden',
            drawerOpen && 'ml-4 border-l border-white/10 pl-2',
            expanded && 'pt-1',
          )}
        >
          {children}
        </ul>
      </div>
    </section>
  );
}

function Page({
  item,
  active,
  drawerOpen,
  isNew,
  onOpen,
}: {
  item: NavItem;
  active: boolean;
  drawerOpen: boolean;
  isNew: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx('group/nav relative', isDragging && 'z-10')}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        data-nav={item.id}
        className={clsx(
          'relative flex h-10 w-full items-center gap-3 rounded-xl pl-1.5 text-left transition',
          active
            ? 'text-white underline decoration-white decoration-2 underline-offset-[6px]'
            : 'text-primary-soft-300 hover:bg-white/[0.07] hover:text-white',
          isDragging && 'bg-white/10 shadow-lg',
        )}
      >
        <span
          className={clsx(
            'relative grid h-7 w-7 shrink-0 place-items-center rounded-lg transition [&>svg]:h-[18px] [&>svg]:w-[18px]',
            active ? 'text-white' : '',
          )}
        >
          {item.icon}
          {isNew && (
            <span
              aria-label="new"
              className="absolute right-0 top-0 h-2 w-2 rounded-full bg-accent ring-2 ring-[var(--chrome)]"
            />
          )}
        </span>
        <span
          className={clsx(
            'min-w-0 flex-1 pr-6 transition-[opacity,transform] duration-150',
            drawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0',
          )}
        >
          <span className={clsx('block truncate font-heading text-button', active && 'font-bold')}>
            {item.label}
          </span>
          <span className="block truncate text-[12px] leading-tight text-primary-soft-300/70">
            {item.hint}
          </span>
        </span>
      </button>
      {drawerOpen && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to move ${item.label} within its module`}
          className="absolute right-1 top-1/2 grid h-7 w-5 -translate-y-1/2 cursor-grab place-items-center rounded text-primary-soft-300 opacity-0 transition hover:text-white focus-visible:opacity-100 group-hover/nav:opacity-80 active:cursor-grabbing"
        >
          <IconGrip size={14} />
        </button>
      )}
    </li>
  );
}
