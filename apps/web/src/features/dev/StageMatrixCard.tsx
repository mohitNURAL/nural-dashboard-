// DEV-05: tasks by stage and assignee, heat-shaded by count; the tag toggle filters the matrix.
import { useState } from 'react';
import { Card } from '../../components/Card';
import { SearchCombobox } from '../../components/SearchCombobox';
import { useFilters } from '../filters/useFilters';
import { useDevMatrix } from './api';
import { heatShade } from './format';

export function StageMatrixCard({ className }: { className?: string }) {
  const [tag, setTag] = useState<string | null>(null);
  const { data, isLoading } = useDevMatrix(tag);
  const { setFilters } = useFilters();

  return (
    <Card
      title="Tasks by stage and assignee"
      className={className}
      loading={isLoading}
      empty={data?.rows.length === 0}
      action={
        <SearchCombobox
          label={tag ? 'Tag' : 'Tag: all'}
          single
          className="h-8 w-56"
          options={(data?.tags ?? []).map((t) => ({
            value: t.value,
            label: t.value,
            count: t.count,
          }))}
          selected={tag ? [tag] : []}
          onChange={(v) => setTag(v[0] ?? null)}
        />
      }
    >
      {data && (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full border-separate border-spacing-0.5 text-table">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-surface px-2 py-1 text-left font-heading text-label font-bold uppercase text-text-muted">
                  Assignee
                </th>
                {data.stages.map((s) => (
                  <th
                    key={s.stage}
                    scope="col"
                    className="sticky top-0 z-10 min-w-[4.5rem] bg-surface px-1 py-1 align-bottom font-heading text-label font-bold text-text"
                  >
                    <span className="flex flex-col items-center gap-1">
                      <span className="h-1.5 w-full rounded-full" style={{ background: s.color }} />
                      <span className="leading-tight">{s.stage}</span>
                    </span>
                  </th>
                ))}
                <th className="sticky top-0 z-10 bg-surface px-2 py-1 text-right font-heading text-label font-bold uppercase text-text-muted">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1 text-left font-normal"
                  >
                    <button
                      type="button"
                      title="Show only this assignee"
                      onClick={() => setFilters({ assignee: [r.id] })}
                      className="hover:text-primary hover:underline"
                    >
                      {r.person.name}
                    </button>
                  </th>
                  {data.stages.map((s) => {
                    const n = r.cells[s.stage];
                    return (
                      <td
                        key={s.stage}
                        className="rounded px-1 py-1.5 text-center tabular-nums"
                        style={heatShade(n, data.max)}
                        title={`${r.person.name} · ${s.stage}: ${n}`}
                      >
                        {n || <span className="text-primary-soft-300">·</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right font-bold tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
