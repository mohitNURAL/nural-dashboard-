// QA-03 Issues by Kanban stage. Matrix (default): the same stage heat matrix as the Development
// tab, for issues, with a Bug / Feedback selector in place of the tag. Table: a row per assignee
// or project with Bug, Feedback, Total and a column per stage. Chart: board-order bars. Every
// number opens those issues; a number of one row also sets the Assignee or Project filter.
import type { StageTitle } from '@nural/shared';
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { GroupBy, IssueStageCounts, Named } from '../../api/types';
import { Actions, Card, GroupToggle, ViewToggle } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { CountButton } from '../../components/CountButton';
import { DataTable, type Columns } from '../../components/DataTable';
import { SearchCombobox } from '../../components/SearchCombobox';
import { StageMatrixTable, type MatrixRow } from '../../components/StageMatrixTable';
import { GROUP_LABEL } from '../dev/format';
import { useFocusRow } from '../filters/useFilters';
import { INFO } from '../info';
import { useQaIssues, useQaSummary } from './api';
import { shadeSteps } from './format';
import { useOpenIssues } from './issueList';

type Row = Named & IssueStageCounts;
const col = createColumnHelper<Row>();
const TYPE_LABEL = { bug: 'Bug', feedback: 'Feedback' } as const;

export function IssueStageCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const [view, setView] = useState<'matrix' | 'table' | 'chart'>('matrix');
  const [type, setType] = useState<'bug' | 'feedback' | null>(null);
  const { data, isLoading } = useQaIssues(by, type);
  const { data: summary } = useQaSummary();
  const openIssues = useOpenIssues();
  const focus = useFocusRow();
  const table = data?.stageTable;

  // The Bug / Feedback selector narrows every view and the issues a number opens.
  const typeParam = useMemo((): Record<string, string> => (type ? { type } : {}), [type]);
  const typeLabel = type ? TYPE_LABEL[type] : null;
  const openFromMatrix = (r: MatrixRow, params: Record<string, string>, what: string) =>
    openIssues(
      {
        preset: 'all',
        label: [r.name, what, typeLabel].filter(Boolean).join(' · '),
        params: { ...params, ...typeParam, [by]: String(r.id) },
      },
      { by, id: r.id },
    );

  const columns = useMemo(() => {
    if (!table) return [] as Columns<Row>;
    // Opens the issues behind one number: a row (with its filter) or the totals row.
    const open = (r: Row | null, what: string, params: Record<string, string>) =>
      openIssues(
        {
          preset: 'all',
          label: [r?.name, what, typeLabel].filter(Boolean).join(' · '),
          params: { ...params, ...typeParam, ...(r ? { [by]: String(r.id) } : {}) },
        },
        r ? { by, id: r.id } : undefined,
      );
    const count = (
      id: string,
      header: string,
      value: (r: IssueStageCounts) => number,
      params: Record<string, string>,
      info?: string,
    ) =>
      col.accessor((r) => value(r), {
        id,
        header,
        meta: { align: 'right', info },
        cell: (c) => (
          <CountButton
            n={c.getValue()}
            title={`Open ${c.row.original.name}: ${header}`}
            onClick={() => open(c.row.original, header, params)}
          />
        ),
        footer: () => (
          <CountButton n={value(table.totals)} onClick={() => open(null, header, params)} />
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
            className="whitespace-nowrap text-left font-bold text-primary-dark hover:text-primary hover:underline"
          >
            {c.getValue()}
          </button>
        ),
        footer: 'Total',
      }),
      count('bug', 'Bug', (r) => r.bug, { type: 'bug' }, 'Issues tagged bug.'),
      count(
        'feedback',
        'Feedback',
        (r) => r.feedback,
        { type: 'feedback' },
        'Issues tagged feedback.',
      ),
      count('total', 'Total', (r) => r.total, {}, 'Bug + feedback.'),
      ...table.stages.map(({ stage }) =>
        count(`stage:${stage}`, stage, (r) => r.cells[stage as StageTitle] ?? 0, { stage }),
      ),
    ] as Columns<Row>;
  }, [table, by, typeParam, typeLabel, openIssues, focus]);

  return (
    <Card
      title={`Issues by stage and ${by}`}
      info={INFO.issuesByStage}
      className={className}
      loading={isLoading}
      empty={!!data && !table?.rows.length}
      action={
        <Actions>
          {view !== 'chart' && <GroupToggle value={by} onChange={setBy} />}
          <ViewToggle
            value={view}
            onChange={setView}
            options={[
              { value: 'matrix', label: 'Matrix' },
              { value: 'table', label: 'Table' },
              { value: 'chart', label: 'Chart' },
            ]}
          />
          <SearchCombobox
            label={type ? 'Type' : 'Bug / Feedback: all'}
            single
            className="h-8 w-56"
            options={(summary?.parts ?? []).map((p) => ({
              value: p.key,
              label: TYPE_LABEL[p.key],
              count: p.total,
            }))}
            selected={type ? [type] : []}
            onChange={(v) => setType((v[0] as 'bug' | 'feedback' | undefined) ?? null)}
          />
        </Actions>
      }
    >
      {data && view === 'matrix' && (
        <StageMatrixTable
          data={data.matrix}
          rowLabel={GROUP_LABEL[by]}
          noun="issues"
          onName={(r) => focus(by, r.id)}
          onOpen={openFromMatrix}
        />
      )}
      {table && view === 'table' && (
        <DataTable
          tableId="qa-stages"
          columns={columns}
          data={table.rows}
          rowKey={(r) => r.id}
          initialSorting={[{ id: 'total', desc: true }]}
          showFooter
          maxHeight={360}
          dense
        />
      )}
      {data && view === 'chart' && <StageBars stages={data.byStage.stages} />}
    </Card>
  );
}

/** Issues per stage in board order and board colours (repeated colours shaded apart). */
function StageBars({ stages }: { stages: { stage: StageTitle; count: number; color: string }[] }) {
  const colors = shadeSteps(stages.map((s) => s.color));
  return (
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
  );
}
