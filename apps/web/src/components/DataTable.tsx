// Data table (SRS 6): sticky header, sort arrows, row hover, optional row click, totals row and
// pagination. Sorting is client-side unless `sorting` is controlled (server-sorted lists).
// With a `tableId` (2026-10-12) the reader shapes it: a Columns menu (show, hide, order), column
// headers dragged into another order, and rows dragged by the grip into their own order ("Your
// order"; a click on a sort header switches back to that sort). The header and totals rows never
// move. Saved per person (table/useTableLayout.ts).
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { InfoTip } from './InfoTip';
import { ColumnsMenu } from './table/ColumnsMenu';
import { dropRow, inOrder, moveTo, useTableLayout } from './table/useTableLayout';
import { SortableRow, SortableTh, TableDnd } from './table/sortable';
import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { IconGrip } from './ui/icons';
import { Select } from './ui/Select';

export type { SortingState };

/** Column list for DataTable. TanStack's accessor columns need `any` for the value type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Columns<T> = ColumnDef<T, any>[];

interface Props<T> {
  columns: Columns<T>;
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** Shown under the body when any column defines a `footer`. */
  showFooter?: boolean;
  /** Controlled sorting for server-sorted data. */
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
  initialSorting?: SortingState;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPage: (p: number) => void;
    /** Rows per page choice (e.g. 10, 25, 50, 100); omitted = fixed size. */
    onPageSize?: (n: number) => void;
    pageSizes?: number[];
  };
  maxHeight?: number;
  loading?: boolean;
  emptyText?: string;
  dense?: boolean;
  /** Extra classes and a hover note for a row (e.g. bulk-edit validation). */
  rowClassName?: (row: T) => string | undefined;
  rowTitle?: (row: T) => string | undefined;
  /** Lets the reader choose and order columns and order rows, saved under this id. */
  tableId?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  showFooter,
  sorting: controlledSorting,
  onSortingChange,
  initialSorting = [],
  pagination,
  maxHeight,
  loading,
  emptyText = 'Nothing matches these filters.',
  dense,
  rowClassName,
  rowTitle,
  tableId,
}: Props<T>) {
  const [localSorting, setLocalSorting] = useState<SortingState>(initialSorting);
  const manual = controlledSorting !== undefined;
  const lay = useTableLayout(tableId);
  // In "Your order" no sort arrow shows: the rows are in the reader's order.
  const sorting = lay.custom ? [] : manual ? controlledSorting : localSorting;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnOrder: lay.cols ?? [],
      columnVisibility: Object.fromEntries(lay.hidden.map((h) => [h, false])),
    },
    onSortingChange: (updater) => {
      if (lay.custom) lay.setCustom(false);
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (manual) onSortingChange?.(next);
      else setLocalSorting(next);
    },
    manualSorting: manual,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => String(rowKey(row)),
  });

  const cell = dense ? 'px-2 py-1.5' : 'px-3 py-2';
  const allIds = table.getAllLeafColumns().map((c) => c.id);
  const saved = lay.cols ?? [];
  const orderedIds = lay.cols
    ? [...saved.filter((id) => allIds.includes(id)), ...allIds.filter((id) => !saved.includes(id))]
    : allIds;
  const baseRows = table.getRowModel().rows;
  const rows = lay.custom ? inOrder(baseRows, (r) => r.id, lay.rows) : baseRows;
  const grip = lay.enabled;
  const pages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  return (
    <div className="min-w-0">
      {lay.enabled && (
        <div className="flex flex-wrap items-center justify-end gap-2 pb-2" data-no-export>
          {lay.rows.length > 0 && (
            <button
              type="button"
              aria-pressed={lay.custom}
              onClick={() => lay.setCustom(!lay.custom)}
              title={
                lay.custom ? 'Rows in your order; click to use the sort' : 'Put rows in your order'
              }
              className={clsx(
                'inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 font-heading text-button',
                lay.custom
                  ? 'border-accent bg-accent/10 text-accent-dark'
                  : 'border-border text-text-muted hover:border-primary hover:text-primary',
              )}
            >
              <IconGrip size={13} /> Your order
            </button>
          )}
          <ColumnsMenu
            columns={orderedIds.map((id) => {
              const c = table.getColumn(id)!;
              const h = c.columnDef.header;
              return { id, label: typeof h === 'string' ? h : '', shown: c.getIsVisible() };
            })}
            onOrder={lay.setCols}
            onHidden={lay.setHidden}
            onReset={lay.resetColumns}
          />
        </div>
      )}
      <div
        className={clsx(
          'nural-table-wrap overflow-auto',
          loading && 'opacity-60 transition-opacity',
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <TableDnd
          onColumn={(id, over) => lay.setCols(moveTo(orderedIds, id, over))}
          onRow={(id, over) =>
            lay.setRows(
              dropRow(
                rows.map((x) => x.id),
                lay.rows,
                id,
                over,
              ),
            )
          }
        >
          <table className="nural-table w-full border-separate border-spacing-0 font-body text-table">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {grip && (
                    <th
                      aria-label="Drag to order rows"
                      data-grip
                      className="sticky top-0 z-10 w-6 px-1"
                    />
                  )}
                  <SortableContext
                    items={hg.headers.map((h) => `col:${h.column.id}`)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {hg.headers.map((h) => {
                      const sort = h.column.getIsSorted();
                      const meta = h.column.columnDef.meta as
                        { align?: string; info?: string } | undefined;
                      const align = meta?.align;
                      return (
                        <SortableTh
                          key={h.id}
                          id={h.column.id}
                          enabled={lay.enabled}
                          title={lay.enabled ? 'Drag to move this column' : undefined}
                          scope="col"
                          aria-sort={
                            sort === 'asc'
                              ? 'ascending'
                              : sort === 'desc'
                                ? 'descending'
                                : undefined
                          }
                          className={clsx(
                            'sticky top-0 z-10 whitespace-nowrap font-heading text-label font-bold uppercase',
                            cell,
                            align === 'right' ? 'text-right' : 'text-left',
                            lay.enabled && 'cursor-grab active:cursor-grabbing',
                          )}
                        >
                          {h.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={h.column.getToggleSortingHandler()}
                              className={clsx(
                                'inline-flex items-center gap-1 uppercase hover:text-primary',
                                sort && 'text-primary-dark',
                              )}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              <span aria-hidden className="w-2">
                                {sort === 'asc' ? '▲' : sort === 'desc' ? '▼' : ''}
                              </span>
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                          {meta?.info && (
                            <span className="ml-1 inline-block">
                              <InfoTip
                                text={meta.info}
                                label={String(h.column.columnDef.header ?? '')}
                              />
                            </span>
                          )}
                        </SortableTh>
                      );
                    })}
                  </SortableContext>
                </tr>
              ))}
            </thead>
            <tbody>
              <SortableContext
                items={rows.map((x) => `row:${x.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {rows.map((row) => (
                  <SortableRow
                    key={row.id}
                    id={row.id}
                    enabled={grip}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    title={rowTitle?.(row.original)}
                    className={clsx(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                    grip={(handle) => (
                      <td
                        data-grip
                        {...handle}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Drag to move this row"
                        title="Drag to put rows in your own order"
                        className="w-6 cursor-grab touch-none px-1 text-text-muted/60 hover:text-primary active:cursor-grabbing"
                      >
                        <IconGrip size={13} />
                      </td>
                    )}
                  >
                    {row.getVisibleCells().map((c) => {
                      const align = (c.column.columnDef.meta as { align?: string } | undefined)
                        ?.align;
                      return (
                        <td
                          key={c.id}
                          className={clsx(
                            'align-middle',
                            cell,
                            align === 'right' && 'text-right tabular-nums',
                          )}
                        >
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </td>
                      );
                    })}
                  </SortableRow>
                ))}
              </SortableContext>
              {!data.length && (
                <tr>
                  <td
                    colSpan={columns.length + (grip ? 1 : 0)}
                    className="py-6 text-center text-text-muted"
                  >
                    {loading ? 'Loading…' : emptyText}
                  </td>
                </tr>
              )}
            </tbody>
            {showFooter && data.length > 0 && (
              <tfoot>
                {table.getFooterGroups().map((fg) => (
                  <tr key={fg.id}>
                    {grip && <td data-grip className="sticky bottom-0" />}
                    {fg.headers.map((h) => {
                      const align = (h.column.columnDef.meta as { align?: string } | undefined)
                        ?.align;
                      return (
                        <td
                          key={h.id}
                          className={clsx(
                            'sticky bottom-0 font-bold',
                            cell,
                            align === 'right' && 'text-right tabular-nums',
                          )}
                        >
                          {flexRender(h.column.columnDef.footer, h.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </TableDnd>
      </div>
      {pagination && pagination.total > 0 && <Pager {...pagination} pages={pages} />}
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-control border border-border text-h3 hover:border-primary disabled:opacity-40 disabled:hover:border-border"
    >
      {children}
    </button>
  );
}

/**
 * Rows per page (10, 25, 50, 100), the range shown, first / previous / next / last, and a page
 * box: type a page number and press Enter (or leave the box) to jump there.
 */
function Pager({
  page,
  pageSize,
  total,
  pages,
  onPage,
  onPageSize,
  pageSizes = [10, 25, 50, 100],
}: {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  pageSizes?: number[];
}) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);
  const go = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || n < 1) return setDraft(String(page));
    const target = Math.min(pages, n);
    setDraft(String(target));
    if (target !== page) onPage(target);
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      {onPageSize ? (
        <label className="flex items-center gap-2 text-text-muted">
          Rows per page
          <Select
            size="sm"
            aria-label="Rows per page"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {pageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <span className="text-text-muted">
          {((page - 1) * pageSize + 1).toLocaleString('en-IN')}–
          {Math.min(page * pageSize, total).toLocaleString('en-IN')} of{' '}
          {total.toLocaleString('en-IN')}
        </span>
        <PageButton label="First page" disabled={page <= 1} onClick={() => onPage(1)}>
          «
        </PageButton>
        <PageButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹
        </PageButton>
        <label className="flex items-center gap-1.5 font-heading text-button">
          Page
          <input
            type="number"
            min={1}
            max={pages}
            aria-label="Go to page"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            onBlur={go}
            className="h-8 w-14 rounded-control border border-border bg-surface px-1.5 text-center text-text focus:border-primary focus:outline-none"
          />
          of {pages.toLocaleString('en-IN')}
        </label>
        <PageButton label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          ›
        </PageButton>
        <PageButton label="Last page" disabled={page >= pages} onClick={() => onPage(pages)}>
          »
        </PageButton>
      </div>
    </div>
  );
}
