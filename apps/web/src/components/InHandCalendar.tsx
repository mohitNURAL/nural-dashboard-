// Tasks in hand planner (2026-11-08, SRS 25; mockup docs/tasks-in-hand-planner.html), opened from
// the Tasks in hand tile on KPI, Development and QA, or from the planner preview card: one shared
// component. One row per person (or project); Day shows days with each day's tasks (Short: one
// line a task; Full: each task with its details), Week and Month count each task once per period.
// A task shows only on a day it was planned for (its deadline, or a Daily update day plan ahead of
// it); overdue work stays red on the day it was missed. The grid is one timeline: the period in
// the toolbar plus the one before and after, so it scrolls (or drags with the mouse) freely from
// week to week; crossing into the next period loads the one after it. A side panel shows a task's
// plan log, a week or month cell by day, or a row's overdue tasks. View, period, grouping, filters
// and Short / Full live in the URL (plannerStore).
import { plannerStart, shiftStart, type GroupBy } from '@nural/shared';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../api/queries';
import type {
  PlannerEntry,
  PlannerGrid,
  PlannerOverdue,
  PlannerPeriod,
  PlannerTaskLog,
  PlannerView,
} from '../api/types';
import { heading, longDay, ordinal, periodLabel } from './calendarHeading';
import { GroupToggle, ViewToggle } from './Card';
import { usePlanner, usePlannerState, type PlannerFocus } from './plannerStore';
import { PILL, statusOf, SUB, type Density } from './plannerLook';
import { Badge, EntryCard, Legend, PlannerTable, type PlannerTableData } from './PlannerTable';
import { SearchCombobox } from './SearchCombobox';
import { IconCalendar, IconClose, IconExcel, IconPdf } from './ui/icons';
import { keepOpen } from './ui/keepOpen';
import { SearchInput } from './ui/SearchInput';
import { useDragPan } from './useDragPan';

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
const DENSITIES: { value: Density; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'full', label: 'Full' },
];

type Panel =
  | PlannerFocus
  | { type: 'period'; row: number; name: string; from: string; to: string; label: string };

interface Timeline {
  /** The toolbar's period. */
  mid: PlannerGrid;
  prevKeys: Set<string>;
  nextKeys: Set<string>;
  prevStart?: string;
  nextStart?: string;
  table: PlannerTableData;
}

/**
 * The period asked for plus the one before and after, joined into one timeline. The neighbours
 * come from the cache when the timeline moves by one period, so scrolling never waits on the
 * period it lands in.
 */
function usePlannerTimeline(
  path: string,
  params: Record<string, string>,
  view: PlannerView,
  start: string | null,
) {
  const base = { ...params, view };
  const mid = useApi<PlannerGrid>(path, start ? { ...base, start } : base);
  const fresh = mid.isPlaceholderData ? undefined : mid.data;
  const prevStart = fresh && shiftStart(view, fresh.start, -1);
  const nextStart = fresh && shiftStart(view, fresh.start, 1);
  const prev = useApi<PlannerGrid>(
    path,
    { ...base, start: prevStart ?? '' },
    { enabled: !!prevStart },
  );
  const next = useApi<PlannerGrid>(
    path,
    { ...base, start: nextStart ?? '' },
    { enabled: !!nextStart },
  );
  const ok = (q: typeof prev) =>
    fresh && !q.isPlaceholderData && q.data?.view === view ? q.data : undefined;
  const p = ok(prev);
  const n = ok(next);

  // While a new period loads (arrows, a new filter) the last timeline stays on screen.
  const last = useRef<Timeline | null>(null);
  const timeline = useMemo<Timeline | null>(() => {
    if (!fresh) return null;
    const parts = [p, fresh, n].filter((x): x is PlannerGrid => !!x);
    const seen = new Set<string>();
    const columns = parts
      .flatMap((g) => g.columns)
      .filter((c) => !seen.has(c.key) && !!seen.add(c.key));
    const rows = new Map<number, PlannerGrid['rows'][number]>();
    // The toolbar's period sets the order and the "done so far"; the neighbours add their cells.
    for (const g of [fresh, ...parts.filter((x) => x !== fresh)])
      for (const r of g.rows) {
        const have = rows.get(r.id);
        if (have) have.cells = { ...have.cells, ...r.cells };
        else
          rows.set(r.id, {
            ...r,
            progress: g === fresh ? r.progress : { planned: 0, done: 0 },
            cells: { ...r.cells },
          });
      }
    const keysOf = (g?: PlannerGrid) => new Set(g?.columns.map((c) => c.key) ?? []);
    return {
      mid: fresh,
      prevKeys: keysOf(p),
      nextKeys: keysOf(n),
      prevStart: p?.start,
      nextStart: n?.start,
      table: {
        view: fresh.view,
        groupBy: fresh.groupBy,
        today: fresh.today,
        columns,
        rows: [...rows.values()],
        columnTotals: Object.assign({}, ...parts.map((g) => g.columnTotals)),
        tasks: Object.assign({}, ...parts.map((g) => g.tasks)),
        people: Object.assign({}, ...parts.map((g) => g.people)),
      },
    };
  }, [fresh, p, n]);
  if (timeline) last.current = timeline;
  return {
    timeline: timeline ?? last.current,
    stale: !timeline,
    isLoading: mid.isLoading,
    isFetching: mid.isFetching || prev.isFetching || next.isFetching,
  };
}

export function InHandCalendarDialog({
  source,
  onClose,
}: {
  source: InHandCalendarSource;
  onClose: () => void;
}) {
  const st = usePlannerState();
  const { view, by, density } = st;
  // The preview card can open the planner on a task or on a row's overdue.
  const [panel, setPanel] = useState<Panel | null>(() => usePlanner.getState().focus);
  useEffect(() => usePlanner.getState().clearFocus(), []);
  // A panel belongs to the grid it came from.
  const shape = useRef(`${view}|${by}`);
  useEffect(() => {
    if (shape.current === `${view}|${by}`) return;
    shape.current = `${view}|${by}`;
    setPanel(null);
  }, [view, by]);
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
  const { timeline, stale, isLoading, isFetching } = usePlannerTimeline(
    source.path,
    filters,
    view,
    st.start,
  );
  const data = timeline?.mid;
  const table = timeline?.table;
  const rows = table?.rows ?? [];
  const picks = by === 'project' ? st.projects : st.assignees;
  const pickOptions = (by === 'project' ? data?.choices.projects : data?.choices.assignees) ?? [];

  // ---- Scrolling: jumps (opening, the arrows, Today, a new view) and free movement.
  const scroller = useRef<HTMLDivElement>(null);
  const scrollerRef = useDragPan(scroller);
  /** Put the toolbar's period at the left edge after the next render. */
  const jump = useRef(true);
  /** The column at the left edge and where it was: kept in place when columns join on the left. */
  const anchor = useRef<{ key: string; x: number } | null>(null);
  /** A move the scrolling asked for, until its period has loaded. */
  const moving = useRef<string | null>(null);
  const firstView = useRef(view);
  useEffect(() => {
    if (firstView.current === view) return;
    firstView.current = view;
    jump.current = true;
    moving.current = null;
  }, [view]);

  const stickyWidth = (sc: HTMLElement) =>
    sc.querySelector<HTMLElement>('thead th:first-child')?.offsetWidth ?? 0;
  const headers = (sc: HTMLElement) => [...sc.querySelectorAll<HTMLElement>('th[data-col]')];
  const readAnchor = () => {
    const sc = scroller.current;
    if (!sc) return;
    const left = sc.getBoundingClientRect().left + stickyWidth(sc);
    const th = headers(sc).find((h) => h.getBoundingClientRect().right > left + 4);
    if (th) anchor.current = { key: th.dataset.col!, x: th.getBoundingClientRect().left - left };
  };
  const colKeys = table?.columns.map((c) => c.key).join(',') ?? '';
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !timeline || stale) return;
    const left = sc.getBoundingClientRect().left + stickyWidth(sc);
    if (jump.current) {
      const th = sc.querySelector<HTMLElement>(`th[data-col="${timeline.mid.columns[0]?.key}"]`);
      if (th) {
        sc.scrollLeft += th.getBoundingClientRect().left - left;
        jump.current = false;
      }
    } else if (anchor.current) {
      const th = sc.querySelector<HTMLElement>(`th[data-col="${anchor.current.key}"]`);
      if (th) sc.scrollLeft += th.getBoundingClientRect().left - left - anchor.current.x;
    }
    readAnchor();
    if (moving.current && plannerStart(view, moving.current) === timeline.mid.start)
      moving.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the columns change
  }, [colKeys, stale, density]);

  const frame = useRef(0);
  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const sc = scroller.current;
      if (!sc || !timeline || stale || jump.current) return;
      readAnchor();
      if (moving.current) return;
      // The period under the middle of the grid becomes the toolbar's period.
      const sw = stickyWidth(sc);
      const middle = sc.getBoundingClientRect().left + sw + (sc.clientWidth - sw) / 2;
      const key = headers(sc).find((h) => {
        const r = h.getBoundingClientRect();
        return r.left <= middle && middle < r.right;
      })?.dataset.col;
      const to = !key
        ? undefined
        : timeline.prevKeys.has(key)
          ? timeline.prevStart
          : timeline.nextKeys.has(key)
            ? timeline.nextStart
            : undefined;
      if (to) {
        moving.current = to;
        st.setStart(to);
      }
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const move = (dir: number) => {
    if (!data) return;
    jump.current = true;
    moving.current = null;
    st.setStart(shiftStart(view, data.start, dir));
  };
  const goToday = () => {
    jump.current = true;
    moving.current = null;
    st.setStart(null);
  };
  // The planner's state stays in the URL, so it reopens as it was left.
  const close = onClose;

  // Excel and PDF: the period in the toolbar, laid out like the grid (dates across the top).
  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    if (!data || !data.columns.length) return;
    setBusy(kind);
    try {
      const m = await import('./inHandCalendarExport');
      const title = `Tasks in hand planner · ${VIEWS.find((v) => v.value === view)!.label} · ${periodLabel(view, data.columns)}`;
      const note =
        [source.showing, st.q && `search “${st.q}”`].filter(Boolean).join(' · ') ||
        'All tasks in hand';
      const grid = m.plannerGridExport(data, density);
      if (kind === 'xlsx') await m.exportPlannerExcel(title, note, grid);
      else m.exportPlannerPdf(title, note, grid);
    } finally {
      setBusy(null);
    }
  };

  const openTask = (id: number) => setPanel({ type: 'task', id });

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
                  <span className="text-text/65">
                    {' '}
                    · {data.totals.open} open, {data.totals.overdueNow} overdue now
                  </span>
                )}
              </Dialog.Title>
              <Dialog.Description className={clsx('text-table', SUB)}>
                Each day shows only the tasks planned for it: by deadline, or taken into the
                assignee&apos;s day plan. Drag the grid or scroll sideways to move through the
                weeks; click a task for its plan log.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text/65 hover:bg-primary-soft-100"
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
            {view === 'day' && (
              <ViewToggle<Density> value={density} onChange={st.setDensity} options={DENSITIES} />
            )}
            <GroupToggle value={by} onChange={(b: GroupBy) => st.setBy(b)} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous period"
                onClick={() => move(-1)}
                className="grid h-8 w-8 place-items-center rounded-control text-lg text-primary hover:bg-primary-soft-100"
              >
                ‹
              </button>
              <span className="min-w-[11.5rem] text-center font-heading text-label font-bold text-primary-dark">
                {data ? periodLabel(view, data.columns) : ''}
              </span>
              <button
                type="button"
                aria-label="Next period"
                onClick={() => move(1)}
                className="grid h-8 w-8 place-items-center rounded-control text-lg text-primary hover:bg-primary-soft-100"
              >
                ›
              </button>
              <button
                type="button"
                onClick={goToday}
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
            {isFetching && <span className="text-[12px] text-text/65">Updating…</span>}
            <button
              type="button"
              onClick={() => void exportAs('xlsx')}
              disabled={!!busy || !data?.rows.length}
              className="btn btn-stroke inline-flex h-8 items-center gap-1.5 px-2.5 disabled:opacity-50"
            >
              <IconExcel size={14} /> {busy === 'xlsx' ? 'Exporting…' : 'Excel'}
            </button>
            <button
              type="button"
              onClick={() => void exportAs('pdf')}
              disabled={!!busy || !data?.rows.length}
              className="btn btn-stroke inline-flex h-8 items-center gap-1.5 px-2.5 disabled:opacity-50"
            >
              <IconPdf size={14} /> {busy === 'pdf' ? 'Exporting…' : 'PDF'}
            </button>
          </div>
          <Legend />

          {/* Grid and side panel */}
          <div className="relative flex min-h-0 flex-1">
            <div
              ref={scrollerRef}
              onScroll={onScroll}
              className={clsx(
                'min-w-0 flex-1 cursor-grab overflow-auto transition-opacity',
                stale && 'opacity-60',
              )}
            >
              {isLoading || !table ? (
                <p className="py-10 text-center text-text/65">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="py-10 text-center text-text/65">Nothing planned in this period.</p>
              ) : (
                <PlannerTable
                  data={table}
                  density={density}
                  onTask={openTask}
                  onOverdue={(r) => setPanel({ type: 'overdue', row: r.id, name: r.name })}
                  onPeriod={(r, c) =>
                    setPanel({
                      type: 'period',
                      row: r.id,
                      name: r.name,
                      from: c.from,
                      to: c.to,
                      label: heading(view, c, table.today)[1],
                    })
                  }
                />
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
        {sub && <p className="mt-0.5 text-table text-text/65">{sub}</p>}
      </div>
      <button
        type="button"
        aria-label="Close the details"
        onClick={onClose}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-text/65 hover:bg-primary-soft-100"
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
          <p className="text-text/65">{isError ? 'This task is not in this view.' : 'Loading…'}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-text/65">Project</dt>
              <dd>{data.task.project}</dd>
              <dt className="text-text/65">Assignee</dt>
              <dd>{data.task.assignee}</dd>
              <dt className="text-text/65">Current deadline</dt>
              <dd>{day(data.deadline)}</dd>
              <dt className="text-text/65">Deadlines missed</dt>
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
                      <div className="text-[12px] text-text/65">
                        {longDay(i.day)} · by {name(i.by)}
                      </div>
                    </>
                  )}
                  {i.type === 'change' && (
                    <>
                      <div>
                        Deadline {day(i.from)} → <b>{day(i.to)}</b>
                      </div>
                      <div className="text-[12px] text-text/65">
                        {longDay(i.day)} · by {name(i.by)} · {CHANGE_TEXT(i)}
                      </div>
                    </>
                  )}
                  {i.type === 'dayplan' && (
                    <>
                      <div>
                        Taken into day plan for <b>{longDay(i.day)}</b>
                      </div>
                      <div className="text-[12px] text-text/65">
                        by {data.task.assignee} · deadline unchanged
                        {!i.done && i.past ? ' · not done that day' : ''}
                      </div>
                    </>
                  )}
                  {i.type === 'completed' && (
                    <>
                      <div>Completed</div>
                      <div className="text-[12px] text-text/65">
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
                      <div className="text-[12px] text-text/65">
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
            <p className="mt-1 text-text/65">
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
              <span className="text-text/65">{by === 'project' ? t.assignee : t.project} →</span>{' '}
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
          <p className="text-text/65">Loading…</p>
        ) : !data.days.length ? (
          <p className="text-text/65">No tasks.</p>
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
                    full
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
