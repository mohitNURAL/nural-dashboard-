// Tasks in hand planner (2026-11-08, SRS 25; mockup docs/tasks-in-hand-planner.html), opened from
// the Tasks in hand tile on KPI, Development and QA: one shared component. One row per person (or
// project); Day shows the 7 days of a week with each day's tasks as Project → Title (Assignee →
// Title on the Project tab), Week and Month count each task once per period. A task shows only on
// a day it was planned for (its deadline, or a Daily update day plan ahead of it); overdue work
// stays red on the day it was missed. Cells turn green, amber or red by how much of what was
// planned got done. A side panel shows a task's plan log, a week or month cell by day, or a row's
// overdue tasks. View, period, grouping and filters live in the URL (plannerStore).
import { shiftStart, type GroupBy } from '@nural/shared';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { apiGet } from '../api/client';
import { useApi } from '../api/queries';
import type {
  PlannerCell,
  PlannerEntry,
  PlannerGrid,
  PlannerOverdue,
  PlannerPeriod,
  PlannerPeriodCell,
  PlannerProgress,
  PlannerTask,
  PlannerTaskLog,
  PlannerView,
} from '../api/types';
import { heading, isWeekend, longDay, ordinal, periodLabel, shortDay } from './calendarHeading';
import { GroupToggle, ViewToggle } from './Card';
import { usePlannerState } from './plannerStore';
import { SearchCombobox } from './SearchCombobox';
import { IconCalendar, IconClose, IconExcel, IconPdf } from './ui/icons';
import { keepOpen } from './ui/keepOpen';
import { SearchInput } from './ui/SearchInput';

export interface InHandCalendarSource {
  /** The tab's planner endpoint, e.g. /api/dev/inhand/calendar. */
  path: string;
  /** The tab's filter params. */
  params: Record<string, string>;
  /** What the filters cover, printed on the Excel and PDF. */
  showing?: string;
  /**
   * Opens the tab's task list (overdue when `overdue`), narrowed by `params`; "Back to planner" on
   * it reopens the planner as it was (its state is in the URL).
   */
  onOpen?: (label: string, params: Record<string, string>, overdue: boolean) => void;
}

const VIEWS: { value: PlannerView; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

type Status = 'all' | 'part' | 'none';
const statusOf = (p: PlannerProgress): Status | null =>
  p.planned === 0 ? null : p.done === p.planned ? 'all' : p.done > 0 ? 'part' : 'none';
const STATUS_TEXT: Record<Status, string> = {
  all: 'All done',
  part: 'Partly done',
  none: 'Nothing done',
};
const STATUS_VAR: Record<Status, string> = { all: '--success', part: '--warn', none: '--bad' };
/** A tinted cell with a 3 px line on its left: green all done, amber partly, red nothing. */
const cellTint = (s: Status | null): CSSProperties | undefined =>
  s
    ? {
        background: `color-mix(in srgb, var(${STATUS_VAR[s]}) 9%, transparent)`,
        boxShadow: `inset 3px 0 0 var(${STATUS_VAR[s]})`,
      }
    : undefined;
const PILL: Record<Status | 'future', string> = {
  all: 'bg-success text-white',
  part: 'bg-warn text-navy',
  none: 'bg-bad text-white',
  future: 'bg-primary-soft text-primary-dark',
};

const firstName = (name: string | undefined) => (name ?? '').split(' ')[0] ?? '';
const pctOf = (p: PlannerProgress) => (p.planned ? Math.round((p.done / p.planned) * 100) : 0);

type Panel =
  | { type: 'task'; id: number }
  | { type: 'period'; row: number; name: string; from: string; to: string; label: string }
  | { type: 'overdue'; row: number; name: string };

export function InHandCalendarDialog({
  source,
  onClose,
}: {
  source: InHandCalendarSource;
  onClose: () => void;
}) {
  const st = usePlannerState();
  const { view, by } = st;
  const [panel, setPanel] = useState<Panel | null>(null);
  // A panel belongs to the grid it came from.
  useEffect(() => setPanel(null), [view, by]);
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  // The search waits for typing to pause before asking the server.
  const [q, setQ] = useState(st.q);
  const { q: urlQ, setQ: setUrlQ } = st;
  useEffect(() => {
    const t = setTimeout(() => q.trim() !== urlQ && setUrlQ(q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setUrlQ is new each render
  }, [q, urlQ]);

  /** The tab's filters and the planner's own (each tab's pick applies on its own tab). */
  const filters = useMemo(() => {
    const p: Record<string, string> = { ...source.params, groupBy: by };
    if (by === 'assignee' && st.assignees.length) p.assignees = st.assignees.join(',');
    if (by === 'project' && st.projects.length) p.projects = st.projects.join(',');
    if (st.q) p.q = st.q;
    return p;
  }, [source.params, by, st.assignees, st.projects, st.q]);
  const { data, isLoading, isFetching } = useApi<PlannerGrid>(source.path, {
    ...filters,
    view,
    ...(st.start ? { start: st.start } : {}),
  });

  const columns = data?.columns ?? [];
  const today = data?.today ?? '';
  const rows = data?.rows ?? [];
  const picks = by === 'project' ? st.projects : st.assignees;
  const pickOptions = (by === 'project' ? data?.choices.projects : data?.choices.assignees) ?? [];

  const move = (dir: number) => data && st.setStart(shiftStart(view, data.start, dir));
  // The planner's state stays in the URL, so it reopens as it was left.
  const close = onClose;

  // Excel and PDF: every entry of the period shown, one line each.
  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    if (!data || !columns.length) return;
    setBusy(kind);
    try {
      const [m, period] = await Promise.all([
        import('./inHandCalendarExport'),
        apiGet<PlannerPeriod>(`${source.path}/period`, {
          ...filters,
          pfrom: columns[0]!.from,
          pto: columns[columns.length - 1]!.to,
        }),
      ]);
      const title = `Tasks in hand planner · ${VIEWS.find((v) => v.value === view)!.label} · ${periodLabel(view, columns)}`;
      const note =
        [source.showing, st.q && `search “${st.q}”`].filter(Boolean).join(' · ') ||
        'All tasks in hand';
      const table = m.plannerTable(period);
      if (kind === 'xlsx') await m.exportPlannerExcel(title, note, table);
      else m.exportPlannerPdf(title, note, table);
    } finally {
      setBusy(null);
    }
  };

  const openTask = (id: number) => setPanel({ type: 'task', id });
  const narrowCol = (c: PlannerGrid['columns'][number]) => view === 'day' && isWeekend(c.from);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overlay" />
        <Dialog.Content
          {...keepOpen}
          className="fixed inset-y-4 left-1/2 z-50 flex w-[min(1560px,98vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none"
        >
          {/* Title */}
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
                    · {data.totals.open} open, {data.totals.overdueNow} overdue now
                  </span>
                )}
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                Each day shows only the tasks planned for it, as{' '}
                {by === 'project' ? 'Assignee → Title' : 'Project → Title'}: by deadline, or taken
                into the assignee&apos;s day plan. Click a task for its plan log.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>

          {/* Toolbar */}
          <div
            role="toolbar"
            aria-label="Planner controls"
            className="flex flex-wrap items-center gap-2 border-b border-border bg-bg/40 px-5 py-2.5"
          >
            <ViewToggle<PlannerView> value={view} onChange={st.setView} options={VIEWS} />
            <GroupToggle value={by} onChange={(b: GroupBy) => st.setBy(b)} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous period"
                onClick={() => move(-1)}
                className="grid h-8 w-8 place-items-center rounded-control text-primary hover:bg-primary-soft-100"
              >
                ‹
              </button>
              <span className="min-w-[11.5rem] text-center font-heading text-label font-bold text-primary-dark">
                {periodLabel(view, columns)}
              </span>
              <button
                type="button"
                aria-label="Next period"
                onClick={() => move(1)}
                className="grid h-8 w-8 place-items-center rounded-control text-primary hover:bg-primary-soft-100"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => st.setStart(null)}
                disabled={!st.start}
                className="btn btn-stroke h-8 px-2.5 disabled:opacity-50"
              >
                Today
              </button>
            </div>
            <SearchCombobox
              label={by === 'project' ? 'Project' : 'Assignee'}
              options={pickOptions.map((o) => ({ value: String(o.id), label: o.name }))}
              selected={picks.map(String)}
              onChange={(v) => (by === 'project' ? st.setProjects : st.setAssignees)(v.map(Number))}
              className="!h-8 w-56"
            />
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search task, person or project"
              label="Search the planner"
              className="w-60"
            />
            <span className="flex-1" />
            {isFetching && <span className="text-[12px] text-text-muted">Updating…</span>}
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
          </div>
          <Legend />

          {/* Grid and side panel */}
          <div className="relative flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 overflow-auto">
              {isLoading || !data ? (
                <p className="py-10 text-center text-text-muted">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="py-10 text-center text-text-muted">Nothing planned in this period.</p>
              ) : (
                <table className="w-full border-separate border-spacing-0 text-table">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      <th className="sticky left-0 z-30 min-w-[200px] border-b border-r border-border bg-surface px-3 py-2 text-left align-top">
                        <span className="block font-heading text-label font-bold uppercase tracking-wide text-primary">
                          {by === 'project' ? 'Project' : 'Assignee'}
                        </span>
                        <span className="font-body text-[12px] font-normal text-text-muted">
                          {rows.length} shown
                        </span>
                      </th>
                      {columns.map((c) => {
                        const [top, dates] = heading(view, c, today);
                        const isToday = c.from <= today && today <= c.to;
                        const tot = data.columnTotals[c.key];
                        return (
                          <th
                            key={c.key}
                            className={clsx(
                              'border-b border-border px-2 py-2 text-left align-top',
                              narrowCol(c)
                                ? 'min-w-[110px]'
                                : view === 'day'
                                  ? 'min-w-[240px]'
                                  : 'min-w-[210px]',
                              isToday
                                ? 'bg-accent/15 text-accent-dark shadow-[inset_0_2px_0_var(--accent)]'
                                : narrowCol(c)
                                  ? 'bg-bg text-text-muted'
                                  : 'bg-surface text-primary-dark',
                            )}
                          >
                            <span className="block font-heading text-label font-bold uppercase">
                              {top}
                            </span>
                            <span className="block font-body text-[12px] font-normal text-text-muted">
                              {dates}
                            </span>
                            {tot && (tot.planned > 0 || !narrowCol(c)) && (
                              <ProgressBar p={tot} future={c.from > today} />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="align-top">
                        <td className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-2">
                          <span className="block font-heading font-bold text-primary-dark">
                            {r.name}
                          </span>
                          <span className="text-[12px] text-text-muted">
                            {r.open} open ·{' '}
                            {r.overdueNow ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPanel({ type: 'overdue', row: r.id, name: r.name })
                                }
                                className="font-bold text-bad underline-offset-2 hover:underline"
                              >
                                {r.overdueNow} overdue now
                              </button>
                            ) : (
                              '0 overdue'
                            )}
                          </span>
                          <ProgressBar p={r.progress} soFar />
                        </td>
                        {columns.map((c) => {
                          const cell = r.cells[c.key];
                          const isToday = c.from <= today && today <= c.to;
                          return (
                            <td
                              key={c.key}
                              style={cellTint(
                                cell && c.from <= today
                                  ? statusOf(
                                      'entries' in cell
                                        ? cell
                                        : { planned: cell.plannedToDate, done: cell.doneToDate },
                                    )
                                  : null,
                              )}
                              className={clsx(
                                'border-b border-border px-2 py-2',
                                isToday && 'border-x-2 border-x-accent',
                                narrowCol(c) && !cell?.planned && 'bg-bg',
                              )}
                            >
                              {cell && 'entries' in cell ? (
                                <DayCell
                                  cell={cell}
                                  past={c.from <= today}
                                  weekend={narrowCol(c)}
                                  data={data}
                                  onTask={openTask}
                                />
                              ) : (
                                <PeriodCell
                                  cell={cell as PlannerPeriodCell | undefined}
                                  past={c.from <= today}
                                  onOpen={() =>
                                    setPanel({
                                      type: 'period',
                                      row: r.id,
                                      name: r.name,
                                      from: c.from,
                                      to: c.to,
                                      label: heading(view, c, today)[1],
                                    })
                                  }
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {panel && (
              <SidePanel
                panel={panel}
                source={source}
                filters={filters}
                by={by}
                onTask={openTask}
                onList={
                  source.onOpen &&
                  ((label, params) => {
                    close();
                    source.onOpen!(label, params, true);
                  })
                }
                onClose={() => setPanel(null)}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------- pieces

function Legend() {
  const sw = (cls: string, style?: CSSProperties) => (
    <span className={clsx('inline-block h-3 w-3 rounded-sm', cls)} style={style} />
  );
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-5 py-2 text-[12px] text-text-muted">
      <span className="flex flex-wrap items-center gap-3">
        <b className="font-heading text-label uppercase text-primary-dark">Task</b>
        <span className="inline-flex items-center gap-1.5">{sw('bg-success')} Done</span>
        <span className="inline-flex items-center gap-1.5">{sw('bg-primary')} Planned</span>
        <span className="inline-flex items-center gap-1.5">{sw('bg-accent')} Day plan</span>
        <span className="inline-flex items-center gap-1.5">{sw('bg-bad')} Not done that day</span>
        <span className="inline-flex items-center gap-1.5">
          {sw('border border-dashed border-text-muted')} Moved away
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-3">
        <b className="font-heading text-label uppercase text-primary-dark">Day</b>
        <span className="inline-flex items-center gap-1.5">{sw('', cellTint('all'))} All done</span>
        <span className="inline-flex items-center gap-1.5">
          {sw('', cellTint('part'))} Partly done
        </span>
        <span className="inline-flex items-center gap-1.5">
          {sw('', cellTint('none'))} Nothing done
        </span>
        <span className="inline-flex items-center gap-1.5">
          {sw('border-2 border-accent')} Today
        </span>
      </span>
    </div>
  );
}

/** Done of planned: a thin bar and "X of Y done · Z%"; future columns "Y planned". */
function ProgressBar({
  p,
  future,
  soFar,
}: {
  p: PlannerProgress;
  future?: boolean;
  soFar?: boolean;
}) {
  if (!p.planned)
    return (
      <span className="mt-1 block font-body text-[11.5px] font-normal text-text-muted">
        Nothing planned
      </span>
    );
  const pct = pctOf(p);
  return (
    <span className="mt-1.5 block font-body font-normal normal-case">
      <span className="block h-1.5 overflow-hidden rounded-full bg-primary-soft">
        <span
          className={clsx(
            'block h-full rounded-full',
            future ? 'bg-primary-soft-300' : 'bg-success',
          )}
          style={{ width: future ? '100%' : `${pct}%` }}
        />
      </span>
      <span className="mt-0.5 flex justify-between text-[11.5px] text-text-muted">
        {future ? (
          <>
            <span>
              <b className="text-text">{p.planned}</b> planned
            </span>
            <span>upcoming</span>
          </>
        ) : (
          <>
            <span>
              <b className="text-text">{p.done}</b> of {p.planned} done{soFar ? ' so far' : ''}
            </span>
            <span>{pct}%</span>
          </>
        )}
      </span>
    </span>
  );
}

function StatusPill({ p, extra }: { p: PlannerProgress; extra?: string }) {
  const s = statusOf(p);
  if (!s) return null;
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-text-muted">
      <span
        className={clsx('rounded-full px-2 py-0.5 font-heading text-[11px] font-bold', PILL[s])}
      >
        {STATUS_TEXT[s]}
      </span>
      <span className="tabular-nums">
        {p.done}/{p.planned}
        {extra}
      </span>
    </div>
  );
}

function DayCell({
  cell,
  past,
  weekend,
  data,
  onTask,
}: {
  cell: Extract<PlannerCell, { entries: unknown }>;
  past: boolean;
  weekend: boolean;
  data: Pick<PlannerGrid, 'tasks' | 'people' | 'groupBy'>;
  onTask: (id: number) => void;
}) {
  if (!cell.entries.length)
    return (
      <span className="text-[12px] text-text-muted/60">{weekend ? 'Weekend' : 'No tasks'}</span>
    );
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {past ? (
        <StatusPill p={cell} />
      ) : cell.planned ? (
        <div className="mb-1.5">
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 font-heading text-[11px] font-bold',
              PILL.future,
            )}
          >
            {cell.planned} planned
          </span>
        </div>
      ) : null}
      {cell.entries.map((e, i) => (
        <EntryCard key={`${e.taskId}-${e.kind}-${i}`} e={e} data={data} onTask={onTask} />
      ))}
    </div>
  );
}

/** The card's left edge (inline: a class would lose to the card's border colour). */
const EDGE: Record<string, string> = {
  done: 'var(--success)',
  due: 'var(--primary)',
  planned: 'var(--primary)',
  missed: 'var(--bad)',
};

function Badge({
  tone,
  children,
}: {
  tone: 'done' | 'miss' | 'plan' | 'day' | 'move' | 'pull';
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        'rounded px-1.5 py-px text-[11px] leading-tight',
        tone === 'done' && 'bg-success/15 text-success',
        tone === 'miss' && 'bg-bad/10 text-bad',
        tone === 'plan' && 'bg-primary-soft text-primary-dark',
        tone === 'day' && 'bg-accent/15 text-accent-dark',
        tone === 'move' && 'bg-bg text-text-muted',
        tone === 'pull' && 'bg-warn/15 text-text',
      )}
    >
      {children}
    </span>
  );
}

/** One task on one day: the crumb and title, a coloured left edge and what happened. */
function EntryCard({
  e,
  data,
  onTask,
}: {
  e: PlannerEntry;
  data: Pick<PlannerGrid, 'tasks' | 'people' | 'groupBy'>;
  onTask: (id: number) => void;
}) {
  const t: PlannerTask | undefined = data.tasks[e.taskId];
  const crumb = data.groupBy === 'project' ? t?.assignee : t?.project;
  const struck = e.kind === 'moved' || e.kind === 'replan';
  const who = (id: number | null | undefined) => (id ? firstName(data.people[id]) : '');
  const badges: ReactNode[] = [];
  if (e.kind === 'dayplan')
    badges.push(
      <Badge key="dp" tone="day">
        In day plan · deadline {e.deadline ? longDay(e.deadline) : 'none'}
      </Badge>,
    );
  if (e.status === 'done')
    badges.push(
      <Badge key="d" tone="done">
        Done
      </Badge>,
    );
  if (e.status === 'missed')
    badges.push(
      <Badge key="m" tone="miss">
        Not done{e.doneDay ? ` · done ${shortDay(e.doneDay)}` : ''}
      </Badge>,
    );
  if (e.status === 'due')
    badges.push(
      <Badge key="due" tone="plan">
        Due today
      </Badge>,
    );
  if (e.kind === 'moved') {
    badges.push(
      <Badge key="mv" tone="move">
        Moved → {e.to ? longDay(e.to) : 'no deadline'}
        {e.by ? ` by ${who(e.by)}` : ''}
      </Badge>,
    );
    if (e.missed)
      badges.push(
        <Badge key="n" tone="miss">
          {ordinal(e.missed)} deadline missed
        </Badge>,
      );
  }
  if (e.kind === 'replan')
    badges.push(
      <Badge key="rp" tone="move">
        Re-planned → {e.to ? longDay(e.to) : 'no deadline'} the same day
      </Badge>,
    );
  if (e.kind === 'deadline') {
    if (e.missed)
      badges.push(
        <Badge key="n" tone="miss">
          {ordinal(e.missed)} deadline missed
        </Badge>,
      );
    if (e.pulledFrom)
      badges.push(
        <Badge key="pf" tone="pull">
          Pulled forward from {longDay(e.pulledFrom.day)}
          {e.pulledFrom.by ? ` by ${who(e.pulledFrom.by)}` : ''}
        </Badge>,
      );
    if (e.replannedFrom)
      badges.push(
        <Badge key="rf" tone="move">
          Re-planned from {longDay(e.replannedFrom)}
        </Badge>,
      );
    if (e.notDoneInPlan)
      badges.push(
        <Badge key="nd" tone="move">
          Not done in day plan {shortDay(e.notDoneInPlan)}
        </Badge>,
      );
  }
  return (
    <button
      type="button"
      onClick={() => onTask(e.taskId)}
      title={t ? `#${t.id} · ${t.project} · ${t.assignee}` : `#${e.taskId}`}
      style={
        struck
          ? undefined
          : {
              borderLeftColor:
                e.kind === 'dayplan' && e.status !== 'done' && e.status !== 'missed'
                  ? 'var(--accent)'
                  : (EDGE[e.status] ?? 'var(--primary)'),
            }
      }
      className={clsx(
        'flex w-full min-w-0 flex-col gap-1 rounded-md border border-l-[3px] bg-surface px-2 py-1.5 text-left text-[12.5px] leading-snug hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
        struck ? 'border-dashed border-text-muted/50 text-text-muted' : 'border-border',
      )}
    >
      <span className={clsx('min-w-0', struck && 'line-through')}>
        <span className="text-text-muted">{crumb ?? '…'} →</span> {t?.title ?? `Task ${e.taskId}`}
      </span>
      {badges.length > 0 && <span className="flex flex-wrap gap-1">{badges}</span>}
    </button>
  );
}

function PeriodCell({
  cell,
  past,
  onOpen,
}: {
  cell: PlannerPeriodCell | undefined;
  past: boolean;
  onOpen: () => void;
}) {
  if (!cell || !cell.planned)
    return <span className="text-[12px] text-text-muted/60">No tasks</span>;
  const ahead = cell.planned - cell.plannedToDate;
  return (
    <div className="flex min-w-0 flex-col">
      {past && cell.plannedToDate ? (
        <StatusPill
          p={{ planned: cell.plannedToDate, done: cell.doneToDate }}
          extra={ahead > 0 ? ` · ${ahead} still ahead` : ''}
        />
      ) : (
        <div className="mb-1.5">
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 font-heading text-[11px] font-bold',
              PILL.future,
            )}
          >
            {cell.planned} planned
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {cell.groups.map((g) => (
          <span key={g.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12px]">
            <span className="min-w-0 truncate">{g.name}</span>
            <span className="tabular-nums text-text-muted">
              <b className="text-text">{g.done}</b>/{g.planned}
            </span>
            <span className="col-span-2 block h-1 overflow-hidden rounded-full bg-primary-soft">
              <span
                className="block h-full rounded-full bg-success"
                style={{ width: `${pctOf(g)}%` }}
              />
            </span>
          </span>
        ))}
        {(cell.missedDeadlines > 0 || cell.pulledForward > 0) && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {cell.missedDeadlines > 0 && (
              <Badge tone="miss">
                {cell.missedDeadlines} deadline{cell.missedDeadlines > 1 ? 's' : ''} missed
              </Badge>
            )}
            {cell.pulledForward > 0 && (
              <Badge tone="pull">{cell.pulledForward} pulled forward</Badge>
            )}
          </span>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- side panel

function SidePanel({
  panel,
  source,
  filters,
  by,
  onTask,
  onList,
  onClose,
}: {
  panel: Panel;
  source: InHandCalendarSource;
  filters: Record<string, string>;
  by: GroupBy;
  onTask: (id: number) => void;
  onList?: (label: string, params: Record<string, string>) => void;
  onClose: () => void;
}) {
  // Escape closes the panel first (the planner itself closes only with its close button).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside
      aria-label="Details"
      className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-border bg-surface"
    >
      {panel.type === 'task' ? (
        <TaskPanel id={panel.id} source={source} onClose={onClose} />
      ) : panel.type === 'overdue' ? (
        <OverduePanel
          panel={panel}
          source={source}
          filters={filters}
          by={by}
          onTask={onTask}
          onList={onList}
          onClose={onClose}
        />
      ) : (
        <PeriodPanel
          panel={panel}
          source={source}
          filters={filters}
          by={by}
          onTask={onTask}
          onClose={onClose}
        />
      )}
    </aside>
  );
}

function PanelHead({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <header className="flex items-start gap-3 border-b border-border p-4">
      <div className="min-w-0 flex-1">
        <h3 className="font-heading text-h2 text-primary-dark">{title}</h3>
        {sub && <p className="mt-0.5 text-table text-text-muted">{sub}</p>}
      </div>
      <button
        type="button"
        aria-label="Close the details"
        onClick={onClose}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-text-muted hover:bg-primary-soft-100"
      >
        <IconClose size={14} />
      </button>
    </header>
  );
}

const CHANGE_TEXT = (i: Extract<PlannerTaskLog['log'][number], { type: 'change' }>) =>
  i.kind === 'missed'
    ? `${ordinal(i.nth)} deadline missed`
    : i.kind === 'pull'
      ? 'Pulled forward'
      : i.kind === 'replan'
        ? 'Re-planned before it was due'
        : i.kind === 'set'
          ? 'Deadline set'
          : 'Deadline removed';
const KIND_TEXT: Record<PlannerEntry['kind'], string> = {
  deadline: 'deadline',
  moved: 'moved away',
  replan: 're-planned',
  dayplan: 'day plan',
};

function TaskPanel({
  id,
  source,
  onClose,
}: {
  id: number;
  source: InHandCalendarSource;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useApi<PlannerTaskLog>(
    `${source.path}/task/${id}`,
    source.params,
  );
  const t = data?.task;
  const name = (uid: number | null) => (uid ? (data?.people[uid] ?? `User ${uid}`) : 'someone');
  const day = (k: string | null) => (k ? longDay(k) : 'none');
  return (
    <>
      <PanelHead
        title={t?.title ?? (isError ? 'Task not found' : 'Loading…')}
        sub={t ? `#${t.id} · ${t.project} · ${t.assignee}` : undefined}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-4 text-table">
        {isLoading || !data ? (
          <p className="text-text-muted">
            {isError ? 'This task is not in this view.' : 'Loading…'}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-text-muted">Project</dt>
              <dd>{data.task.project}</dd>
              <dt className="text-text-muted">Assignee</dt>
              <dd>{data.task.assignee}</dd>
              <dt className="text-text-muted">Current deadline</dt>
              <dd>{day(data.deadline)}</dd>
              <dt className="text-text-muted">Deadlines missed</dt>
              <dd className={clsx(data.missed > 0 && 'font-bold text-bad')}>{data.missed}</dd>
            </dl>
            <h4 className="mt-5 font-heading text-label font-bold uppercase text-primary">
              Plan log
            </h4>
            <ol className="mt-2 border-l-2 border-border pl-4">
              {data.log.map((i, k) => (
                <li key={k} className="relative mb-3">
                  <span
                    className={clsx(
                      'absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full',
                      i.type === 'completed'
                        ? 'bg-success'
                        : (i.type === 'change' && i.kind === 'missed') ||
                            (i.type === 'open' && i.overdueDays > 0)
                          ? 'bg-bad'
                          : i.type === 'dayplan'
                            ? 'bg-accent'
                            : 'bg-primary',
                    )}
                  />
                  {i.type === 'created' && (
                    <>
                      <div>
                        Created, deadline <b>{day(i.deadline)}</b>
                      </div>
                      <div className="text-[12px] text-text-muted">
                        {longDay(i.day)} · by {name(i.by)}
                      </div>
                    </>
                  )}
                  {i.type === 'change' && (
                    <>
                      <div>
                        Deadline {day(i.from)} → <b>{day(i.to)}</b>
                      </div>
                      <div className="text-[12px] text-text-muted">
                        {longDay(i.day)} · by {name(i.by)} · {CHANGE_TEXT(i)}
                      </div>
                    </>
                  )}
                  {i.type === 'dayplan' && (
                    <>
                      <div>
                        Taken into day plan for <b>{longDay(i.day)}</b>
                      </div>
                      <div className="text-[12px] text-text-muted">
                        by {data.task.assignee} · deadline unchanged
                        {!i.done && i.past ? ' · not done that day' : ''}
                      </div>
                    </>
                  )}
                  {i.type === 'completed' && (
                    <>
                      <div>Completed</div>
                      <div className="text-[12px] text-text-muted">
                        {longDay(i.day)} ·{' '}
                        {i.lateDays
                          ? `${i.lateDays} day${i.lateDays > 1 ? 's' : ''} after the deadline`
                          : 'on or before the deadline'}
                      </div>
                    </>
                  )}
                  {i.type === 'open' && (
                    <>
                      <div>{i.overdueDays ? 'Still open' : 'Open'}</div>
                      <div className="text-[12px] text-text-muted">
                        {i.overdueDays
                          ? `${i.overdueDays} day${i.overdueDays > 1 ? 's' : ''} past ${day(data.deadline)}`
                          : `due ${day(data.deadline)}`}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ol>
            <h4 className="mt-4 font-heading text-label font-bold uppercase text-primary">
              Shown on the planner
            </h4>
            <p className="mt-1 text-text-muted">
              {data.shownOn.length
                ? data.shownOn
                    .map(
                      (s) => `${longDay(s.day)} (${s.kinds.map((k) => KIND_TEXT[k]).join(', ')})`,
                    )
                    .join(' · ')
                : 'Nowhere yet'}
            </p>
            <a
              href={data.task.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-card mt-5 flex h-10 w-full items-center justify-center"
            >
              Open in Bitrix24
            </a>
          </>
        )}
      </div>
    </>
  );
}

function OverduePanel({
  panel,
  source,
  filters,
  by,
  onTask,
  onList,
  onClose,
}: {
  panel: Extract<Panel, { type: 'overdue' }>;
  source: InHandCalendarSource;
  filters: Record<string, string>;
  by: GroupBy;
  onTask: (id: number) => void;
  onList?: (label: string, params: Record<string, string>) => void;
  onClose: () => void;
}) {
  const { data } = useApi<PlannerOverdue>(`${source.path}/overdue`, {
    ...filters,
    row: String(panel.row),
  });
  const items = data?.items ?? [];
  return (
    <>
      <PanelHead
        title={`${panel.name} · overdue now`}
        sub={`${items.length} open task${items.length === 1 ? '' : 's'} past the deadline. Each stays on its own deadline day on the planner.`}
        onClose={onClose}
      />
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-4">
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTask(t.id)}
            style={{ borderLeftColor: 'var(--bad)' }}
            className="flex w-full flex-col gap-1 rounded-md border border-l-[3px] border-border bg-surface px-2 py-1.5 text-left text-[12.5px] hover:border-primary"
          >
            <span>
              <span className="text-text-muted">{by === 'project' ? t.assignee : t.project} →</span>{' '}
              {t.title}
            </span>
            <span className="flex flex-wrap gap-1">
              <Badge tone="miss">
                Due {longDay(t.deadlineDay)} · {t.daysOverdue}d overdue
              </Badge>
              {t.missed > 0 && <Badge tone="miss">{ordinal(t.missed)} deadline missed</Badge>}
            </span>
          </button>
        ))}
        {onList && items.length > 0 && (
          <button
            type="button"
            onClick={() => onList(`Overdue · ${panel.name}`, { [by]: String(panel.row) })}
            className="btn btn-card mt-3 h-10 w-full"
          >
            Show as a list
          </button>
        )}
      </div>
    </>
  );
}

function PeriodPanel({
  panel,
  source,
  filters,
  by,
  onTask,
  onClose,
}: {
  panel: Extract<Panel, { type: 'period' }>;
  source: InHandCalendarSource;
  filters: Record<string, string>;
  by: GroupBy;
  onTask: (id: number) => void;
  onClose: () => void;
}) {
  const { data } = useApi<PlannerPeriod>(`${source.path}/period`, {
    ...filters,
    row: String(panel.row),
    pfrom: panel.from,
    pto: panel.to,
  });
  return (
    <>
      <PanelHead title={panel.name} sub={panel.label} onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4">
        {!data ? (
          <p className="text-text-muted">Loading…</p>
        ) : !data.days.length ? (
          <p className="text-text-muted">No tasks.</p>
        ) : (
          data.days.map((d) => (
            <section key={d.day} className="mb-4">
              <h4 className="mb-1.5 flex items-center gap-2 font-heading text-label font-bold text-primary-dark">
                {longDay(d.day)}
                {d.day <= data.today && statusOf(d) && (
                  <span
                    className={clsx('rounded-full px-2 py-0.5 text-[11px]', PILL[statusOf(d)!])}
                  >
                    {d.done}/{d.planned}
                  </span>
                )}
              </h4>
              <div className="flex flex-col gap-1.5">
                {d.entries.map((e, i) => (
                  <EntryCard
                    key={`${e.taskId}-${e.kind}-${i}`}
                    e={e}
                    data={{ tasks: data.tasks, people: data.people, groupBy: by }}
                    onTask={onTask}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
