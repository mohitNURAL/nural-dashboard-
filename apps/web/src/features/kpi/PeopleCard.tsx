// KPI-04 people: delivery per person for the period, open and overdue now, and a trend of
// closed tasks. A name sets the Assignee filter; every count opens its tasks.
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { KpiPerson } from '../../api/types';
import { Card } from '../../components/Card';
import { CountButton } from '../../components/CountButton';
import { DataTable, type Columns } from '../../components/DataTable';
import { useFocusRow, useKpiControls } from '../filters/useFilters';
import { useKpiPeople } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';
import { DEPT_LABEL, PERIOD_WORDS } from './format';
import { Sparkline } from './parts';

const col = createColumnHelper<KpiPerson>();

export function PeopleCard({ className }: { className?: string }) {
  const { data, isLoading } = useKpiPeople();
  const focus = useFocusRow();
  const openList = useOpenKpiList();
  const { period } = useKpiControls();
  const words = PERIOD_WORDS[period];

  const columns = useMemo(() => {
    const open = (p: KpiPerson, what: string, params: Record<string, string>, info: string) =>
      openList(
        { label: `${p.name} · ${what}`, params: { ...params, assignee: String(p.id) }, info },
        { by: 'assignee', id: p.id },
      );
    const closedLabel = `Closed ${words.now.toLowerCase()}`;
    return [
      col.accessor('name', {
        header: 'Person',
        cell: (c) => (
          <button
            type="button"
            title="Show only this person"
            onClick={() => focus('assignee', c.row.original.id)}
            className="text-left font-bold text-primary-dark hover:text-primary hover:underline"
          >
            {c.getValue()}
          </button>
        ),
      }),
      col.accessor((p) => DEPT_LABEL[p.dept], { id: 'dept', header: 'Department' }),
      col.accessor((p) => p.rates.closed, {
        id: 'closed',
        header: closedLabel,
        meta: { align: 'center', info: KPI_INFO.closed },
        cell: (c) => {
          const p = c.row.original;
          const diff = p.rates.closed - p.closedPrev;
          return (
            <span className="inline-flex items-center gap-1.5">
              <CountButton
                n={p.rates.closed}
                onClick={() => open(p, closedLabel, { kpi: 'closed' }, KPI_INFO.closed)}
              />
              {diff !== 0 && (
                <span
                  className={diff > 0 ? 'text-good' : 'text-bad'}
                  title={`${words.prev}: ${p.closedPrev}`}
                >
                  {diff > 0 ? '▲' : '▼'}
                  {Math.abs(diff)}
                </span>
              )}
            </span>
          );
        },
      }),
      col.accessor((p) => p.rates.onTimePct ?? -1, {
        id: 'onTime',
        header: 'On-time',
        meta: { align: 'center', info: KPI_INFO.onTime },
        cell: (c) => {
          const v = c.row.original.rates.onTimePct;
          return v === null ? <span className="text-text-muted">-</span> : `${v} %`;
        },
      }),
      col.accessor((p) => p.rates.open, {
        id: 'open',
        header: 'Open',
        meta: { align: 'center' },
        cell: (c) => (
          <CountButton
            n={c.getValue()}
            onClick={() => open(c.row.original, 'Open', { kpi: 'open' }, KPI_INFO.open)}
          />
        ),
      }),
      col.accessor((p) => p.rates.overdue, {
        id: 'overdue',
        header: 'Overdue',
        meta: { align: 'center', info: KPI_INFO.overdue },
        cell: (c) => (
          <CountButton
            n={c.getValue()}
            tone="bad"
            onClick={() => open(c.row.original, 'Overdue', { kpi: 'overdue' }, KPI_INFO.overdue)}
          />
        ),
      }),
      col.accessor((p) => p.workload?.dueSoon ?? 0, {
        id: 'dueSoon',
        header: 'Due in 10 days',
        meta: { align: 'center', info: 'Open tasks due in the next 10 working days.' },
        cell: (c) => (
          <CountButton
            n={c.getValue()}
            onClick={() =>
              open(c.row.original, 'Due in 10 working days', { kpi: 'dueSoon' }, KPI_INFO.workload)
            }
          />
        ),
      }),
      col.accessor((p) => p.rates.reworkCycles, {
        id: 'rework',
        header: 'Sent back',
        meta: {
          align: 'center',
          info: 'QA send-backs on the tasks this person closed in the period.',
        },
      }),
      col.display({
        id: 'trend',
        header: `Closed, last 8 ${words.unit}s`,
        cell: (c) => (
          <Sparkline
            values={c.row.original.spark}
            label={`Closed per ${words.unit}: ${c.row.original.spark.join(', ')}`}
          />
        ),
      }),
    ] as Columns<KpiPerson>;
  }, [focus, openList, words]);

  return (
    <Card
      title="People"
      info={KPI_INFO.people}
      className={className}
      loading={isLoading}
      empty={!!data && data.rows.length === 0}
    >
      {data && (
        <DataTable
          tableId="kpi-people"
          columns={columns}
          data={data.rows}
          rowKey={(r) => r.id}
          initialSorting={[{ id: 'closed', desc: true }]}
          maxHeight={420}
          dense
        />
      )}
    </Card>
  );
}
