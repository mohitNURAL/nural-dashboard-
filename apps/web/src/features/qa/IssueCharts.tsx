// QA-02 issues by assignee, QA-04 issue ageing,
// QA-05 rework by developer (QA-03 is IssueStageCard). QA-02, 04 and 05 can also be grouped by
// project.
import { useMemo, useState } from 'react';
import type { IssuePreset } from '@nural/shared';
import type { GroupBy } from '../../api/types';
import { AgeingCard } from '../../components/AgeingCard';
import { Actions, Card, GroupToggle, ViewToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { useQaIssues } from './api';
import { useOpenIssues } from './issueList';
import { INFO } from '../info';

const CHART_ROWS = 15;

/** What a bar of "Issues by assignee" opens, by its series. */
const SERIES_TARGET: Record<string, { preset: IssuePreset; params: Record<string, string> }> = {
  Open: { preset: 'open', params: {} },
  Resolved: { preset: 'resolved', params: {} },
  Bug: { preset: 'all', params: { type: 'bug' } },
  Feedback: { preset: 'all', params: { type: 'feedback' } },
};
const barHeight = (n: number) => Math.max(160, n * 22 + 50);

export function IssuesByAssigneeCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaIssues(by);
  const openIssues = useOpenIssues();
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
      info={INFO.issuesByAssignee}
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
          if (!row) return;
          // Open / Resolved open those issues; Bug / Feedback narrow by type.
          const series = SERIES_TARGET[p.seriesName ?? ''];
          if (!series) return;
          openIssues(
            {
              preset: series.preset,
              label: `${row.name} · ${p.seriesName}`,
              params: { [by]: String(row.id), ...series.params },
            },
            { by, id: row.id },
          );
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

/** Issue ageing: the same card as DEV-03 task ageing, for open issues. */
export function IssueAgeingCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaIssues(by);
  const openIssues = useOpenIssues();
  return (
    <AgeingCard
      title="Issue ageing, days past deadline"
      info={INFO.issueAge}
      noun="issues"
      className={className}
      by={by}
      onBy={setBy}
      data={data?.ageing}
      loading={isLoading}
      onOpen={(key, label, row) =>
        openIssues(
          {
            preset: 'open',
            label,
            params: { ageing: key, ...(row ? { [by]: String(row.id) } : {}) },
          },
          row ? { by, id: row.id } : undefined,
        )
      }
    />
  );
}

export function ReworkCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaIssues(by);
  const openIssues = useOpenIssues();
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
      info={INFO.rework}
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
          if (!row) return;
          openIssues(
            { preset: 'rework', label: `${row.name} · Rework`, params: { [by]: String(row.id) } },
            { by, id: row.id },
          );
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
