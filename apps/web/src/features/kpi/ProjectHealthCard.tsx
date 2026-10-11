// KPI-02 project health: one row per project, worst first. A project name sets the Project
// filter; every count opens its tasks (and sets the filter to that project).
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import { forwardRef, useMemo } from 'react';
import type { Health, KpiProject } from '../../api/types';
import { Card } from '../../components/Card';
import { CountButton } from '../../components/CountButton';
import { DataTable, type Columns } from '../../components/DataTable';
import { useFocusRow, useKpiControls } from '../filters/useFilters';
import { useKpiProjects } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';
import { ago, PERIOD_WORDS } from './format';
import { HealthChip } from './parts';

const col = createColumnHelper<KpiProject>();
const RANK: Record<Health, number> = { red: 0, amber: 1, green: 2 };

export const ProjectHealthCard = forwardRef<HTMLDivElement, { className?: string }>(
  function ProjectHealthCard({ className }, ref) {
    const { data, isLoading } = useKpiProjects();
    const focus = useFocusRow();
    const openList = useOpenKpiList();
    const { period } = useKpiControls();
    const words = PERIOD_WORDS[period];

    const columns = useMemo(() => {
      const open = (p: KpiProject, what: string, params: Record<string, string>, info: string) =>
        openList(
          { label: `${p.name} · ${what}`, params: { ...params, project: String(p.id) }, info },
          { by: 'project', id: p.id },
        );
      return [
        col.accessor('name', {
          header: 'Project',
          cell: (c) => (
            <button
              type="button"
              title="Show only this project"
              onClick={() => focus('project', c.row.original.id)}
              className="text-left font-bold text-primary-dark hover:text-primary hover:underline"
            >
              {c.getValue()}
            </button>
          ),
        }),
        col.accessor((p) => p.owner?.name ?? '', { id: 'owner', header: 'Owner' }),
        col.accessor((p) => RANK[p.status], {
          id: 'status',
          header: 'Status',
          meta: { info: KPI_INFO.projects },
          cell: (c) => <HealthChip status={c.row.original.status} />,
        }),
        col.accessor('open', {
          header: 'Open',
          meta: { align: 'right' },
          cell: (c) => (
            <CountButton
              n={c.getValue()}
              onClick={() => open(c.row.original, 'Open', { kpi: 'open' }, KPI_INFO.open)}
            />
          ),
        }),
        col.accessor('overdue', {
          header: 'Overdue',
          meta: { align: 'right', info: KPI_INFO.overdue },
          cell: (c) => (
            <CountButton
              n={c.getValue()}
              tone="bad"
              onClick={() => open(c.row.original, 'Overdue', { kpi: 'overdue' }, KPI_INFO.overdue)}
            />
          ),
        }),
        col.accessor('oldestOverdueDays', {
          header: 'Most late',
          meta: { align: 'right', info: 'Days past deadline of its most overdue open task.' },
          cell: (c) =>
            c.getValue() ? (
              <span className={clsx(c.getValue() > 30 && 'font-bold text-bad')}>
                {c.getValue()} d
              </span>
            ) : (
              <span className="text-text-muted">—</span>
            ),
        }),
        col.accessor('noDeadline', {
          header: 'No deadline',
          meta: { align: 'right' },
          cell: (c) => (
            <CountButton
              n={c.getValue()}
              onClick={() =>
                open(c.row.original, 'No deadline', { kpi: 'noDeadline' }, KPI_INFO.noDeadline)
              }
            />
          ),
        }),
        col.accessor((p) => p.rates.closed, {
          id: 'closed',
          header: `Closed ${words.now.toLowerCase()}`,
          meta: { align: 'right', info: KPI_INFO.closed },
          cell: (c) => (
            <CountButton
              n={c.getValue()}
              onClick={() =>
                open(
                  c.row.original,
                  `Closed ${words.now.toLowerCase()}`,
                  { kpi: 'closed' },
                  KPI_INFO.closed,
                )
              }
            />
          ),
        }),
        col.accessor((p) => p.rates.onTimePct ?? -1, {
          id: 'onTime',
          header: 'On-time',
          meta: { align: 'right', info: KPI_INFO.onTime },
          cell: (c) => {
            const v = c.row.original.rates.onTimePct;
            return v === null ? <span className="text-text-muted">—</span> : `${v} %`;
          },
        }),
        col.accessor('completionPct', {
          header: 'Done',
          meta: { info: 'Closed tasks out of all its tasks.' },
          cell: (c) => (
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded bg-primary-soft-100">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${Math.min(100, c.getValue())}%` }}
                />
              </span>
              <span className="tabular-nums text-text-muted">{Math.round(c.getValue())} %</span>
            </span>
          ),
        }),
        col.accessor((p) => p.idleWorkingDays ?? 9999, {
          id: 'lastAction',
          header: 'Last action',
          meta: { info: 'Last task change or comment. Red after 3 working days without one.' },
          cell: (c) => {
            const p = c.row.original;
            const stale = (p.idleWorkingDays ?? 0) > 3 && p.open > 0;
            return stale ? (
              <span className="font-bold text-bad">
                No action for {Math.floor(p.idleWorkingDays!)} working days
              </span>
            ) : (
              ago(p.lastAction)
            );
          },
        }),
      ] as Columns<KpiProject>;
    }, [focus, openList, words]);

    return (
      <div ref={ref} className={className}>
        <Card
          title="Project health"
          info={KPI_INFO.projects}
          loading={isLoading}
          empty={!!data && data.rows.length === 0}
        >
          {data && (
            <DataTable
              tableId="kpi-projects"
              columns={columns}
              data={data.rows}
              rowKey={(r) => r.id}
              maxHeight={440}
              dense
            />
          )}
        </Card>
      </div>
    );
  },
);
