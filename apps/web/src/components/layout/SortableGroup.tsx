// Drag to rearrange (2026-10-11): one group of tiles, cards or sections. Items move only within
// their own group (each group is its own drag area), by the grip in the small toolbar that shows
// on hover, or with the keyboard (Space, arrows, Space). The toolbar also starts a guided tour of
// that data point and, for tiles and cards, hides it (sections cannot be hidden). The order, the
// pairs of cards side by side and the hidden data points are saved per person (api/prefs.ts).
// The rest closes up: tiles spread over the row, cards fill their rows (order.ts).
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { usePrefs, useSavePrefs } from '../../api/prefs';
import { usePointTour } from '../../features/tour/usePointTour';
import { applyOrder, pairOnDrop, rowSpans, type Pairs } from './order';
import { hiddenKey, useLayoutRegistry } from './registry';

export interface GroupItem {
  id: string;
  node: ReactNode;
  /** Classes of the item's slot, e.g. its grid width (lg:col-span-6). */
  className?: string;
}

interface Props {
  /** "<tab>.<group>", e.g. dev.cards: the key of the saved order. */
  group: string;
  items: GroupItem[];
  /** The group's own layout, e.g. its grid. */
  className?: string;
  /** What one item is: tile, card or section. Sections cannot be hidden. */
  noun: 'tile' | 'card' | 'section';
}

/**
 * Card widths are literal classes so Tailwind keeps them: `lg:col-span-6` etc. A card's default
 * width comes from its className; the shown width follows the row it lands in (order.ts).
 */
const SPAN: Record<string, Record<number, string>> = {
  lg: {
    4: 'lg:col-span-4',
    5: 'lg:col-span-5',
    6: 'lg:col-span-6',
    7: 'lg:col-span-7',
    8: 'lg:col-span-8',
    12: 'lg:col-span-12',
  },
  xl: {
    4: 'xl:col-span-4',
    5: 'xl:col-span-5',
    6: 'xl:col-span-6',
    7: 'xl:col-span-7',
    8: 'xl:col-span-8',
    12: 'xl:col-span-12',
  },
};
const SPAN_CLASS = /^(lg|xl):col-span-(\d+)$/;

/** "dev.cards" → "dev.pairs": the cards the person put side by side, saved as a flat list. */
const pairsKey = (group: string) => `${group.split('.')[0]}.pairs`;
const toPairs = (flat: string[] = []): Pairs =>
  flat.flatMap((id, i) =>
    i % 2 === 0 && flat[i + 1] ? [[id, flat[i + 1]!] as [string, string]] : [],
  );

export function SortableGroup({ group, items, className, noun }: Props) {
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  const register = useLayoutRegistry((s) => s.register);
  const unregister = useLayoutRegistry((s) => s.unregister);
  const allIds = items.map((i) => i.id);
  const key = allIds.join(',');
  // The Customise panel lists the data points of the groups on screen.
  useEffect(() => {
    register(group, noun, key ? key.split(',') : []);
    return () => unregister(group);
  }, [group, noun, key, register, unregister]);

  const hidden = new Set(noun === 'section' ? [] : (prefs?.layout[hiddenKey(group)] ?? []));
  const ids = applyOrder(allIds, prefs?.layout[group]);
  const shownIds = ids.filter((id) => !hidden.has(id));
  const byId = new Map(items.map((i) => [i.id, i]));
  // Cards in a 12-column grid fill their rows: widths follow the order (no gaps).
  const sized = items
    .map((i) => ({ id: i.id, m: i.className?.match(SPAN_CLASS) }))
    .filter((x): x is { id: string; m: RegExpMatchArray } => !!x.m);
  const bp = sized[0]?.m[1];
  const spans = new Map(sized.map((x) => [x.id, Number(x.m[2])]));
  const pairs = toPairs(prefs?.layout[pairsKey(group)]);
  const shown = bp && sized.length === items.length ? rowSpans(shownIds, spans, pairs) : undefined;
  const slotClass = (id: string) => {
    const w = shown?.get(id);
    return w && bp ? SPAN[bp]?.[w] : byId.get(id)?.className;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    // Hidden items keep their place in the saved order, after the visible ones moved.
    const nextShown = arrayMove(
      shownIds,
      shownIds.indexOf(String(active.id)),
      shownIds.indexOf(String(over.id)),
    );
    const next = [...nextShown, ...ids.filter((id) => hidden.has(id))];
    const paired = shown ? pairOnDrop(nextShown, spans, pairs, String(active.id)) : [];
    save((p) => ({
      layout: {
        ...p.layout,
        [group]: next,
        ...(shown && { [pairsKey(group)]: paired.flat() }),
      },
    }));
  };
  const hide = (id: string) =>
    save((p) => ({
      layout: {
        ...p.layout,
        [hiddenKey(group)]: [...new Set([...(p.layout[hiddenKey(group)] ?? []), id])],
      },
    }));

  // Tiles spread over the row: as many columns as tiles shown (wide screens).
  const style = noun === 'tile' ? ({ '--cols': shownIds.length } as CSSProperties) : undefined;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={shownIds} strategy={rectSortingStrategy}>
        <div className={className} style={style} data-group={group}>
          {shownIds.map((id) => (
            <Slot
              key={id}
              id={id}
              group={group}
              className={slotClass(id)}
              noun={noun}
              onHide={noun === 'section' ? undefined : () => hide(id)}
            >
              {byId.get(id)!.node}
            </Slot>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

const TOOL =
  'grid h-6 w-6 place-items-center rounded-full text-text-muted hover:bg-primary-soft-100 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

function Slot({
  id,
  group,
  className,
  noun,
  onHide,
  children,
}: {
  id: string;
  group: string;
  className?: string;
  noun: string;
  onHide?: () => void;
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
  } = useSortable({ id });
  const tour = usePointTour();
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-slot={id}
      className={clsx(
        'group/slot relative min-w-0 [&>*:first-child]:h-full',
        isDragging && 'z-30 opacity-80',
        className,
      )}
    >
      {children}
      {/* Toolbar on the top edge: move, guided tour of this data point, hide. */}
      <div
        data-toolbar
        className={clsx(
          'absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border border-border bg-surface px-1 shadow-sm transition-opacity',
          'opacity-0 focus-within:opacity-100 group-hover/slot:opacity-100',
          isDragging && 'opacity-100',
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Drag to move this ${noun}`}
          title={`Drag to move this ${noun}`}
          data-grip
          {...attributes}
          {...listeners}
          className={clsx(TOOL, 'cursor-grab touch-none active:cursor-grabbing')}
        >
          <svg width="14" height="8" viewBox="0 0 16 8" aria-hidden>
            {[2, 6, 10, 14].flatMap((x) =>
              [2, 6].map((y) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />
              )),
            )}
          </svg>
        </button>
        <button
          type="button"
          aria-label={`Guided tour of this ${noun}`}
          title={`Guided tour of this ${noun}`}
          data-point-tour
          onClick={() => tour(group, id)}
          className={TOOL}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M6.2 6.3a1.9 1.9 0 0 1 3.6.7c0 1.3-1.8 1.6-1.8 2.7M8 11.6v.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {onHide && (
          <button
            type="button"
            aria-label={`Hide this ${noun}`}
            title={`Hide this ${noun} (bring it back with Customise, bottom left)`}
            data-hide
            onClick={onHide}
            className={TOOL}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <circle cx="8" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
