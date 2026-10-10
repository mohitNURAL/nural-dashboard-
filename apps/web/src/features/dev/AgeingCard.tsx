// DEV-03: open tasks by days past deadline, per assignee (or project). Chart: a stacked bar per
// row; Table: bucket counts per row with totals. Every count opens the tasks behind it.
import { createColumnHelper } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import type { AgeingCounts, DevAssignees, GroupBy } from '../../api/types';
import { Actions, Card, GroupToggle, ViewToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { CountButton } from '../../components/CountButton';
import { DataTable, type Columns } from '../../components/DataTable';
import { useDevAssignees } from './api';
import { rowParams, useDrill } from './drill';
import { GROUP_LABEL } from './format';

type Key = keyof AgeingCounts;
type Row = DevAssignees['ageing']['rows'][number];

/** Teal for not due, deepening reds as tasks get later, grey for no deadline. */
const BUCKETS: { key: Key; label: string; color: string; late: boolean }[] = [
  { key: 'notDue', label: 'Not due', color: '--accent-dark', late: false },
  { key: '0-2', label: '0 to 2', color: '--bad-soft', late: true },
  { key: '3-7', label: '3 to 7', color: '#EE7C7E', late: true },
  { key: '8-14', label: '8 to 14', color: '--bad', late: true },
  { key: '15-30', label: '15 to 30', color: '--bad-dark', late: true },
  { key: '30+', label: 'over 30', color: '#4A1517', late: true },
  { key: 'noDeadline', label: 'No deadline', color: '--text-muted', late: false },
];
const resolve = (c: string) => (c.startsWith('--') ? token(c) : c);
const CHART_ROWS = 15;

const col = createColumnHelper<Row>();

export function AgeingCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const { data, isLoading } = useDevAssignees(by);
  const drill = useDrill();
  const totals = data?.ageing.totals;
  const open = totals ? BUCKETS.reduce((n, b) => n + totals[b.key], 0) : 0;

  /** Opens the pending tasks in one bucket, for one row or for everyone. */
  const openBucket = useCallback(
    (key: Key, row?: Row) => {
      const b = BUCKETS.find((x) => x.key === key)!;
      drill({
        label: [row?.name, b.late ? `${b.label} days late` : b.label].filter(Boolean).join(' · '),
        preset: 'pending',
        params: { ageing: key, ...(row ? rowParams(by, row.id) : {}) },
      });
    },
    [by, drill],
  );

  const columns = useMemo(
    () =>
      [
        col.accessor('name', { header: GROUP_LABEL[by], footer: 'Total' }),
        ...BUCKETS.map((b) =>
          col.accessor((r) => r.buckets[b.key], {
            id: b.key,
            header: b.label,
            meta: { align: 'right' },
            cell: (c) => (
              <CountButton
                n={c.getValue()}
                tone={b.late ? 'bad' : undefined}
                onClick={() => openBucket(b.key, c.row.original)}
              />
            ),
            footer: () => <CountButton n={totals?.[b.key]} onClick={() => openBucket(b.key)} />,
          }),
        ),
      ] as Columns<Row>,
    [by, totals, openBucket],
  );

  // Most open tasks on top; ECharts draws the first category at the bottom.
  const rows = useMemo(() => (data?.ageing.rows ?? []).slice(0, CHART_ROWS).reverse(), [data]);

  return (
    <Card
      title="Task ageing, days past deadline"
      className={className}
      loading={isLoading}
      empty={!!data && open === 0}
      emptyText="No open tasks in these filters."
      action={
        <Actions>
          <GroupToggle value={by} onChange={setBy} />
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
      {totals && (
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
          {BUCKETS.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1 text-table">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: resolve(b.color) }}
                aria-hidden
              />
              <span className="text-text-muted">{b.label}</span>
              <CountButton n={totals[b.key]} onClick={() => openBucket(b.key)} />
            </span>
          ))}
        </div>
      )}
      {data && view === 'chart' && (
        <>
          <Chart
            label={`Open tasks by days past deadline, per ${by}`}
            height={Math.max(180, rows.length * 22 + 30)}
            onClick={(p) => {
              const row = rows[p.dataIndex];
              const bucket = BUCKETS.find((b) => b.label === p.seriesName);
              if (row && bucket) openBucket(bucket.key, row);
            }}
            option={{
              grid: { left: 8, right: 16, top: 4, bottom: 4, containLabel: true },
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
              xAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: token('--primary-soft-100') } },
              },
              yAxis: {
                type: 'category',
                data: rows.map((r) => r.name),
                axisTick: { show: false },
                axisLabel: { width: 140, overflow: 'truncate' },
                axisLine: { lineStyle: { color: token('--border') } },
              },
              series: BUCKETS.map((b) => ({
                name: b.label,
                type: 'bar',
                stack: 'age',
                barMaxWidth: 14,
                itemStyle: { color: resolve(b.color) },
                data: rows.map((r) => r.buckets[b.key] || null),
              })),
            }}
          />
          {data.ageing.rows.length > CHART_ROWS && (
            <p className="text-table text-text-muted">
              Top {CHART_ROWS} of {data.ageing.rows.length} by open tasks; the table lists all.
            </p>
          )}
        </>
      )}
      {data && view === 'table' && (
        <DataTable
          columns={columns}
          data={data.ageing.rows}
          rowKey={(r) => r.id}
          initialSorting={[{ id: '30+', desc: true }]}
          showFooter
          maxHeight={300}
          dense
        />
      )}
    </Card>
  );
}
