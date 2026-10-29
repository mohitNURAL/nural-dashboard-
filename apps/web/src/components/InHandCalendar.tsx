// Tasks in hand as a planner (2026-10-20), opened from the Tasks in hand tile on KPI, Development
// and QA. One row per person (or project), one column per day, week or month from today, then
// Later; Overdue first, in red. A person's cell lists the projects their tasks there belong to; a
// project's cell lists who works on it. The cell's tint grows with what is planned in it, so heavy
// days and weeks stand out for sprint planning. Every count opens its tasks in the tab's list.
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { useMemo, useState, type CSSProperties } from 'react';
import { useApi } from '../api/queries';
import type { InHandCalendar, InHandCalendarCell } from '../api/types';
import { heading, isWeekend } from './calendarHeading';
import { usePlanner } from './plannerStore';
import { GroupToggle, ViewToggle } from './Card';
import { IconCalendar, IconClose, IconExcel, IconPdf } from './ui/icons';
import { SearchInput } from './ui/SearchInput';

type View = InHandCalendar['view'];
type Column = InHandCalendar['columns'][number];

export interface InHandCalendarSource {
  /** The tab's calendar endpoint, e.g. /api/dev/inhand/calendar. */
  path: string;
  /** The tab's filter params. */
  params: Record<string, string>;
  /** What the filters cover, printed on the Excel and PDF. */
  showing?: string;
  /** Opens the tab's list: due in a column (`overdue` false) or overdue, narrowed by `params`. */
  onOpen: (label: string, params: Record<string, string>, overdue: boolean) => void;
}

const VIEWS: { value: View; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];
const ITEMS_SHOWN = 3;

/** The cell's tint: stronger the more is planned in it (relative to the busiest cell). */
const heat = (n: number, max: number): CSSProperties | undefined =>
  n && max
    ? {
        background: `color-mix(in srgb, var(--primary) ${Math.round(6 + (n / max) * 22)}%, transparent)`,
      }
    : undefined;

export function InHandCalendarDialog({
  source,
  onClose,
}: {
  source: InHandCalendarSource;
  onClose: () => void;
}) {
  const { view, setView, by, setBy, q, setQ } = usePlanner();
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const { data, isLoading } = useApi<InHandCalendar>(source.path, {
    ...source.params,
    view,
    groupBy: by,
  });

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        !words ||
        r.name.toLowerCase().includes(words) ||
        Object.values(r.cells).some((c) =>
          c.items.some((i) => i.name.toLowerCase().includes(words)),
        ),
    );
  }, [data, q]);
  const columns = useMemo(() => data?.columns ?? [], [data]);
  const max = useMemo(
    () => Math.max(0, ...rows.flatMap((r) => columns.map((c) => r.cells[c.key]?.count ?? 0))),
    [rows, columns],
  );
  const today = data?.today ?? '';
  const row = by === 'project' ? 'project' : 'assignee';
  const item = by === 'project' ? 'assignee' : 'project';

  // Excel and PDF of every row shown (search applied), in the view and grouping chosen.
  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    if (!data) return;
    setBusy(kind);
    try {
      const m = await import('./inHandCalendarExport');
      const title = `Tasks in hand planner · ${VIEWS.find((v) => v.value === view)!.label} · ${
        by === 'project' ? 'Project' : 'Assignee'
      }`;
      const note = [source.showing, q.trim() && `search “${q.trim()}”`].filter(Boolean).join(' · ');
      const table = m.plannerTable(data, rows);
      if (kind === 'xlsx') await m.exportPlannerExcel(title, note || 'All tasks in hand', table);
      else m.exportPlannerPdf(title, note || 'All tasks in hand', table);
    } finally {
      setBusy(null);
    }
  };

  const open = (label: string, params: Record<string, string>, overdue: boolean) => {
    onClose();
    source.onOpen(label, params, overdue);
  };
  const range = (c: Column): Record<string, string> => ({
    dateField: 'deadline',
    from: c.from,
    ...(c.to ? { to: c.to } : {}),
    due: 'ahead',
  });

  /** A cell: its count (opens the tasks) and what it splits into (each opens its own). */
  const cell = (
    cellData: InHandCalendarCell | undefined,
    label: string,
    params: Record<string, string>,
    overdue: boolean,
  ) => {
    if (!cellData?.count) return <span className="text-text-muted/40">·</span>;
    const rest = cellData.items.slice(ITEMS_SHOWN);
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          title={`${label}: click for the tasks`}
          onClick={() => open(label, params, overdue)}
          className={clsx(
            'self-start rounded-full px-2 py-0.5 font-heading text-[12px] font-bold tabular-nums transition hover:scale-105',
            overdue ? 'bg-bad text-white' : 'bg-primary text-white',
          )}
        >
          {cellData.count}
        </button>
        {cellData.items.slice(0, ITEMS_SHOWN).map((i) => (
          <button
            key={i.id}
            type="button"
            title={`${i.name}: ${i.count} ${i.count === 1 ? 'task' : 'tasks'}`}
            onClick={() =>
              open(`${label} · ${i.name}`, { ...params, [item]: String(i.id) }, overdue)
            }
            className={clsx(
              'flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[11.5px] leading-tight hover:border-primary',
              overdue
                ? 'border-bad/30 bg-surface text-bad-dark'
                : 'border-border bg-surface text-text',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{i.name}</span>
            <b className="tabular-nums">{i.count}</b>
          </button>
        ))}
        {rest.length > 0 && (
          <span
            className="text-[12px] text-text-muted"
            title={rest.map((i) => `${i.name} ${i.count}`).join('\n')}
          >
            +{rest.length} more
          </span>
        )}
      </div>
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(1480px,98vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid h-10 w-10 place-items-center text-primary">
              <IconCalendar size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                Tasks in hand: planner
                {data && (
                  <span className="text-text-muted">
                    {' '}
                    · {data.totals.total - data.totals.overdue} planned
                    {data.totals.overdue ? `, ${data.totals.overdue} overdue` : ''}
                  </span>
                )}
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                Open tasks by their deadline, {by === 'project' ? 'per project' : 'per person'}.
                Each cell shows {by === 'project' ? 'who works on it' : 'the projects they work on'}
                ; darker cells hold more. Click a count for its tasks.
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
            <ViewToggle<View> value={view} onChange={setView} options={VIEWS} />
            <GroupToggle value={by} onChange={setBy} />
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder={
                by === 'project' ? 'Search project or person…' : 'Search person or project…'
              }
              label="Search the planner"
              className="w-60"
            />
            <button
              type="button"
              onClick={() => void exportAs('xlsx')}
              disabled={!!busy || !rows.length}
              className="btn btn-stroke inline-flex h-8 items-center gap-1.5 px-2.5 disabled:opacity-50"
            >
              <IconExcel size={14} /> {busy === 'xlsx' ? 'Exporting…' : 'Excel'}
            </button>
            <button
              type="button"
              onClick={() => void exportAs('pdf')}
              disabled={!!busy || !rows.length}
              className="btn btn-stroke inline-flex h-8 items-center gap-1.5 px-2.5 disabled:opacity-50"
            >
              <IconPdf size={14} /> {busy === 'pdf' ? 'Exporting…' : 'PDF'}
            </button>
            <span className="flex-1" />
            <span className="flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-bad" /> Overdue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-primary" /> Planned
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-accent bg-accent/15" /> Today
              </span>
              {view === 'day' && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-text-muted/20" /> Weekend
                </span>
              )}
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading || !data ? (
              <p className="py-10 text-center text-text-muted">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-text-muted">Nothing planned or overdue here.</p>
            ) : (
              <table className="w-full border-separate border-spacing-0 text-table">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-[210px] border-b border-r border-border bg-surface px-3 py-2 text-left font-heading text-label font-bold uppercase tracking-wide text-primary">
                      {by === 'project' ? 'Project' : 'Assignee'}
                    </th>
                    <th className="min-w-[132px] border-b border-r border-border bg-bad/10 px-2 py-2 text-left font-heading text-label font-bold uppercase text-bad">
                      Overdue
                      <span className="block font-body text-[12px] font-normal normal-case text-bad">
                        past the deadline
                      </span>
                    </th>
                    {columns.map((c, i) => {
                      const [top, dates] = heading(data.view, c, i, today);
                      const isToday =
                        c.from <= today && (c.to === null || today <= c.to) && i === 0;
                      return (
                        <th
                          key={c.key}
                          className={clsx(
                            'min-w-[132px] border-b border-border px-2 py-2 text-left font-heading text-label font-bold uppercase',
                            isToday
                              ? 'bg-accent/15 text-accent-dark'
                              : data.view === 'day' && isWeekend(c.from)
                                ? 'bg-bg text-text-muted'
                                : 'bg-surface text-primary-dark',
                          )}
                        >
                          {top}
                          <span className="block font-body text-[12px] font-normal normal-case text-text-muted">
                            {dates}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rp = { [row]: String(r.id) };
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-2">
                          <span className="block font-heading font-bold text-primary-dark">
                            {r.name}
                          </span>
                          <span className="text-[12px] text-text-muted">
                            {r.total} {r.total === 1 ? 'task' : 'tasks'}
                            {r.overdue.count ? (
                              <b className="text-bad"> · {r.overdue.count} overdue</b>
                            ) : null}
                          </span>
                        </td>
                        <td
                          className={clsx(
                            'border-b border-r border-border px-2 py-2',
                            r.overdue.count ? 'bg-bad/10' : 'bg-bad/[0.03]',
                          )}
                        >
                          {cell(r.overdue, `Overdue · ${r.name}`, rp, true)}
                        </td>
                        {columns.map((c, i) => {
                          const v = r.cells[c.key];
                          const [top, dates] = heading(data.view, c, i, today);
                          return (
                            <td
                              key={c.key}
                              style={heat(v?.count ?? 0, max)}
                              className={clsx(
                                'border-b border-border px-2 py-2',
                                i === 0 && 'border-l-2 border-l-accent/60',
                                !v?.count && data.view === 'day' && isWeekend(c.from) && 'bg-bg',
                              )}
                            >
                              {cell(
                                v,
                                `Tasks in hand · ${r.name} · ${top} ${dates}`,
                                { ...rp, ...range(c) },
                                false,
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                  <tr>
                    <td className="sticky left-0 z-30 border-t-2 border-r border-border bg-primary-soft-100 px-3 py-2 font-heading font-bold text-primary-dark">
                      Total · {data.totals.total}
                    </td>
                    <td className="border-t-2 border-r border-border bg-bad/15 px-2 py-2 font-heading font-bold tabular-nums text-bad">
                      {data.totals.overdue}
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className="border-t-2 border-border bg-primary-soft-100 px-2 py-2 font-heading font-bold tabular-nums text-primary-dark"
                      >
                        {data.totals.cells[c.key] ?? 0}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
