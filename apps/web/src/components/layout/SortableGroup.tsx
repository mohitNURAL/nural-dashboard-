// Drag to rearrange (2026-10-11): one group of tiles, cards or sections. Items move only within
// their own group (each group is its own drag area), by the grip that shows on hover, or with the
// keyboard (Space, arrows, Space). The order is saved per person (api/prefs.ts).
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
import type { ReactNode } from 'react';
import { usePrefs, useSavePrefs } from '../../api/prefs';
import { applyOrder, pairOnDrop, rowSpans, type Pairs } from './order';

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
  /** What one item is, for the grip's label: tile, card or section. */
  noun: string;
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
  const ids = applyOrder(
    items.map((i) => i.id),
    prefs?.layout[group],
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  // Cards in a 12-column grid fill their rows: widths follow the order (no gaps).
  const sized = items
    .map((i) => ({ id: i.id, m: i.className?.match(SPAN_CLASS) }))
    .filter((x): x is { id: string; m: RegExpMatchArray } => !!x.m);
  const bp = sized[0]?.m[1];
  const spans = new Map(sized.map((x) => [x.id, Number(x.m[2])]));
  const pairs = toPairs(prefs?.layout[pairsKey(group)]);
  const shown = bp && sized.length === items.length ? rowSpans(ids, spans, pairs) : undefined;
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
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    const paired = shown ? pairOnDrop(next, spans, pairs, String(active.id)) : [];
    save((p) => ({
      layout: {
        ...p.layout,
        [group]: next,
        ...(shown && { [pairsKey(group)]: paired.flat() }),
      },
    }));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className} data-group={group}>
          {ids.map((id) => {
            const item = byId.get(id)!;
            return (
              <Slot key={id} id={id} className={slotClass(id)} noun={noun}>
                {item.node}
              </Slot>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Slot({
  id,
  className,
  noun,
  children,
}: {
  id: string;
  className?: string;
  noun: string;
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
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Drag to move this ${noun}`}
        title={`Drag to move this ${noun}`}
        data-grip
        {...attributes}
        {...listeners}
        className={clsx(
          'absolute left-1/2 top-0 z-10 flex h-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center rounded-full border border-border bg-surface px-1.5 text-text-muted shadow-sm hover:text-primary active:cursor-grabbing',
          'opacity-0 transition-opacity focus-visible:opacity-100 group-hover/slot:opacity-100',
          isDragging && 'opacity-100',
        )}
      >
        <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden>
          {[2, 6, 10, 14].flatMap((x) =>
            [2, 6].map((y) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="currentColor" />
            )),
          )}
        </svg>
      </button>
    </div>
  );
}
