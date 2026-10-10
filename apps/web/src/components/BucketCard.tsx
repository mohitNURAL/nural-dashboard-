// Age buckets as a bar chart, with a per-assignee or per-project table view (DEV-03 ageing,
// QA-04 issue age).
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState, type ReactNode } from 'react';
import type { Named } from '../api/types';
import { Actions, Card, ViewToggle } from './Card';
import { Chart } from './Chart';
import { token } from './chartTheme';
import { DataTable, type Columns } from './DataTable';

export interface Bucket<K extends string> {
  key: K;
  label: string;
  /** CSS token name (--bad) or a hex colour. */
  color: string;
}

interface Row<K extends string> extends Named {
  buckets: Record<K, number>;
}

interface Props<K extends string> {
  title: string;
  chartLabel: string;
  buckets: Bucket<K>[];
  /** Extra table-only columns, e.g. "No deadline". */
  extraColumns?: Bucket<K>[];
  totals: Record<K, number> | undefined;
  rows: Row<K>[] | undefined;
  loading?: boolean;
  emptyText: string;
  footnote?: ReactNode;
  className?: string;
  /** Header of the name column ("Assignee" or "Project"). */
  rowLabel?: string;
  /** Extra header control for the table view, e.g. the Assignee / Project switch. */
  extraAction?: ReactNode;
}

const resolve = (c: string) => (c.startsWith('--') ? token(c) : c);

export function BucketCard<K extends string>({
  title,
  chartLabel,
  buckets,
  extraColumns = [],
  totals,
  rows,
  loading,
  emptyText,
  footnote,
  className,
  rowLabel = 'Assignee',
  extraAction,
}: Props<K>) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const all = useMemo(() => [...buckets, ...extraColumns], [buckets, extraColumns]);
  const sum = totals ? all.reduce((n, b) => n + totals[b.key], 0) : 0;

  const columns = useMemo(() => {
    const col = createColumnHelper<Row<K>>();
    return [
      col.accessor('name', { header: rowLabel }),
      ...all.map((b) =>
        col.accessor((r) => r.buckets[b.key], {
          id: b.key,
          header: b.label,
          meta: { align: 'right' },
          cell: (c) => c.getValue() || <span className="text-text-muted">0</span>,
        }),
      ),
    ] as Columns<Row<K>>;
  }, [all, rowLabel]);

  return (
    <Card
      title={title}
      className={className}
      loading={loading}
      empty={!!totals && sum === 0}
      emptyText={emptyText}
      action={
        <Actions>
          {view === 'table' && extraAction}
          <ViewToggle
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </Actions>
      }
    >
      {totals && view === 'chart' && (
        <>
          <Chart
            label={chartLabel}
            height={220}
            option={{
              grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
              tooltip: { trigger: 'item' },
              xAxis: {
                type: 'category',
                data: buckets.map((b) => b.label),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: token('--border') } },
              },
              yAxis: { type: 'value', show: false },
              series: [
                {
                  type: 'bar',
                  name: chartLabel,
                  barMaxWidth: 56,
                  label: { show: true, position: 'top', fontFamily: 'Manrope', fontWeight: 700 },
                  data: buckets.map((b) => ({
                    value: totals[b.key],
                    itemStyle: { color: resolve(b.color), borderRadius: [4, 4, 0, 0] },
                  })),
                },
              ],
            }}
          />
          {footnote}
        </>
      )}
      {rows && view === 'table' && (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          initialSorting={[{ id: buckets[buckets.length - 1]!.key, desc: true }]}
          maxHeight={260}
          dense
        />
      )}
    </Card>
  );
}
