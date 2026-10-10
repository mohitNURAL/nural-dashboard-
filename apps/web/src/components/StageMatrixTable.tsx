// Stage x assignee (or project) heat matrix, shared by the Development tab (DEV-05) and the QA
// tab (QA-03): stage colour bars, cells shaded by count and split into not overdue and overdue
// (red), each stage's total in its colour bar; every number opens its tasks.
import type { StageTitle } from '@nural/shared';
import { heatShade } from '../features/dev/format';
import { CountButton } from './CountButton';

export interface MatrixRow {
  id: number;
  name: string;
  total: number;
  cells: Record<StageTitle, number>;
  overdue: Record<StageTitle, number>;
}

interface Props {
  data: { stages: { stage: StageTitle; color: string }[]; rows: MatrixRow[]; max: number };
  /** Header of the name column ("Assignee" or "Project"). */
  rowLabel: string;
  /** "tasks" or "issues", for the footnote. */
  noun: string;
  onName: (row: MatrixRow) => void;
  /** A number was clicked: the row, extra list params (stage, overdue) and a label. */
  onOpen: (row: MatrixRow, params: Record<string, string>, what: string) => void;
}

export function StageMatrixTable({ data, rowLabel, noun, onName, onOpen }: Props) {
  // Each stage's total over all rows, shown inside its colour bar.
  const stageTotal = (stage: StageTitle) => data.rows.reduce((n, r) => n + r.cells[stage], 0);
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full border-separate border-spacing-0.5 text-table">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 bg-surface px-2 py-1 text-left font-heading text-label font-bold uppercase text-text-muted">
              {rowLabel}
            </th>
            {data.stages.map((s) => (
              <th
                key={s.stage}
                scope="col"
                className="sticky top-0 z-10 min-w-[4.5rem] bg-surface px-1 py-1 align-bottom font-heading text-label font-bold text-text"
              >
                <span className="flex flex-col items-center gap-1">
                  <span
                    className="w-full rounded-full text-center font-heading text-label font-bold leading-4 text-white"
                    style={{ background: s.color, textShadow: '0 0 2px rgb(0 0 0 / 0.45)' }}
                    title={`${s.stage}: ${stageTotal(s.stage)} ${noun}`}
                  >
                    {stageTotal(s.stage).toLocaleString('en-IN')}
                  </span>
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
                  title={`Show only this ${rowLabel.toLowerCase()}`}
                  onClick={() => onName(r)}
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
                  onOpen={(extra, what) => onOpen(r, extra, what)}
                />
              ))}
              <td className="px-2 py-1 text-right font-bold">
                <CountButton n={r.total} onClick={() => onOpen(r, {}, 'All stages')} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-table text-text-muted">
        Each cell: not overdue, then <span className="font-bold text-bad">overdue</span> in red.
        Click a number to open those {noun}.
      </p>
    </div>
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
