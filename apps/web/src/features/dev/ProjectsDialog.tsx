// Development tab Projects (2026-10-13): the projects in a popup, most active this week first, then
// the earliest deadline. Each project is an accordion row (one open at a time) listing who works on
// it. Like every table (2026-10-14): a Columns menu, headers dragged into order, project rows
// dragged by the grip into the reader's own order, an "i" on every column, and Excel and PDF of
// the whole table. A count closes the popup and opens its tasks; their list has a Back button.
import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { Fragment, useMemo, useState } from 'react';
import type { ProjectWorkRow, WorkCounts } from '../../api/types';
import { ViewToggle } from '../../components/Card';
import { InfoTip } from '../../components/InfoTip';
import { ColumnsMenu } from '../../components/table/ColumnsMenu';
import { SortableRow, SortableTh, TableDnd } from '../../components/table/sortable';
import { dropRow, inOrder, moveTo, useTableLayout } from '../../components/table/useTableLayout';
import { IconClose, IconExcel, IconGrip, IconLayers, IconPdf } from '../../components/ui/icons';
import { SearchInput } from '../../components/ui/SearchInput';
import { Tip } from '../../components/ui/Tip';
import { useFilterSummary } from '../filters/useFilters';
import { useDevProjects } from './api';
import { useDrillTo } from './drill';
import { fmtDate } from './format';
import {
  countOf,
  PROJECT_COLUMN_IDS,
  projectColumns,
  PROJECTS_TABLE_ID,
  type CountKey,
  type ProjectColumn,
  type ProjectColumnId,
} from './projectsColumns';
import { useProjectsPopup, type ProjectPeriod, type ProjectShow } from './projectsPopup';

const SHOW_TITLE: Record<ProjectShow, string> = {
  all: 'All projects',
  active: 'Active projects',
  silent: 'Silent projects',
  hold: 'Projects on hold',
};
const STATUS_LABEL = { active: 'Active', silent: 'Silent', hold: 'On hold' } as const;
const STATUS_STYLE = {
  active: { bar: 'border-l-good', chip: 'bg-good/15 text-good' },
  silent: { bar: 'border-l-warn', chip: 'bg-warn/15 text-warn' },
  hold: { bar: 'border-l-primary', chip: 'bg-primary/10 text-primary' },
} as const;
const PERIOD_LABEL: Record<ProjectPeriod, string> = { day: 'Day', week: 'Week', month: 'Month' };

export function ProjectsDialog() {
  const { open, show, expanded, close, toggle, openPopup, period, setPeriod } = useProjectsPopup();
  const { data, isLoading } = useDevProjects(period);
  const drill = useDrillTo();
  const showing = useFilterSummary('dev');
  const lay = useTableLayout(PROJECTS_TABLE_ID);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);

  const defs = projectColumns(period);
  // The reader's column order and choice (new columns join at the end).
  const orderedIds = useMemo(() => {
    const saved = (lay.cols ?? []).filter((id): id is ProjectColumnId =>
      PROJECT_COLUMN_IDS.includes(id as ProjectColumnId),
    );
    return [...saved, ...PROJECT_COLUMN_IDS.filter((id) => !saved.includes(id))];
  }, [lay.cols]);
  const cols = orderedIds.filter((id) => !lay.hidden.includes(id)).map((id) => defs[id]);

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase();
    const list = (data?.rows ?? []).filter(
      (r) =>
        (show === 'all' || r.status === show) &&
        (!words ||
          r.name.toLowerCase().includes(words) ||
          r.people.some((p) => p.person.name.toLowerCase().includes(words))),
    );
    return lay.custom ? inOrder(list, (r) => String(r.id), lay.rows) : list;
  }, [data, show, q, lay.custom, lay.rows]);
  if (!open) return null;

  const title = `Projects at work · ${SHOW_TITLE[show]}`;
  const fileShowing = `${PERIOD_LABEL[period]} view${showing ? ` · ${showing}` : ''}`;
  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    setBusy(kind);
    try {
      const m = await import('./projectsExport');
      const table = m.projectTable(rows, cols);
      if (kind === 'xlsx') await m.exportProjectsExcel(title, fileShowing, table);
      else m.exportProjectsPdf(title, fileShowing, table);
    } finally {
      setBusy(null);
    }
  };

  /** Closes the popup and opens the tasks behind a count; their list can come back here. */
  const openTasks = (label: string, c: ProjectColumn, params: Record<string, string>) => {
    close();
    drill({
      label: `${label} · ${c.label}`,
      preset: c.preset!,
      params: c.period ? { ...params, period } : params,
      back: 'projects',
    });
  };
  const countCell = (
    c: ProjectColumn,
    w: WorkCounts,
    label: string,
    params: Record<string, string>,
    strong: boolean,
  ) => {
    const { n, issues } = countOf(w, c.id as CountKey);
    if (!n) return <span className="text-text-muted">0</span>;
    return (
      <Tip
        label={`Dev tasks ${(n - issues).toLocaleString('en-IN')} · Issues ${issues.toLocaleString('en-IN')}`}
        hint={`${c.label}: click for the tasks`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openTasks(label, c, params);
          }}
          className={clsx(
            'inline-flex min-w-[2.25rem] justify-center rounded-full px-2 py-0.5 font-heading font-bold tabular-nums transition hover:scale-105 hover:shadow-sm',
            c.tone === 'bad'
              ? 'bg-bad/10 text-bad hover:bg-bad/20'
              : strong
                ? 'bg-primary/10 text-primary-dark hover:bg-primary/20'
                : 'bg-primary-soft-100 text-primary-dark hover:bg-primary/15',
          )}
        >
          {n.toLocaleString('en-IN')}
        </button>
      </Tip>
    );
  };
  const cell = (
    c: ProjectColumn,
    w: WorkCounts,
    label: string,
    params: Record<string, string>,
    strong: boolean,
  ) => {
    if (c.id === 'activity')
      return (
        <span title={w.lastActivity ? `Last activity ${fmtDate(w.lastActivity)}` : undefined}>
          {w.activityWeek ? (
            <b className="tabular-nums text-good">{w.activityWeek}</b>
          ) : (
            <span className="text-text-muted">0</span>
          )}
        </span>
      );
    if (c.id === 'deadline') {
      const late = !!w.lastDeadline && new Date(w.lastDeadline) < new Date();
      return (
        <span
          className={clsx(
            'whitespace-nowrap',
            strong ? 'font-bold' : 'text-text-muted',
            late && w.open > 0 && 'text-bad',
          )}
        >
          {w.lastDeadline ? fmtDate(w.lastDeadline) : '—'}
        </span>
      );
    }
    return countCell(c, w, label, params, strong);
  };
  const align = (c: ProjectColumn) =>
    c.id === 'deadline' ? 'text-left' : 'text-center tabular-nums';

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(1240px,97vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none">
          <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-white">
              <IconLayers size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                Projects at work: {SHOW_TITLE[show]} ({rows.length})
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                {lay.custom
                  ? 'In your own order. '
                  : 'Most active this week first, then the earliest deadline. '}
                Open a project to see who works on it; click a count for its tasks.
                {show !== 'all' && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => openPopup('all')}
                      className="font-heading font-bold text-primary hover:underline"
                    >
                      Show all projects
                    </button>
                  </>
                )}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg/40 px-5 py-2.5">
            <ViewToggle<ProjectPeriod>
              value={period}
              onChange={setPeriod}
              options={(['day', 'week', 'month'] as const).map((p) => ({
                value: p,
                label: PERIOD_LABEL[p],
              }))}
            />
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search project or person…"
              label="Search projects"
              className="w-60"
            />
            <span className="flex-1" />
            {lay.custom && (
              <button
                type="button"
                onClick={() => lay.setCustom(false)}
                title="Back to most active first"
                className="inline-flex h-8 items-center gap-1.5 rounded-control border border-accent bg-accent/10 px-2.5 font-heading text-button text-accent-dark"
              >
                <IconGrip size={13} /> Your order ×
              </button>
            )}
            <ColumnsMenu
              columns={orderedIds.map((id) => ({
                id,
                label: defs[id].label,
                shown: !lay.hidden.includes(id),
              }))}
              onOrder={lay.setCols}
              onHidden={lay.setHidden}
              onReset={lay.resetColumns}
            />
            <button
              type="button"
              onClick={() => void exportAs('xlsx')}
              disabled={!!busy || !rows.length}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 font-heading text-button text-text hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <IconExcel size={14} /> {busy === 'xlsx' ? 'Exporting…' : 'Excel'}
            </button>
            <button
              type="button"
              onClick={() => void exportAs('pdf')}
              disabled={!!busy || !rows.length}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 font-heading text-button text-text hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <IconPdf size={14} /> {busy === 'pdf' ? 'Exporting…' : 'PDF'}
            </button>
          </div>
          <div className="flex-1 overflow-auto px-5 py-3">
            {isLoading ? (
              <p className="py-8 text-center text-text-muted">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-text-muted">No project here.</p>
            ) : (
              <TableDnd
                onColumn={(id, over) => lay.setCols(moveTo(orderedIds, id, over))}
                onRow={(id, over) =>
                  lay.setRows(
                    dropRow(
                      rows.map((r) => String(r.id)),
                      lay.rows,
                      id,
                      over,
                    ),
                  )
                }
              >
                <div className="nural-table-wrap">
                  <table className="nural-table w-full border-separate border-spacing-0 text-table">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th aria-label="Drag to order projects" data-grip className="w-7 px-1" />
                        <th className="px-3 py-2.5 text-left font-heading text-label font-bold uppercase tracking-wide">
                          Project / assignee
                        </th>
                        <SortableContext
                          items={cols.map((c) => `col:${c.id}`)}
                          strategy={horizontalListSortingStrategy}
                        >
                          {cols.map((c) => (
                            <SortableTh
                              key={c.id}
                              id={c.id}
                              enabled
                              title="Drag to move this column"
                              scope="col"
                              className={clsx(
                                'cursor-grab whitespace-nowrap px-3 py-2.5 font-heading text-label font-bold uppercase tracking-wide active:cursor-grabbing',
                                align(c),
                              )}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {c.label}
                                <InfoTip text={c.info} label={c.label} />
                              </span>
                            </SortableTh>
                          ))}
                        </SortableContext>
                      </tr>
                    </thead>
                    <tbody>
                      <SortableContext
                        items={rows.map((r) => `row:${r.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {rows.map((r) => (
                          <ProjectRows
                            key={r.id}
                            r={r}
                            cols={cols}
                            isOpen={expanded === r.id}
                            onToggle={() => toggle(r.id)}
                            cell={cell}
                            align={align}
                          />
                        ))}
                      </SortableContext>
                    </tbody>
                  </table>
                </div>
              </TableDnd>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type CellFn = (
  c: ProjectColumn,
  w: WorkCounts,
  label: string,
  params: Record<string, string>,
  strong: boolean,
) => React.ReactNode;

/** A project line (dragged by its grip, clicked to open) and, when open, its people. */
function ProjectRows({
  r,
  cols,
  isOpen,
  onToggle,
  cell,
  align,
}: {
  r: ProjectWorkRow;
  cols: ProjectColumn[];
  isOpen: boolean;
  onToggle: () => void;
  cell: CellFn;
  align: (c: ProjectColumn) => string;
}) {
  const style = STATUS_STYLE[r.status];
  return (
    <Fragment>
      <SortableRow
        id={String(r.id)}
        enabled
        onClick={onToggle}
        aria-expanded={isOpen}
        className={clsx(
          'cursor-pointer transition-colors',
          isOpen ? 'bg-primary-soft-100' : 'bg-surface hover:bg-primary-soft-100/60',
        )}
        grip={(handle) => (
          <td
            {...handle}
            data-grip
            onClick={(e) => e.stopPropagation()}
            title="Drag to move this project"
            className={clsx(
              'w-7 cursor-grab border-b border-l-4 border-border px-1 text-text-muted active:cursor-grabbing',
              style.bar,
            )}
          >
            <IconGrip size={13} />
          </td>
        )}
      >
        <td className="border-b border-border px-3 py-2.5 font-heading font-bold text-primary-dark">
          <span className="inline-flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className={clsx(
                'inline-grid h-5 w-5 place-items-center rounded-md bg-primary/10 text-primary transition-transform',
                isOpen && 'rotate-90',
              )}
            >
              ›
            </span>
            {r.name}
            <span
              className={clsx(
                'rounded-full px-2 py-0.5 font-heading text-[11px] font-bold',
                style.chip,
              )}
            >
              {STATUS_LABEL[r.status]}
            </span>
            <span className="font-body text-[12px] font-normal text-text-muted">
              {r.people.length} {r.people.length === 1 ? 'person' : 'people'}
            </span>
          </span>
        </td>
        {cols.map((c) => (
          <td key={c.id} className={clsx('border-b border-border px-3 py-2.5', align(c))}>
            {cell(c, r, r.name, { project: String(r.id) }, true)}
          </td>
        ))}
      </SortableRow>
      {isOpen &&
        (r.people.length ? (
          r.people.map((p, i) => (
            <tr key={p.id} className={i % 2 ? 'bg-bg/70' : 'bg-surface'}>
              <td className="border-b border-l-4 border-border border-l-primary-soft-300" />
              <td className="border-b border-border px-3 py-2 pl-10 text-text">
                <span className="inline-flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-primary to-accent font-heading text-[10px] font-bold text-white">
                    {p.person.name
                      .split(/\s+/)
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </span>
                  {p.person.name}
                </span>
              </td>
              {cols.map((c) => (
                <td key={c.id} className={clsx('border-b border-border px-3 py-2', align(c))}>
                  {cell(
                    c,
                    p,
                    `${r.name} · ${p.person.name}`,
                    { project: String(r.id), assignee: String(p.id) },
                    false,
                  )}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td className="border-b border-l-4 border-border border-l-primary-soft-300" />
            <td
              colSpan={cols.length + 1}
              className="border-b border-border px-3 py-2 pl-10 text-text-muted"
            >
              No one has open tasks here.
            </td>
          </tr>
        ))}
    </Fragment>
  );
}
