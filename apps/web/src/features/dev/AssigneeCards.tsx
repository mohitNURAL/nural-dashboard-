// DEV-02: assignee-wise (or project-wise) table, sortable with a totals row, and the Pending vs
// Done chart beside it. A name sets the Assignee or Project filter; a count or a bar opens the
// tasks behind it.
import { createColumnHelper } from '@tanstack/react-table';
import type { DevPreset } from '@nural/shared';
import { useMemo, useState } from 'react';
import type { AssigneeRow, GroupBy, WorkSplit } from '../../api/types';
import { Card, GroupToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { CountButton } from '../../components/CountButton';
import { token } from '../../components/chartTheme';
import { DataTable, type Columns } from '../../components/DataTable';
import { useDevScope, useFocusRow } from '../filters/useFilters';
import { useDevAssignees } from './api';
import { rowParams, useDrillTo } from './drill';
import { GROUP_LABEL } from './format';
import { INFO } from '../info';

const col = createColumnHelper<AssigneeRow>();

type CountKey = 'total' | 'pending' | 'done' | 'dueToday' | 'completedToday' | 'completedYesterday';
/** Which task list each column opens ("Done" = sent to QA). */
const COUNT_PRESET: Record<CountKey, DevPreset> = {
  total: 'total',
  pending: 'pending',
  done: 'completed',
  dueToday: 'dueToday',
  completedToday: 'doneToday',
  completedYesterday: 'doneYesterday',
};
const CHART_ROWS = 15;

export function AssigneeTableCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useDevAssignees(by);
  const focus = useFocusRow();

  const drill = useDrillTo();

  const columns = useMemo(() => {
    // Each count opens "All tasks" for that row and column; the totals row for the column.
    const count = (key: CountKey, header: string, info: string) =>
      col.accessor(key, {
        header,
        meta: { align: 'center', info },
        cell: (c) => {
          const r = c.row.original;
          return (
            <CountButton
              n={c.getValue()}
              title={`Open ${r.name}: ${header}`}
              onClick={() =>
                drill(
                  {
                    label: `${r.name} · ${header}`,
                    preset: COUNT_PRESET[key],
                    params: rowParams(by, r.id),
                  },
                  { by, id: r.id },
                )
              }
            />
          );
        },
        footer: () => (
          <CountButton
            n={data?.totals[key]}
            onClick={() => drill({ label: header, preset: COUNT_PRESET[key] })}
          />
        ),
      });
    return [
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
      count('total', 'Total', INFO.colTotal),
      count('pending', 'Pending', INFO.colPending),
      count('done', 'Done', INFO.colDone),
      count('dueToday', 'Due today', INFO.colDueToday),
      count('completedToday', 'Comp. today', INFO.colCompToday),
      count('completedYesterday', 'Comp. yesterday', INFO.colCompYesterday),
    ] as Columns<AssigneeRow>;
  }, [by, data, drill, focus]);

  return (
    <Card
      title={by === 'project' ? 'Project-wise tasks' : 'Assignee-wise tasks'}
      info={INFO.assigneeTable}
      className={className}
      loading={isLoading}
      empty={data?.rows.length === 0}
      action={<GroupToggle value={by} onChange={setBy} />}
    >
      <DataTable
        tableId="dev-assignees"
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

/**
 * Tooltip line of Pending vs Done, split like the tiles: Dev and Issues (All), Bug and Feedback
 * (Issues), no split (Dev). E.g. "Pending 12 (Dev 9, Issues 3)".
 */
function splitLine(label: string, n: number, s: WorkSplit, scope: string): string {
  const parts =
    scope === 'all'
      ? `Dev ${s.dev}, Issues ${s.bug + s.feedback}`
      : scope === 'issues'
        ? `Bug ${s.bug}, Feedback ${s.feedback}`
        : '';
  return `${label} <b>${n}</b>${parts ? ` (${parts})` : ''}`;
}

export function PendingDoneCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useDevAssignees(by);
  const [scope] = useDevScope();
  const drill = useDrillTo();
  // API rows are sorted by total; ECharts draws the first category at the bottom.
  const rows = useMemo(() => (data?.rows ?? []).slice(0, CHART_ROWS).reverse(), [data]);

  return (
    <Card
      title="Pending vs Done"
      info={INFO.pendingVsDone}
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
          if (!row) return;
          const pending = p.seriesName === 'Pending';
          drill(
            {
              label: `${row.name} · ${pending ? 'Pending' : 'Done'}`,
              preset: pending ? 'pending' : 'completed',
              params: rowParams(by, row.id),
            },
            { by, id: row.id },
          );
        }}
        option={{
          grid: { left: 8, right: 16, top: 8, bottom: 28, containLabel: true },
          legend: { bottom: 0, itemWidth: 10, itemHeight: 10, icon: 'rect' },
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: (params: unknown) => {
              const r = rows[(params as { dataIndex: number }[])[0]?.dataIndex ?? -1];
              if (!r) return '';
              return [
                `<b>${r.name}</b>`,
                splitLine('Pending', r.pending, r.pendingSplit, scope),
                splitLine('Done', r.done, r.doneSplit, scope),
              ].join('<br/>');
            },
          },
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
