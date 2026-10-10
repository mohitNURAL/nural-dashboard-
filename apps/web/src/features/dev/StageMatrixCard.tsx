// DEV-05: tasks by stage and assignee (or project), heat-shaded by count; the tag toggle filters
// the matrix. Each cell splits into not overdue and overdue (red); both open their tasks.
import type { StageTitle } from '@nural/shared';
import { useState } from 'react';
import type { GroupBy } from '../../api/types';
import { Actions, Card, GroupToggle } from '../../components/Card';
import { SearchCombobox } from '../../components/SearchCombobox';
import { useFocusRow } from '../filters/useFilters';
import { CountButton } from '../../components/CountButton';
import { useDevMatrix } from './api';
import { rowParams, useDrillTo } from './drill';
import { GROUP_LABEL, heatShade } from './format';
import { INFO } from '../info';

export function StageMatrixCard({ className }: { className?: string }) {
  const [tag, setTag] = useState<string | null>(null);
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useDevMatrix(tag, by);
  const focus = useFocusRow();
  const drill = useDrillTo();
  // The tag toggle narrows the drill-down too.
  const tagParams: Record<string, string> = tag ? { tag } : {};
  const open = (r: { id: number; name: string }, extra: Record<string, string>, what: string) =>
    drill(
      {
        label: [r.name, what, tag].filter(Boolean).join(' · '),
        preset: 'total',
        params: { ...rowParams(by, r.id), ...tagParams, ...extra },
      },
      { by, id: r.id },
    );

  return (
    <Card
      title={`Tasks by stage and ${by}`}
      info={INFO.matrix}
      className={className}
      loading={isLoading}
      empty={data?.rows.length === 0}
      action={
        <Actions>
          <GroupToggle value={by} onChange={setBy} />
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
        </Actions>
      }
    >
      {data && (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full border-separate border-spacing-0.5 text-table">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-surface px-2 py-1 text-left font-heading text-label font-bold uppercase text-text-muted">
                  {GROUP_LABEL[by]}
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
                      title={`Show only this ${by}`}
                      onClick={() => focus(by, r.id)}
                      className="hover:text-primary hover:underline"
                    >
                      {r.name}
                    </button>
                  </th>
                  {data.stages.map((s) => (
                    <MatrixCell
                      key={s.stage}
                      stage={s.stage}
                      n={r.cells[s.stage]}
                      overdue={r.overdue[s.stage]}
                      max={data.max}
                      rowName={r.name}
                      onOpen={(extra, what) => open(r, extra, what)}
                    />
                  ))}
                  <td className="px-2 py-1 text-right font-bold">
                    <CountButton n={r.total} onClick={() => open(r, {}, 'All stages')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-table text-text-muted">
            Each cell: not overdue, then <span className="font-bold text-bad">overdue</span> in red.
            Click a number to open those tasks.
          </p>
        </div>
      )}
    </Card>
  );
}

interface CellProps {
  stage: StageTitle;
  n: number;
  overdue: number;
  max: number;
  rowName: string;
  onOpen: (params: Record<string, string>, what: string) => void;
}

/** One stage x row cell: heat shade by count, split into not overdue and overdue. */
function MatrixCell({ stage, n, overdue, max, rowName, onOpen }: CellProps) {
  const onTime = n - overdue;
  const shade = heatShade(n, max);
  return (
    <td
      className="rounded px-1 py-1.5 text-center tabular-nums"
      style={shade}
      title={`${rowName} · ${stage}: ${n}${overdue ? ` (${overdue} overdue)` : ''}`}
    >
      {n === 0 ? (
        <span className="text-primary-soft-300">·</span>
      ) : (
        <span className="inline-flex items-center gap-1">
          {onTime > 0 && (
            <button
              type="button"
              onClick={() =>
                onOpen({ stage, overdue: 'false' }, overdue ? `${stage}, not overdue` : stage)
              }
              className="hover:underline"
            >
              {onTime}
            </button>
          )}
          {overdue > 0 && (
            <button
              type="button"
              onClick={() => onOpen({ stage, overdue: 'true' }, `${stage}, overdue`)}
              className="rounded bg-bad px-1 font-bold text-white hover:bg-bad-dark"
            >
              {overdue}
            </button>
          )}
        </span>
      )}
    </td>
  );
}
