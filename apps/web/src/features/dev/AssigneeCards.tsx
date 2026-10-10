// DEV-02: assignee-wise (or project-wise) table, sortable with a totals row, and the Pending vs
// Done chart beside it. Clicking a name sets the Assignee or Project filter.
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { AssigneeRow, GroupBy } from '../../api/types';
import { Card, GroupToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { DataTable, type Columns } from '../../components/DataTable';
import { useFocusRow } from '../filters/useFilters';
import { useDevAssignees } from './api';
import { GROUP_LABEL } from './format';

const col = createColumnHelper<AssigneeRow>();
const num = { meta: { align: 'right' } } as const;
const CHART_ROWS = 15;

export function AssigneeTableCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useDevAssignees(by);
  const focus = useFocusRow();

  const columns = useMemo(
    () =>
      [
        col.accessor('name', {
          header: GROUP_LABEL[by],
          cell: (c) => (
            <button
              type="button"
              title={`Show only this ${by}`}
              onClick={() => focus(by, c.row.original.id)}
              className="text-left font-bold text-primary-dark hover:text-primary hover:underline"
            >
              {c.getValue()}
            </button>
          ),
          footer: 'Total',
        }),
        col.accessor('total', { header: 'Total', ...num, footer: () => data?.totals.total }),
        col.accessor('pending', { header: 'Pending', ...num, footer: () => data?.totals.pending }),
        col.accessor('done', { header: 'Done', ...num, footer: () => data?.totals.done }),
        col.accessor('dueToday', {
          header: 'Due today',
          ...num,
          footer: () => data?.totals.dueToday,
        }),
        col.accessor('completedToday', {
          header: 'Comp. today',
          ...num,
          footer: () => data?.totals.completedToday,
        }),
      ] as Columns<AssigneeRow>,
    [by, data, focus],
  );

  return (
    <Card
      title={by === 'project' ? 'Project-wise tasks' : 'Assignee-wise tasks'}
      className={className}
      loading={isLoading}
      empty={data?.rows.length === 0}
      action={<GroupToggle value={by} onChange={setBy} />}
    >
      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        rowKey={(r) => r.id}
        initialSorting={[{ id: 'total', desc: true }]}
        showFooter
        maxHeight={360}
        dense
      />
    </Card>
  );
}

export function PendingDoneCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useDevAssignees(by);
  const focus = useFocusRow();
  // API rows are sorted by total; ECharts draws the first category at the bottom.
  const rows = useMemo(() => (data?.rows ?? []).slice(0, CHART_ROWS).reverse(), [data]);

  return (
    <Card
      title="Pending vs Done"
      className={className}
      loading={isLoading}
      empty={rows.length === 0}
      action={<GroupToggle value={by} onChange={setBy} />}
    >
      <Chart
        label={`Pending and done tasks per ${by}`}
        height={Math.max(160, rows.length * 22 + 50)}
        onClick={(p) => {
          const row = rows[p.dataIndex];
          if (row) focus(by, row.id);
        }}
        option={{
          grid: { left: 8, right: 16, top: 8, bottom: 28, containLabel: true },
          legend: { bottom: 0, itemWidth: 10, itemHeight: 10, icon: 'rect' },
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
          series: [
            {
              name: 'Pending',
              type: 'bar',
              stack: 'n',
              barMaxWidth: 14,
              itemStyle: { color: token('--warn') },
              data: rows.map((r) => r.pending),
            },
            {
              name: 'Done',
              type: 'bar',
              stack: 'n',
              barMaxWidth: 14,
              itemStyle: { color: token('--primary'), borderRadius: [0, 3, 3, 0] },
              data: rows.map((r) => r.done),
            },
          ],
        }}
      />
      {data && data.rows.length > CHART_ROWS && (
        <p className="text-table text-text-muted">
          Top {CHART_ROWS} of {data.rows.length} by total.
        </p>
      )}
    </Card>
  );
}
