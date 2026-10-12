// Tasks in hand by assignee or project (2026-10-12): a bar chart of one window (tomorrow, rest of
// the week, ...) and a table of every window. The same card on KPI, Development and QA; each tab
// passes its data and opens its own task list. A name sets that filter; a bar or count opens the
// tasks behind it.
import type { DueWindow } from '@nural/shared';
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { GroupBy, InHand, InHandRow } from '../api/types';
import { Actions, Card, GroupToggle, ViewToggle } from './Card';
import { Chart } from './Chart';
import { token } from './chartTheme';
import { CountButton } from './CountButton';
import { DataTable, type Columns } from './DataTable';
import { DUE_TEXT } from './dueText';

const col = createColumnHelper<InHandRow>();
const WINDOWS: DueWindow[] = [
  'ahead',
  'tomorrow',
  'restWeek',
  'restMonth',
  'nextWeek',
  'nextMonth',
];
const CHART_ROWS = 15;

export function InHandCard({
  data,
  isLoading,
  by,
  onBy,
  info,
  tableId,
  onOpen,
  onFocus,
  className,
}: {
  data: InHand | undefined;
  isLoading: boolean;
  by: GroupBy;
  onBy: (b: GroupBy) => void;
  info: string;
  tableId: string;
  /** Opens the tasks of one window, for one row or (no row) everyone. */
  onOpen: (w: DueWindow, label: string, row?: InHandRow) => void;
  /** Sets the Assignee or Project filter to this row. */
  onFocus: (row: InHandRow) => void;
  className?: string;
}) {
  const [win, setWin] = useState<DueWindow>('ahead');
  const rows = useMemo(
    () =>
      [...(data?.rows ?? [])]
        .filter((r) => r[win] > 0)
        .sort((a, b) => b[win] - a[win])
        .slice(0, CHART_ROWS)
        .reverse(),
    [data, win],
  );

  const columns = useMemo(
    () =>
      [
        col.accessor('name', {
          header: by === 'project' ? 'Project' : 'Assignee',
          cell: (c) => (
            <button
              type="button"
              title={`Show only this ${by}`}
              onClick={() => onFocus(c.row.original)}
              className="whitespace-nowrap text-left font-bold text-primary-dark hover:text-primary hover:underline"
            >
              {c.getValue()}
            </button>
          ),
          footer: 'Total',
        }),
        ...WINDOWS.map((w) =>
          col.accessor(w, {
            header: w === 'ahead' ? 'In hand' : DUE_TEXT[w],
            meta: { align: 'right' },
            cell: (c) => (
              <CountButton
                n={c.getValue()}
                onClick={() => onOpen(w, `${c.row.original.name} · ${DUE_TEXT[w]}`, c.row.original)}
              />
            ),
            footer: () => (
              <CountButton
                n={data?.totals[w]}
                onClick={() => onOpen(w, `Tasks in hand · ${DUE_TEXT[w]}`)}
              />
            ),
          }),
        ),
      ] as Columns<InHandRow>,
    [by, data, onFocus, onOpen],
  );

  return (
    <Card
      title={by === 'project' ? 'Tasks in hand by project' : 'Tasks in hand by assignee'}
      info={info}
      className={className}
      loading={isLoading}
      empty={!!data && data.rows.length === 0}
      emptyText="No open task has its deadline ahead."
      action={
        <Actions>
          <ViewToggle<DueWindow>
            value={win}
            onChange={setWin}
            options={WINDOWS.map((w) => ({ value: w, label: w === 'ahead' ? 'All' : DUE_TEXT[w] }))}
          />
          <GroupToggle value={by} onChange={onBy} />
        </Actions>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          {rows.length ? (
            <Chart
              label={`Tasks in hand per ${by}: ${DUE_TEXT[win]}`}
              height={Math.max(160, rows.length * 22 + 40)}
              onClick={(p) => {
                const r = rows[p.dataIndex];
                if (r) onOpen(win, `${r.name} · ${DUE_TEXT[win]}`, r);
              }}
              option={{
                grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                xAxis: {
                  type: 'value',
                  minInterval: 1,
                  splitLine: { lineStyle: { color: token('--primary-soft-100') } },
                },
                yAxis: {
                  type: 'category',
                  data: rows.map((r) => r.name),
                  axisTick: { show: false },
                  axisLabel: { width: 140, overflow: 'truncate' },
                  axisLine: { lineStyle: { color: token('--border') } },
                },
                series: [
                  {
                    name: DUE_TEXT[win],
                    type: 'bar',
                    barMaxWidth: 14,
                    label: { show: true, position: 'right', color: token('--text-muted') },
                    itemStyle: { color: token('--primary'), borderRadius: [0, 3, 3, 0] },
                    data: rows.map((r) => r[win]),
                  },
                ],
              }}
            />
          ) : (
            <p className="py-6 text-center text-table text-text-muted">
              Nothing planned for {DUE_TEXT[win].toLowerCase()}.
            </p>
          )}
          {data && data.rows.filter((r) => r[win] > 0).length > CHART_ROWS && (
            <p className="text-table text-text-muted">Top {CHART_ROWS} shown.</p>
          )}
        </div>
        <DataTable
          tableId={tableId}
          columns={columns}
          data={data?.rows ?? []}
          rowKey={(r) => r.id}
          initialSorting={[{ id: 'ahead', desc: true }]}
          showFooter
          maxHeight={360}
          dense
        />
      </div>
    </Card>
  );
}
