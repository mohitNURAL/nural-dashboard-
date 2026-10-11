// Paginated, server-sorted task list for accordions (DEV-06..08, QA-08..09). Row click opens
// the drawer.
import { useEffect, useMemo, useState } from 'react';
import type { TaskRow } from '../../api/types';
import { DataTable, type Columns, type SortingState } from '../../components/DataTable';
import { taskExportUrl, useOpenTask, useTaskList, type TaskListKind, type TaskSort } from './api';
import { createColumnHelper } from '@tanstack/react-table';
import { BoardsContext } from './boards';
import { bulkRowClass, useBulk } from './bulk';
import { BulkBar, SelectAllCell, SelectCell } from './BulkEdit';
import { SORTABLE } from './columns';

interface Props {
  filterParams: Record<string, string>;
  kind?: TaskListKind;
  preset: string;
  /** Default order: deadline, latest first (DEV-06..08); issue lists pass '-created'. */
  defaultSort?: TaskSort;
  /** Stable reference (module constant or useMemo). */
  columns: Columns<TaskRow>;
  searchable?: boolean;
  onTotal?: (n: number) => void;
  /** Accordion title: names the Excel file of the export icon. */
  exportName: string;
}

const SEARCH_DEBOUNCE_MS = 300;
/** Rows per page, remembered in this browser for every task list. */
const PAGE_SIZES = [10, 25, 50, 100];
const PAGE_SIZE_KEY = 'nural-page-size';
function storedPageSize(): number {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(n) ? n : 50;
  } catch {
    return 50;
  }
}
const select = createColumnHelper<TaskRow>();

function toSorting(sort: TaskSort): SortingState {
  const key = sort.replace('-', '');
  const id = Object.entries(SORTABLE).find(([, v]) => v === key)?.[0] ?? 'deadline';
  return [{ id, desc: sort.startsWith('-') }];
}

export function TaskList({
  filterParams,
  kind = 'tasks',
  preset,
  defaultSort = '-deadline',
  columns,
  searchable,
  onTotal,
  exportName,
}: Props) {
  const [, openTask] = useOpenTask();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<TaskSort>(defaultSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(storedPageSize);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // A new filter, preset, search or order starts again at page 1.
  const filterKey = JSON.stringify(filterParams);
  useEffect(() => setPage(1), [filterKey, preset, q, sort, pageSize]);
  const changePageSize = (n: number) => {
    setPageSize(n);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(n));
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  };

  const { data, isFetching, isError } = useTaskList(filterParams, {
    kind,
    preset,
    q,
    sort,
    page,
    pageSize,
  });

  useEffect(() => {
    if (data) onTotal?.(data.total);
  }, [data, onTotal]);

  // Bulk edit: ticks are kept across pages of this list and reset when the list changes.
  const bulk = useBulk(JSON.stringify([filterParams, kind, preset, q]), page, data?.rows);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const withSelect = useMemo(
    () =>
      [
        select.display({
          id: 'select',
          header: () => <SelectAllCell rows={rows} bulk={bulk} />,
          enableSorting: false,
          cell: (c) => <SelectCell row={c.row.original} bulk={bulk} />,
        }),
        ...columns,
      ] as Columns<TaskRow>,
    [columns, rows, bulk],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {searchable && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or title…"
            aria-label="Search tasks"
            className="h-9 w-full max-w-sm rounded-control border border-border px-3 outline-none focus:border-primary"
          />
        )}
        <a
          href={taskExportUrl(filterParams, { kind, preset, q, sort }, exportName)}
          download
          aria-label={`Export ${data?.total ?? ''} tasks to Excel`}
          title={`Export to Excel: ${data ? `all ${data.total.toLocaleString('en-IN')}` : 'these'} tasks with every detail`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 font-heading text-button text-primary hover:border-primary"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="#1D6F42" />
            <path
              d="M5 4.5l6 7M11 4.5l-6 7"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M6 1.5v6M3.5 5L6 7.5 8.5 5M2 10h8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Excel
        </a>
      </div>
      {isError ? (
        <p className="py-6 text-center text-bad">
          Could not load tasks. They will retry on the next change.
        </p>
      ) : (
        <BoardsContext.Provider value={data?.boards ?? {}}>
          <BulkBar bulk={bulk} boards={data?.boards ?? {}} />
          <DataTable
            columns={withSelect}
            rowClassName={(r) => bulkRowClass(bulk.results.get(r.id))}
            rowTitle={(r) => bulk.results.get(r.id)?.reason}
            data={data?.rows ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => void openTask(r.id)}
            sorting={toSorting(sort)}
            onSortingChange={(s) => {
              const first = s[0];
              const key = first && SORTABLE[first.id];
              if (key) setSort(`${first.desc ? '-' : ''}${key}` as TaskSort);
            }}
            pagination={
              data && {
                page,
                pageSize: data.pageSize,
                total: data.total,
                onPage: setPage,
                onPageSize: changePageSize,
                pageSizes: PAGE_SIZES,
              }
            }
            maxHeight={560}
            loading={isFetching}
          />
        </BoardsContext.Provider>
      )}
    </div>
  );
}
