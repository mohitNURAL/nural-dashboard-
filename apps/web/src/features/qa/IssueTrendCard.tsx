// Issue trend over the last 7 days, four lines: bugs and feedback filed (light) and resolved
// (dark; pushed to QA Backlog, as Last resolved). The Assignee / Project switch and the picker
// narrow it to one person or project; a point opens those issues.
import { useMemo, useState } from 'react';
import type { GroupBy, TrendSeries } from '../../api/types';
import { Actions, Card, GroupToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { SearchCombobox } from '../../components/SearchCombobox';
import { INFO } from '../info';
import { useQaIssues } from './api';
import { useOpenIssues } from './issueList';

type Kind = 'bug' | 'feedback';

/** One line: its name, colour, values, and which issues a point opens. */
interface Line {
  name: string;
  color: string;
  values: (s: TrendSeries) => number[];
  preset: 'lastFiled' | 'lastResolved';
  type: Kind;
}

/** Same shade per type: filed light, resolved dark. */
const lines = (): Line[] => [
  {
    name: 'Bug filed',
    color: token('--bad'),
    values: (s) => s.bug,
    preset: 'lastFiled',
    type: 'bug',
  },
  {
    name: 'Bug resolved',
    color: token('--bad-dark'),
    values: (s) => s.bugResolved,
    preset: 'lastResolved',
    type: 'bug',
  },
  {
    name: 'Feedback filed',
    color: token('--primary-muted'),
    values: (s) => s.feedback,
    preset: 'lastFiled',
    type: 'feedback',
  },
  {
    name: 'Feedback resolved',
    color: token('--primary-dark'),
    values: (s) => s.feedbackResolved,
    preset: 'lastResolved',
    type: 'feedback',
  },
];

/** "2026-10-09" → "Thu 9 Oct" (the key is already an APP_TIMEZONE day). */
const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export function IssueTrendCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const [picked, setPicked] = useState<number | null>(null);
  const { data, isLoading } = useQaIssues(by);
  const openIssues = useOpenIssues();
  const trend = data?.trend;
  const row = trend?.rows.find((r) => r.id === picked) ?? null;
  const series = row ?? trend?.totals;
  const labels = useMemo(() => (trend?.days ?? []).map(dayLabel), [trend]);
  const all = lines();

  const changeBy = (b: GroupBy) => {
    setBy(b);
    setPicked(null);
  };

  return (
    <Card
      title="Issue trend, last 7 days"
      info={INFO.issueTrend}
      className={className}
      loading={isLoading}
      action={
        <Actions>
          <GroupToggle value={by} onChange={changeBy} />
          <SearchCombobox
            label={by === 'project' ? 'All projects' : 'All assignees'}
            single
            className="h-8 w-56"
            options={(trend?.rows ?? []).map((r) => ({
              value: String(r.id),
              label: r.name,
              count: r.total,
            }))}
            selected={picked ? [String(picked)] : []}
            onChange={(v) => setPicked(v[0] ? Number(v[0]) : null)}
          />
        </Actions>
      }
    >
      {trend && series && (
        <Chart
          label="Issues filed and resolved per day"
          height={260}
          onClick={(p) => {
            const line = all.find((x) => x.name === p.seriesName);
            const day = trend.days[p.dataIndex];
            if (!line || !day) return;
            openIssues(
              {
                preset: line.preset,
                label: [row?.name, `${line.name} ${labels[p.dataIndex]}`]
                  .filter(Boolean)
                  .join(' · '),
                params: {
                  day,
                  type: line.type,
                  ...(row ? { [by]: String(row.id) } : {}),
                },
              },
              row ? { by, id: row.id } : undefined,
            );
          }}
          option={{
            grid: { left: 8, right: 16, top: 24, bottom: 28, containLabel: true },
            legend: { bottom: 0, itemWidth: 14, itemHeight: 3 },
            tooltip: { trigger: 'axis' },
            xAxis: {
              type: 'category',
              data: labels,
              boundaryGap: false,
              axisTick: { show: false },
              axisLine: { lineStyle: { color: token('--border') } },
            },
            yAxis: {
              type: 'value',
              minInterval: 1,
              splitLine: { lineStyle: { color: token('--primary-soft-100') } },
            },
            series: all.map((l) => ({
              name: l.name,
              type: 'line',
              data: l.values(series),
              symbolSize: 7,
              label: {
                show: true,
                position: 'top',
                fontFamily: 'Manrope',
                fontWeight: 700,
                // Zeros sit on the axis together; their labels would only overlap.
                formatter: (p: unknown) => {
                  const v = (p as { value: number }).value;
                  return v ? String(v) : '';
                },
              },
              itemStyle: { color: l.color },
              lineStyle: { width: 2 },
            })),
          }}
        />
      )}
    </Card>
  );
}
