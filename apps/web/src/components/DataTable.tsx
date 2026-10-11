// Data table (SRS 6): sticky header, sort arrows, row hover, optional row click, totals row and
// pagination. Sorting is client-side unless `sorting` is controlled (server-sorted lists).
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import clsx from 'clsx';
import { useState } from 'react';
import { InfoTip } from './InfoTip';

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
  pagination?: { page: number; pageSize: number; total: number; onPage: (p: number) => void };
  maxHeight?: number;
  loading?: boolean;
  emptyText?: string;
  dense?: boolean;
  /** Extra classes and a hover note for a row (e.g. bulk-edit validation). */
  rowClassName?: (row: T) => string | undefined;
  rowTitle?: (row: T) => string | undefined;
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
}: Props<T>) {
  const [localSorting, setLocalSorting] = useState<SortingState>(initialSorting);
  const manual = controlledSorting !== undefined;
  const sorting = manual ? controlledSorting : localSorting;

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
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
  const pages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  return (
    <div className="min-w-0">
      <div
        className={clsx('overflow-auto', loading && 'opacity-60 transition-opacity')}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full border-separate border-spacing-0 font-body text-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sort = h.column.getIsSorted();
                  const meta = h.column.columnDef.meta as
                    { align?: string; info?: string } | undefined;
                  const align = meta?.align;
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={
                        sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined
                      }
                      className={clsx(
                        'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface font-heading text-label font-bold uppercase text-text-muted',
                        cell,
                        align === 'right' ? 'text-right' : 'text-left',
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
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                title={rowTitle?.(row.original)}
                className={clsx(
                  'hover:bg-primary-soft-100',
                  onRowClick && 'cursor-pointer',
                  rowClassName?.(row.original),
                )}
              >
                {row.getVisibleCells().map((c) => {
                  const align = (c.column.columnDef.meta as { align?: string } | undefined)?.align;
                  return (
                    <td
                      key={c.id}
                      className={clsx(
                        'border-b border-primary-soft-100 align-middle',
                        cell,
                        align === 'right' && 'text-right tabular-nums',
                      )}
                    >
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!data.length && (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-text-muted">
                  {loading ? 'Loading…' : emptyText}
                </td>
              </tr>
            )}
          </tbody>
          {showFooter && data.length > 0 && (
            <tfoot>
              {table.getFooterGroups().map((fg) => (
                <tr key={fg.id}>
                  {fg.headers.map((h) => {
                    const align = (h.column.columnDef.meta as { align?: string } | undefined)
                      ?.align;
                    return (
                      <td
                        key={h.id}
                        className={clsx(
                          'sticky bottom-0 border-t border-border bg-primary-soft-100 font-bold',
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
      </div>
      {pagination && pagination.total > pagination.pageSize && (
        <div className="flex items-center justify-end gap-3 pt-3">
          <span className="text-text-muted">
            {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total.toLocaleString('en-IN')}
          </span>
          <PageButton
            label="Previous page"
            disabled={pagination.page <= 1}
            onClick={() => pagination.onPage(pagination.page - 1)}
          >
            ‹
          </PageButton>
          <span className="font-heading text-button">
            {pagination.page} / {pages}
          </span>
          <PageButton
            label="Next page"
            disabled={pagination.page >= pages}
            onClick={() => pagination.onPage(pagination.page + 1)}
          >
            ›
          </PageButton>
        </div>
      )}
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
