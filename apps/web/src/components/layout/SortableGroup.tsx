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
import { applyOrder } from './order';

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

export function SortableGroup({ group, items, className, noun }: Props) {
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  const ids = applyOrder(
    items.map((i) => i.id),
    prefs?.layout[group],
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    save((p) => ({ layout: { ...p.layout, [group]: next } }));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className} data-group={group}>
          {ids.map((id) => {
            const item = byId.get(id)!;
            return (
              <Slot key={id} id={id} className={item.className} noun={noun}>
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
