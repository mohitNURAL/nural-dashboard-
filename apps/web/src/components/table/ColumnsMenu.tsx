// Columns menu (2026-10-12): tick the columns to show and drag them into order, like Customise
// does for tiles and cards. At least one column stays shown.
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { useState } from 'react';
import { IconGrip, IconSliders } from '../ui/icons';
import { Tip } from '../ui/Tip';
import { moveTo } from './useTableLayout';

export interface ColumnChoice {
  id: string;
  label: string;
  shown: boolean;
}

export function ColumnsMenu({
  columns,
  onOrder,
  onHidden,
  onReset,
}: {
  columns: ColumnChoice[];
  onOrder: (ids: string[]) => void;
  onHidden: (ids: string[]) => void;
  onReset: () => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const shown = columns.filter((c) => c.shown).length;
  const hidden = columns.filter((c) => !c.shown).map((c) => c.id);
  return (
    <Popover.Root>
      <Tip label="Columns" hint="Choose and order the columns" side="top">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Choose columns"
            className="btn btn-stroke inline-flex h-8 items-center gap-1.5 px-2.5"
          >
            <IconSliders size={15} />
            Columns
            {hidden.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 text-label">
                {shown}/{columns.length}
              </span>
            )}
          </button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-popup max-h-[70vh] w-64 overflow-auto rounded-card border border-border bg-surface p-2 text-text shadow-pop"
        >
          <p className="px-2 pt-1 font-heading text-h3 text-primary-dark">Columns</p>
          <p className="px-2 pb-2 text-table text-text-muted">Tick to show; drag ⠿ to order.</p>
          <ul>
            {columns.map((c) => (
              <li
                key={c.id}
                draggable
                onDragStart={(e) => {
                  setDrag(c.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag)
                    onOrder(
                      moveTo(
                        columns.map((x) => x.id),
                        drag,
                        c.id,
                      ),
                    );
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
                className={clsx(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-primary-soft-100',
                  drag === c.id && 'opacity-50',
                )}
              >
                <span className="cursor-grab text-text-muted" aria-hidden>
                  <IconGrip size={14} />
                </span>
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-table">
                  <input
                    type="checkbox"
                    checked={c.shown}
                    disabled={c.shown && shown === 1}
                    onChange={() =>
                      onHidden(c.shown ? [...hidden, c.id] : hidden.filter((h) => h !== c.id))
                    }
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {c.label || c.id}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onReset}
            className="btn btn-link mt-1 w-full justify-start px-2 py-1.5"
          >
            Reset columns
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
