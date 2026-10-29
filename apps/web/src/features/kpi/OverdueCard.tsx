// KPI-06 overdue: the total by days late, then the projects and people holding it. Every
// number opens its tasks; a project or person number also sets that filter.
import clsx from 'clsx';
import { forwardRef } from 'react';
import type { KpiOverdueGroup, OverdueBucket } from '../../api/types';
import { Card } from '../../components/Card';
import { CountButton } from '../../components/CountButton';
import { useFocusRow } from '../filters/useFilters';
import { useKpiOverdue } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';

const BUCKETS: { key: OverdueBucket; label: string; cls: string }[] = [
  { key: '1-2', label: '1-2 d', cls: 'bg-bad-soft text-bad-dark' },
  { key: '3-7', label: '3-7 d', cls: 'bg-bad-soft text-bad-dark' },
  { key: '8-30', label: '8-30 d', cls: 'bg-bad text-white' },
  { key: '30+', label: '30+ d', cls: 'bg-bad-dark text-white' },
];
const TOP = 8;

export const OverdueCard = forwardRef<HTMLDivElement, { className?: string }>(function OverdueCard(
  { className },
  ref,
) {
  const { data, isLoading } = useKpiOverdue();
  const openList = useOpenKpiList();
  const focus = useFocusRow();

  const open = (
    label: string,
    params: Record<string, string>,
    by?: { by: 'project' | 'assignee'; id: number },
  ) => openList({ label, params: { kpi: 'overdue', ...params }, info: KPI_INFO.overdue2 }, by);

  const group = (title: string, by: 'project' | 'assignee', rows: KpiOverdueGroup[]) => (
    <div className="min-w-0">
      <h3 className="mb-1 font-heading text-label uppercase text-text-muted">{title}</h3>
      <ul className="divide-y divide-primary-soft-100">
        {rows.slice(0, TOP).map((g) => (
          <li key={g.id} className="flex items-center gap-2 py-1.5">
            <button
              type="button"
              title={`Show only this ${by === 'project' ? 'project' : 'person'}`}
              onClick={() => focus(by, g.id)}
              className="min-w-0 flex-1 truncate text-left font-bold text-primary-dark hover:text-primary hover:underline"
            >
              {g.name}
            </button>
            <span className="flex gap-1">
              {BUCKETS.map((b) =>
                g.buckets[b.key] ? (
                  <button
                    key={b.key}
                    type="button"
                    title={`${g.buckets[b.key]} tasks ${b.label} late`}
                    onClick={() =>
                      open(
                        `${g.name} · ${b.label} late`,
                        { [by]: String(g.id), kpiAgeing: b.key },
                        { by, id: g.id },
                      )
                    }
                    className={clsx('rounded px-1.5 text-label font-bold tabular-nums', b.cls)}
                  >
                    {g.buckets[b.key]}
                  </button>
                ) : null,
              )}
            </span>
            <span className="w-10 text-right">
              <CountButton
                n={g.total}
                tone="bad"
                onClick={() =>
                  open(`${g.name} · Overdue`, { [by]: String(g.id) }, { by, id: g.id })
                }
              />
            </span>
          </li>
        ))}
      </ul>
      {rows.length > TOP && (
        <p className="mt-1 text-table text-text-muted">
          Top {TOP} of {rows.length}.
        </p>
      )}
    </div>
  );

  return (
    <div ref={ref} className={className}>
      <Card
        title="Overdue"
        info={KPI_INFO.overdue2}
        loading={isLoading}
        empty={!!data && data.total === 0}
        emptyText="Nothing overdue in these filters."
      >
        {data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => open('Overdue', {})}
                className="font-heading text-title text-bad hover:underline"
              >
                {data.total.toLocaleString('en-IN')}
              </button>
              <span className="text-text-muted">open tasks past deadline</span>
              <span className="flex flex-wrap gap-1.5">
                {BUCKETS.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    disabled={!data.buckets[b.key]}
                    onClick={() => open(`Overdue · ${b.label} late`, { kpiAgeing: b.key })}
                    className={clsx(
                      'rounded px-2 py-0.5 text-table font-bold disabled:opacity-40',
                      b.cls,
                    )}
                  >
                    {b.label}: {data.buckets[b.key]}
                  </button>
                ))}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {group('By project', 'project', data.byProject)}
              {group('By person', 'assignee', data.byAssignee)}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
});
