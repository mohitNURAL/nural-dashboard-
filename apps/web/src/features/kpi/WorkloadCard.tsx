// KPI-05 workload: open project tasks per person, in counts. A bar segment opens those tasks
// and sets the Assignee filter.
import { useMemo } from 'react';
import type { KpiWorkload } from '../../api/types';
import { Card } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { useKpiWorkload } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';

const ROWS = 15;

type SegmentKey = 'overdue' | 'dueSoon' | 'later' | 'noDeadline';

const SEGMENTS: { key: SegmentKey; name: string; preset: string; color: string }[] = [
  { key: 'overdue', name: 'Overdue', preset: 'overdue', color: '--bad' },
  { key: 'dueSoon', name: 'Due in 10 working days', preset: 'dueSoon', color: '--accent-dark' },
  { key: 'later', name: 'Due later', preset: 'dueLater', color: '--primary-muted' },
  { key: 'noDeadline', name: 'No deadline', preset: 'noDeadline', color: '--border' },
];

export function WorkloadCard({ className }: { className?: string }) {
  const { data, isLoading } = useKpiWorkload();
  const openList = useOpenKpiList();
  // Most open work on top; ECharts draws the first category at the bottom.
  const rows = useMemo<KpiWorkload[]>(() => (data?.rows ?? []).slice(0, ROWS).reverse(), [data]);

  return (
    <Card
      title="Workload"
      info={KPI_INFO.workload}
      className={className}
      loading={isLoading}
      empty={!!data && data.rows.length === 0}
    >
      <Chart
        label="Open tasks per person"
        height={Math.max(160, rows.length * 22 + 50)}
        onClick={(p) => {
          const r = rows[p.dataIndex];
          const seg = SEGMENTS.find((s) => s.name === p.seriesName);
          if (!r || !seg) return;
          openList(
            {
              label: `${r.name} · ${seg.name}`,
              params: { kpi: seg.preset, assignee: String(r.id) },
              info: KPI_INFO.workload,
            },
            { by: 'assignee', id: r.id },
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
              const where = `${r.projects} project${r.projects === 1 ? '' : 's'}`;
              return [
                `<b>${r.name}</b> · ${r.open} open in ${where}`,
                ...SEGMENTS.map((s) => `${s.name}: <b>${r[s.key]}</b>`),
              ].join('<br/>');
            },
          },
          xAxis: {
            type: 'value',
            minInterval: 1,
            splitLine: { lineStyle: { color: token('--primary-soft-100') } },
          },
          yAxis: {
            type: 'category',
            data: rows.map((r) => r.name),
            axisTick: { show: false },
            axisLabel: { width: 130, overflow: 'truncate' },
            axisLine: { lineStyle: { color: token('--border') } },
          },
          series: SEGMENTS.map((s, i) => ({
            name: s.name,
            type: 'bar',
            stack: 'n',
            barMaxWidth: 14,
            itemStyle: {
              color: token(s.color),
              borderRadius: i === SEGMENTS.length - 1 ? [0, 3, 3, 0] : 0,
            },
            data: rows.map((r) => r[s.key] || null),
          })),
        }}
      />
      {data && data.rows.length > ROWS && (
        <p className="text-table text-text-muted">
          Top {ROWS} of {data.rows.length} by open tasks.
        </p>
      )}
    </Card>
  );
}
