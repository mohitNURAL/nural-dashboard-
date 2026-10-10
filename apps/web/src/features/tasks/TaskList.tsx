// Paginated, server-sorted task list for accordions (DEV-06..08). Row click opens the drawer.
import { useEffect, useMemo, useState } from 'react';
import { DataTable, type SortingState } from '../../components/DataTable';
import { useOpenTask, useTaskList, type TaskListKind, type TaskSort } from './api';
import { SORTABLE, taskColumns } from './columns';

interface Props {
  filterParams: Record<string, string>;
  kind?: TaskListKind;
  preset: string;
  /** Default order: deadline, latest first (DEV-06..08). */
  defaultSort?: TaskSort;
  withCreator?: boolean;
  searchable?: boolean;
  onTotal?: (n: number) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

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
  withCreator,
  searchable,
  onTotal,
}: Props) {
  const [, openTask] = useOpenTask();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<TaskSort>(defaultSort);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // A new filter, preset, search or order starts again at page 1.
  const filterKey = JSON.stringify(filterParams);
  useEffect(() => setPage(1), [filterKey, preset, q, sort]);

  const { data, isFetching, isError } = useTaskList(filterParams, {
    kind,
    preset,
    q,
    sort,
    page,
  });

  useEffect(() => {
    if (data) onTotal?.(data.total);
  }, [data, onTotal]);

  const columns = useMemo(() => taskColumns({ withCreator }), [withCreator]);

  return (
    <div className="space-y-3">
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
      {isError ? (
        <p className="py-6 text-center text-bad">
          Could not load tasks. They will retry on the next change.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={data?.rows ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => void openTask(r.id)}
          sorting={toSorting(sort)}
          onSortingChange={(s) => {
            const first = s[0];
            const key = first && SORTABLE[first.id];
            if (key) setSort(`${first.desc ? '-' : ''}${key}` as TaskSort);
          }}
          pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
          maxHeight={560}
          loading={isFetching}
        />
      )}
    </div>
  );
}
