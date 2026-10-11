// Drag to order a table's columns and rows (2026-10-12) with dnd-kit, like tiles, cards and the
// menu: pointer and keyboard, no browser drag image (the browser's own drag froze pages over the
// blurred focus view). One drag area per table; a column only lands among columns and a row
// among rows. Rows move by their grip; a header moves after a short drag, so a click still sorts.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import type { CSSProperties, HTMLAttributes, ReactNode, TdHTMLAttributes } from 'react';

export const COL = 'col:';
export const ROW = 'row:';

/** Only targets of the same kind: columns among columns, rows among rows. */
const sameKind: CollisionDetection = (args) => {
  const kind = String(args.active.id).slice(0, 4);
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(kind)),
  });
};

export function TableDnd({
  children,
  onColumn,
  onRow,
}: {
  children: ReactNode;
  onColumn: (id: string, over: string) => void;
  onRow: (id: string, over: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const a = String(active.id);
    const o = String(over.id);
    if (a.startsWith(COL) && o.startsWith(COL)) onColumn(a.slice(4), o.slice(4));
    if (a.startsWith(ROW) && o.startsWith(ROW)) onRow(a.slice(4), o.slice(4));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={sameKind} onDragEnd={onDragEnd}>
      {children}
    </DndContext>
  );
}

/** Moves along one axis only. */
const along = (axis: 'x' | 'y', t: { x: number; y: number } | null): CSSProperties =>
  t
    ? { transform: `translate3d(${axis === 'x' ? t.x : 0}px, ${axis === 'y' ? t.y : 0}px, 0)` }
    : {};

export function SortableTh({
  id,
  enabled,
  className,
  children,
  ...rest
}: { id: string; enabled: boolean } & HTMLAttributes<HTMLTableCellElement> & { scope?: string }) {
  const s = useSortable({ id: COL + id, disabled: !enabled });
  return (
    <th
      ref={s.setNodeRef}
      {...rest}
      {...(enabled ? { ...s.attributes, ...s.listeners } : {})}
      style={{
        ...along('x', s.transform),
        transition: s.transition,
        zIndex: s.isDragging ? 20 : undefined,
      }}
      className={className}
      data-dragging={s.isDragging || undefined}
    >
      {children}
    </th>
  );
}

export function SortableRow({
  id,
  enabled,
  grip,
  children,
  ...rest
}: {
  id: string;
  enabled: boolean;
  /** The grip cell, given the drag handle props. */
  grip: (
    handle: TdHTMLAttributes<HTMLTableCellElement> & { ref: (el: HTMLElement | null) => void },
  ) => ReactNode;
} & HTMLAttributes<HTMLTableRowElement>) {
  const s = useSortable({ id: ROW + id, disabled: !enabled });
  return (
    <tr
      ref={s.setNodeRef}
      {...rest}
      style={{
        ...along('y', s.transform),
        transition: s.transition,
        position: s.isDragging ? 'relative' : undefined,
        zIndex: s.isDragging ? 20 : undefined,
        boxShadow: s.isDragging ? '0 10px 24px rgba(16,24,64,0.18)' : undefined,
      }}
      data-dragging={s.isDragging || undefined}
    >
      {enabled && grip({ ref: s.setActivatorNodeRef, ...s.attributes, ...s.listeners })}
      {children}
    </tr>
  );
}
