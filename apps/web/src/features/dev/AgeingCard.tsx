// DEV-03: open tasks by days past deadline. Chart: one bar per bucket; Table: buckets per assignee.
import { createColumnHelper } from '@tanstack/react-table';
import { useState } from 'react';
import { AGEING_BUCKETS, type AgeingBucket, type DevAssignees } from '../../api/types';
import { Card, ViewToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { DataTable, type Columns } from '../../components/DataTable';
import { useDevAssignees } from './api';

type Row = DevAssignees['ageing']['rows'][number];

const LABELS: Record<AgeingBucket | 'noDeadline', string> = {
  notDue: 'Not due',
  '0-2': '0 to 2',
  '3-7': '3 to 7',
  '8-14': '8 to 14',
  '15+': 'over 14',
  noDeadline: 'No deadline',
};

/** Teal for not due, then deepening reds as tasks get later. */
const COLORS: Record<AgeingBucket, string> = {
  notDue: '--accent-dark',
  '0-2': '--bad-soft',
  '3-7': '#EE7C7E',
  '8-14': '--bad',
  '15+': '--bad-dark',
};
const color = (b: AgeingBucket) => (COLORS[b].startsWith('--') ? token(COLORS[b]) : COLORS[b]);

const col = createColumnHelper<Row>();
const columns = [
  col.accessor((r) => r.person.name, { id: 'name', header: 'Assignee' }),
  ...[...AGEING_BUCKETS, 'noDeadline' as const].map((b) =>
    col.accessor((r) => r.buckets[b], {
      id: b,
      header: LABELS[b],
      meta: { align: 'right' },
      cell: (c) => c.getValue() || <span className="text-text-muted">0</span>,
    }),
  ),
] as Columns<Row>;

export function AgeingCard({ className }: { className?: string }) {
  const { data, isLoading } = useDevAssignees();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const totals = data?.ageing.totals;
  const open = totals ? AGEING_BUCKETS.reduce((n, b) => n + totals[b], 0) + totals.noDeadline : 0;

  return (
    <Card
      title="Task ageing, days past deadline"
      className={className}
      loading={isLoading}
      empty={!!data && open === 0}
      emptyText="No open tasks in these filters."
      action={
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
        />
      }
    >
      {totals && view === 'chart' && (
        <>
          <Chart
            label="Open tasks by days past deadline"
            height={220}
            option={{
              grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
              tooltip: { trigger: 'item' },
              xAxis: {
                type: 'category',
                data: AGEING_BUCKETS.map((b) => LABELS[b]),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: token('--border') } },
              },
              yAxis: { type: 'value', show: false },
              series: [
                {
                  type: 'bar',
                  name: 'Open tasks',
                  barMaxWidth: 56,
                  label: { show: true, position: 'top', fontFamily: 'Manrope', fontWeight: 700 },
                  data: AGEING_BUCKETS.map((b) => ({
                    value: totals[b],
                    itemStyle: { color: color(b), borderRadius: [4, 4, 0, 0] },
                  })),
                },
              ],
            }}
          />
          {totals.noDeadline > 0 && (
            <p className="text-table text-text-muted">
              Plus {totals.noDeadline} open {totals.noDeadline === 1 ? 'task' : 'tasks'} with no
              deadline.
            </p>
          )}
        </>
      )}
      {data && view === 'table' && (
        <DataTable
          columns={columns}
          data={data.ageing.rows}
          rowKey={(r) => r.id}
          initialSorting={[{ id: '15+', desc: true }]}
          maxHeight={260}
          dense
        />
      )}
    </Card>
  );
}
