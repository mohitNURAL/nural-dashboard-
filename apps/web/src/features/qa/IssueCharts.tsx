// QA-02 issues by assignee, QA-03 issues by Kanban stage, QA-04 age of open issues,
// QA-05 rework by developer. QA-02, 04 and 05 can also be grouped by project.
import { useMemo, useState } from 'react';
import type { GroupBy, IssueAgeBucket } from '../../api/types';
import { BucketCard, type Bucket } from '../../components/BucketCard';
import { Actions, Card, GroupToggle, ViewToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { GROUP_LABEL } from '../dev/format';
import { useFocusRow } from '../filters/useFilters';
import { useQaIssues } from './api';
import { shadeSteps } from './format';

const CHART_ROWS = 15;
const barHeight = (n: number) => Math.max(160, n * 22 + 50);

export function IssuesByAssigneeCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaIssues(by);
  const focus = useFocusRow();
  const [view, setView] = useState<'status' | 'type'>('status');
  // Most issues on top; ECharts draws the first category at the bottom.
  const rows = useMemo(
    () =>
      [...(data?.byAssignee ?? [])]
        .sort((a, b) => b.total - a.total)
        .slice(0, CHART_ROWS)
        .reverse(),
    [data],
  );
  const series =
    view === 'status'
      ? [
          { name: 'Open', key: 'open', color: token('--warn') },
          { name: 'Resolved', key: 'resolved', color: token('--primary') },
        ]
      : [
          { name: 'Bug', key: 'bug', color: token('--bad') },
          { name: 'Feedback', key: 'feedback', color: token('--primary-muted') },
        ];

  return (
    <Card
      title={`Issues by ${by}`}
      className={className}
      loading={isLoading}
      empty={rows.length === 0}
      action={
        <Actions>
          <GroupToggle value={by} onChange={setBy} />
          <ViewToggle
            value={view}
            onChange={setView}
            options={[
              { value: 'status', label: 'Open / Resolved' },
              { value: 'type', label: 'Bug / Feedback' },
            ]}
          />
        </Actions>
      }
    >
      <Chart
        label={`Issues per ${by}`}
        height={barHeight(rows.length)}
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
          series: series.map((s, i) => ({
            name: s.name,
            type: 'bar',
            stack: 'n',
            barMaxWidth: 14,
            itemStyle: {
              color: s.color,
              borderRadius: i === series.length - 1 ? [0, 3, 3, 0] : 0,
            },
            data: rows.map((r) => r[s.key as 'open' | 'resolved' | 'bug' | 'feedback']),
          })),
        }}
      />
    </Card>
  );
}

export function IssuesByStageCard({ className }: { className?: string }) {
  const { data, isLoading } = useQaIssues();
  const stages = data?.byStage.stages ?? [];
  const colors = shadeSteps(stages.map((s) => s.color));

  return (
    <Card
      title="Issues by Kanban stage"
      className={className}
      loading={isLoading}
      empty={!!data && stages.every((s) => s.count === 0)}
      action={<span className="text-table text-text-muted">Board order, board colours</span>}
    >
      <Chart
        label="Issues per Kanban stage"
        height={260}
        option={{
          grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
          tooltip: { trigger: 'item' },
          xAxis: {
            type: 'category',
            data: stages.map((s) => s.stage),
            axisTick: { show: false },
            axisLabel: { interval: 0, rotate: 35, fontSize: 9 },
            axisLine: { lineStyle: { color: token('--border') } },
          },
          yAxis: { type: 'value', show: false },
          series: [
            {
              type: 'bar',
              name: 'Issues',
              barMaxWidth: 36,
              label: { show: true, position: 'top', fontFamily: 'Manrope', fontWeight: 700 },
              data: stages.map((s, i) => ({
                value: s.count,
                itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] },
              })),
            },
          ],
        }}
      />
      {data && data.byStage.unmapped > 0 && (
        <p className="text-table text-text-muted">
          {data.byStage.unmapped} issues are in a stage the dashboard does not know.
        </p>
      )}
    </Card>
  );
}

/** Lighter to darker red as open issues get older. */
const AGE_BUCKETS: Bucket<IssueAgeBucket>[] = [
  { key: '0-2', label: '0 to 2', color: '--bad-soft' },
  { key: '3-7', label: '3 to 7', color: '#EE7C7E' },
  { key: '8-14', label: '8 to 14', color: '--bad' },
  { key: '15+', label: 'over 14', color: '--bad-dark' },
];

export function IssueAgeCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaIssues(by);
  return (
    <BucketCard
      title="Age of open issues"
      chartLabel="Open issues by days since created"
      className={className}
      buckets={AGE_BUCKETS}
      totals={data?.age.totals}
      rows={data?.age.rows}
      loading={isLoading}
      rowLabel={GROUP_LABEL[by]}
      extraAction={<GroupToggle value={by} onChange={setBy} />}
      emptyText="No open issues in these filters."
      footnote={<p className="text-table text-text-muted">Days since the issue was created.</p>}
    />
  );
}

export function ReworkCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaIssues(by);
  const focus = useFocusRow();
  const rows = useMemo(
    () =>
      (data?.rework ?? [])
        .filter((r) => r.rework > 0)
        .slice(0, CHART_ROWS)
        .reverse(),
    [data],
  );

  return (
    <Card
      title={by === 'project' ? 'Rework by project' : 'Rework by developer'}
      className={className}
      loading={isLoading}
      empty={!!data && rows.length === 0}
      emptyText="No rework in these filters."
      action={<GroupToggle value={by} onChange={setBy} />}
    >
      <Chart
        label={`Rework count per ${by}`}
        height={barHeight(rows.length)}
        onClick={(p) => {
          const row = rows[p.dataIndex];
          if (row) focus(by, row.id);
        }}
        option={{
          grid: { left: 8, right: 96, top: 8, bottom: 8, containLabel: true },
          tooltip: {
            trigger: 'item',
            formatter: (p: unknown) => {
              const r = rows[(p as { dataIndex: number }).dataIndex]!;
              return `${r.name}<br/>${r.rework} reopens on ${r.reworkIssues} of ${r.issues} issues (${r.reworkPct}%)`;
            },
          },
          xAxis: { type: 'value', show: false },
          yAxis: {
            type: 'category',
            data: rows.map((r) => r.name),
            axisTick: { show: false },
            axisLabel: { width: 140, overflow: 'truncate' },
            axisLine: { lineStyle: { color: token('--border') } },
          },
          series: [
            {
              type: 'bar',
              name: 'Rework',
              barMaxWidth: 14,
              itemStyle: { color: token('--bad'), borderRadius: [0, 3, 3, 0] },
              label: {
                show: true,
                position: 'right',
                formatter: (p: unknown) => {
                  const r = rows[(p as { dataIndex: number }).dataIndex]!;
                  return `${r.rework} · ${r.reworkPct}%`;
                },
              },
              data: rows.map((r) => r.rework),
            },
          ],
        }}
      />
      <p className="text-table text-text-muted">
        Reopens, and the % of their issues that were reworked.
      </p>
    </Card>
  );
}
