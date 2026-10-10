// KPI-07 activity: the busiest projects of the last 7 days in plain counts, and the silent ones.
import { Card } from '../../components/Card';
import { CountButton } from '../../components/CountButton';
import { useFocusRow } from '../filters/useFilters';
import { useKpiActivity } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';
import { ago } from './format';
import { Sparkline } from './parts';

const PARTS = [
  { key: 'newTasks', label: 'new tasks' },
  { key: 'bugs', label: 'bugs raised' },
  { key: 'moves', label: 'stage moves' },
  { key: 'comments', label: 'comments' },
] as const;

export function ActivityCard({ className }: { className?: string }) {
  const { data, isLoading } = useKpiActivity();
  const focus = useFocusRow();
  const openList = useOpenKpiList();

  return (
    <Card
      title="Activity, last 7 days"
      info={KPI_INFO.activity}
      className={className}
      loading={isLoading}
      empty={!!data && !data.hot.length && !data.silent.length}
      emptyText="No activity in these filters."
    >
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {data.hot.map((h, i) => (
              <div key={h.id} className="rounded-card border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    title="Show only this project"
                    onClick={() => focus('project', h.id)}
                    className="min-w-0 text-left font-heading text-h3 text-primary-dark hover:text-primary hover:underline"
                  >
                    <span className="mr-1 text-text-muted">{i + 1}.</span>
                    {h.name}
                  </button>
                </div>
                <p className="text-table text-text-muted">{h.owner?.name ?? 'No owner'}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-table">
                  {PARTS.map((p) => (
                    <div key={p.key} className="flex justify-between gap-2">
                      <dt className="text-text-muted">{p.label}</dt>
                      <dd className="font-bold tabular-nums">{h.parts[p.key]}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-2">
                  <Sparkline
                    values={h.spark}
                    width={140}
                    label={`Actions per day, last 14 days: ${h.spark.join(', ')}`}
                  />
                </div>
              </div>
            ))}
          </div>

          {data.silent.length > 0 && (
            <div>
              <h3 className="mb-1 font-heading text-label uppercase text-text-muted">
                Silent projects: open tasks, no action for 10+ working days
              </h3>
              <ul className="divide-y divide-primary-soft-100">
                {data.silent.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => focus('project', s.id)}
                      className="min-w-40 flex-1 text-left font-bold text-primary-dark hover:text-primary hover:underline"
                    >
                      {s.name}
                    </button>
                    <span className="text-text-muted">{s.owner?.name ?? 'No owner'}</span>
                    <span>
                      <CountButton
                        n={s.open}
                        onClick={() =>
                          openList(
                            {
                              label: `${s.name} · Open`,
                              params: { kpi: 'open', project: String(s.id) },
                              info: KPI_INFO.active,
                            },
                            { by: 'project', id: s.id },
                          )
                        }
                      />{' '}
                      open
                      {s.overdue > 0 && <span className="text-bad"> · {s.overdue} overdue</span>}
                    </span>
                    <span className="font-bold text-bad">
                      No action for {Math.floor(s.idleWorkingDays ?? 0)} working days
                    </span>
                    <span className="text-table text-text-muted">last {ago(s.lastAction)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
