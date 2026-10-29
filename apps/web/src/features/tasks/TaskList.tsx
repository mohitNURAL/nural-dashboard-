// Paginated, server-sorted task list for accordions (DEV-06..08, QA-08..09). Row click opens
// the drawer.
import { useEffect, useMemo, useState } from 'react';
import type { TaskRow } from '../../api/types';
import { useTableLayout } from '../../components/table/useTableLayout';
import { DataTable, type Columns, type SortingState } from '../../components/DataTable';
import {
  COLUMN_FILTERS,
  taskExportUrl,
  useOpenTask,
  useTaskList,
  type ColumnFilters,
  type TaskListKind,
  type TaskSort,
} from './api';
import { SearchCombobox } from '../../components/SearchCombobox';
import { createColumnHelper } from '@tanstack/react-table';
import { BoardsContext } from './boards';
import { bulkRowClass, useBulk } from './bulk';
import { BulkBar, SelectAllCell, SelectCell } from './BulkEdit';
import { SORTABLE } from './columns';
import { SearchInput } from '../../components/ui/SearchInput';

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
  // The reader's columns and row order: the Excel file follows them.
  const layout = useTableLayout('tasks');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<TaskSort>(defaultSort);
  // Column filters: values picked from each column's list (type to narrow the list).
  const [colFilters, setColFilters] = useState<ColumnFilters>({});
  const colKey = JSON.stringify(colFilters);
  const anyColumn = Object.values(colFilters).some((v) => v?.length);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(storedPageSize);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // A new filter, preset, search or order starts again at page 1.
  const filterKey = JSON.stringify(filterParams);
  useEffect(() => setPage(1), [filterKey, preset, q, sort, pageSize, colKey]);
  // A new drill-down or filter bar starts with no column filters.
  useEffect(() => setColFilters({}), [filterKey, preset]);
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
    columns: colFilters,
  });

  useEffect(() => {
    if (data) onTotal?.(data.total);
  }, [data, onTotal]);

  // Bulk edit: ticks are kept across pages of this list and reset when the list changes.
  const bulk = useBulk(JSON.stringify([filterParams, kind, preset, q, colKey]), page, data?.rows);
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
          <SearchInput
            value={search}
            onChange={setSearch}
            size="sm"
            placeholder="Search by ID or title…"
            label="Search tasks"
            className="w-full max-w-md"
          />
        )}
        <a
          href={taskExportUrl(
            filterParams,
            { kind, preset, q, sort, columns: colFilters },
            exportName,
            {
              cols: layout.cols,
              hidden: layout.hidden,
              order: layout.custom ? layout.rows : undefined,
            },
          )}
          download
          aria-label={`Export ${data?.total ?? ''} tasks to Excel`}
          title={`Export to Excel: ${data ? `all ${data.total.toLocaleString('en-IN')}` : 'these'} tasks with every detail`}
          className="btn btn-stroke ml-auto inline-flex h-8 items-center gap-1.5 px-2.5"
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
      {searchable && (
        <div className="flex flex-wrap items-center gap-2" data-no-export>
          {COLUMN_FILTERS.map(([key, label]) => {
            const options = (data?.facets?.[key] ?? []).map((o) => ({
              value: o.value,
              label: o.label || '-',
              count: o.count,
            }));
            // A column with one value and nothing picked has nothing to filter.
            if (options.length < 2 && !colFilters[key]?.length) return null;
            return (
              <SearchCombobox
                key={key}
                label={label}
                options={options}
                selected={colFilters[key] ?? []}
                onChange={(values) => setColFilters((c) => ({ ...c, [key]: values }))}
                className="w-auto min-w-[9.5rem] max-w-[15rem]"
              />
            );
          })}
          {anyColumn && (
            <button
              type="button"
              onClick={() => setColFilters({})}
              className="btn btn-link h-8 px-2.5"
            >
              Clear column filters
            </button>
          )}
        </div>
      )}
      {isError ? (
        <p className="py-6 text-center text-bad">
          Could not load tasks. They will retry on the next change.
        </p>
      ) : (
        <BoardsContext.Provider value={data?.boards ?? {}}>
          <BulkBar bulk={bulk} boards={data?.boards ?? {}} />
          <DataTable
            tableId="tasks"
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
