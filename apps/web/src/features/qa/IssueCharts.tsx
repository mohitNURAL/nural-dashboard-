// QA-02 issues by assignee, QA-04 issue ageing,
// QA-05 rework by developer (QA-03 is IssueStageCard). QA-02, 04 and 05 can also be grouped by
// project.
import { useMemo, useState } from 'react';
import type { DevPreset, IssuePreset } from '@nural/shared';
import { createColumnHelper } from '@tanstack/react-table';
import type { GroupBy, QaIssues } from '../../api/types';
import { CountButton } from '../../components/CountButton';
import { DataTable, type Columns } from '../../components/DataTable';
import { GROUP_LABEL } from '../dev/format';
import { useFocusRow } from '../filters/useFilters';
import { AgeingCard } from '../../components/AgeingCard';
import { Actions, Card, GroupToggle, ViewToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { useQaIssues } from './api';
import { useOpenIssues } from './issueList';
import { INFO } from '../info';

const CHART_ROWS = 15;

type Status = 'open' | 'resolved';
type Kind = 'bug' | 'feedback';
type IssueRow = QaIssues['byAssignee'][number];
type TableRow = QaIssues['table']['rows'][number];

const STATUS_LABEL: Record<Status, string> = { open: 'Open', resolved: 'Resolved' };
const KIND_LABEL: Record<Kind, string> = { bug: 'Bug', feedback: 'Feedback' };
const CELL_KEY = {
  open: { bug: 'openBug', feedback: 'openFeedback' },
  resolved: { bug: 'resolvedBug', feedback: 'resolvedFeedback' },
} as const;
const cell = (r: IssueRow, st: Status, k: Kind) => r[CELL_KEY[st][k]];

/** One stacked segment: a status and a type, e.g. Open bugs. */
interface Segment {
  st: Status;
  k: Kind;
  name: string;
  color: string;
}

/**
 * Open / Resolved mode stacks open bugs, open feedback, resolved bugs, resolved feedback; Bug /
 * Feedback mode stacks bugs open, bugs resolved, feedback open, feedback resolved.
 */
function segments(view: 'status' | 'type'): Segment[] {
  if (view === 'status') {
    return [
      { st: 'open', k: 'bug', name: 'Open · Bug', color: '#D97706' },
      { st: 'open', k: 'feedback', name: 'Open · Feedback', color: '#FCD34D' },
      { st: 'resolved', k: 'bug', name: 'Resolved · Bug', color: token('--primary') },
      {
        st: 'resolved',
        k: 'feedback',
        name: 'Resolved · Feedback',
        color: token('--primary-muted'),
      },
    ];
  }
  return [
    { st: 'open', k: 'bug', name: 'Bug · Open', color: token('--bad') },
    { st: 'resolved', k: 'bug', name: 'Bug · Resolved', color: token('--bad-soft') },
    { st: 'open', k: 'feedback', name: 'Feedback · Open', color: token('--primary') },
    { st: 'resolved', k: 'feedback', name: 'Feedback · Resolved', color: token('--primary-muted') },
  ];
}

/** Tooltip line: a group total and the other split inside it, e.g. Open 12 (Bug 10, Feedback 2). */
const splitLine = (label: string, a: number, b: number, la: string, lb: string) =>
  `${label} <b>${a + b}</b> (${la} ${a}, ${lb} ${b})`;

const barHeight = (n: number) => Math.max(160, n * 22 + 50);
const tcol = createColumnHelper<TableRow>();

type CountKey = 'total' | 'pending' | 'done' | 'dueToday' | 'completedToday' | 'completedYesterday';
/** Which issue list each table column opens ("Done" = sent to QA). */
const COUNT_PRESET: Record<CountKey, DevPreset | IssuePreset> = {
  total: 'all',
  pending: 'pending',
  done: 'completed',
  dueToday: 'dueToday',
  completedToday: 'doneToday',
  completedYesterday: 'doneYesterday',
};

export function IssuesByAssigneeCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaIssues(by);
  const openIssues = useOpenIssues();
  const focus = useFocusRow();
  const [view, setView] = useState<'status' | 'type' | 'table'>('status');
  // Most issues on top; ECharts draws the first category at the bottom.
  const rows = useMemo(
    () =>
      [...(data?.byAssignee ?? [])]
        .sort((a, b) => b.total - a.total)
        .slice(0, CHART_ROWS)
        .reverse(),
    [data],
  );
  const segs = segments(view === 'type' ? 'type' : 'status');

  const openSegment = (r: IssueRow, sg: Segment) =>
    openIssues(
      {
        preset: sg.st,
        label: `${r.name} · ${STATUS_LABEL[sg.st]} · ${KIND_LABEL[sg.k]}`,
        params: { [by]: String(r.id), type: sg.k },
      },
      { by, id: r.id },
    );

  const columns = useMemo(() => {
    const totals = data?.table.totals;
    const count = (key: CountKey, header: string, info: string) =>
      tcol.accessor(key, {
        header,
        meta: { align: 'right', info },
        cell: (c) => {
          const r = c.row.original;
          return (
            <CountButton
              n={c.getValue()}
              onClick={() =>
                openIssues(
                  {
                    preset: COUNT_PRESET[key],
                    label: `${r.name} · ${header}`,
                    params: { [by]: String(r.id) },
                  },
                  { by, id: r.id },
                )
              }
            />
          );
        },
        footer: () => (
          <CountButton
            n={totals?.[key]}
            onClick={() => openIssues({ preset: COUNT_PRESET[key], label: header })}
          />
        ),
      });
    return [
      tcol.accessor('name', {
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
      count('total', 'Total', 'All bugs and feedback of this row.'),
      count('pending', 'Pending', INFO.colPending),
      count('done', 'Done', INFO.colDone),
      count('dueToday', 'Due today', INFO.colDueToday),
      count('completedToday', 'Comp. today', INFO.colCompToday),
      count('completedYesterday', 'Comp. yesterday', INFO.colCompYesterday),
    ] as Columns<TableRow>;
  }, [data, by, openIssues, focus]);

  return (
    <Card
      title={`Issues by ${by}`}
      info={INFO.issuesByAssignee}
      className={className}
      loading={isLoading}
      empty={!!data && data.byAssignee.length === 0}
      action={
        <Actions>
          <GroupToggle value={by} onChange={setBy} />
          <ViewToggle
            value={view}
            onChange={setView}
            options={[
              { value: 'status', label: 'Open / Resolved' },
              { value: 'type', label: 'Bug / Feedback' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </Actions>
      }
    >
      {data && view === 'table' && (
        <DataTable
          columns={columns}
          data={data.table.rows}
          rowKey={(r) => r.id}
          initialSorting={[{ id: 'total', desc: true }]}
          showFooter
          maxHeight={360}
          dense
        />
      )}
      {view !== 'table' && (
        <Chart
          label={`Issues per ${by}`}
          height={barHeight(rows.length)}
          onClick={(p) => {
            const row = rows[p.dataIndex];
            const sg = segs.find((x) => x.name === p.seriesName);
            if (row && sg) openSegment(row, sg);
          }}
          option={{
            grid: { left: 8, right: 16, top: 8, bottom: 40, containLabel: true },
            legend: { bottom: 0, itemWidth: 10, itemHeight: 10, icon: 'rect' },
            tooltip: {
              trigger: 'axis',
              axisPointer: { type: 'shadow' },
              formatter: (params: unknown) => {
                const list = params as { dataIndex: number }[];
                const r = rows[list[0]?.dataIndex ?? -1];
                if (!r) return '';
                const lines =
                  view === 'type'
                    ? [
                        splitLine(
                          'Bug',
                          cell(r, 'open', 'bug'),
                          cell(r, 'resolved', 'bug'),
                          'Open',
                          'Resolved',
                        ),
                        splitLine(
                          'Feedback',
                          cell(r, 'open', 'feedback'),
                          cell(r, 'resolved', 'feedback'),
                          'Open',
                          'Resolved',
                        ),
                      ]
                    : [
                        splitLine(
                          'Open',
                          cell(r, 'open', 'bug'),
                          cell(r, 'open', 'feedback'),
                          'Bug',
                          'Feedback',
                        ),
                        splitLine(
                          'Resolved',
                          cell(r, 'resolved', 'bug'),
                          cell(r, 'resolved', 'feedback'),
                          'Bug',
                          'Feedback',
                        ),
                      ];
                return [`<b>${r.name}</b> · ${r.total} issues`, ...lines].join('<br/>');
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
            series: segs.map((sg, i) => ({
              name: sg.name,
              type: 'bar',
              stack: 'n',
              barMaxWidth: 14,
              itemStyle: {
                color: sg.color,
                borderRadius: i === segs.length - 1 ? [0, 3, 3, 0] : 0,
              },
              data: rows.map((r) => cell(r, sg.st, sg.k) || null),
            })),
          }}
        />
      )}
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
