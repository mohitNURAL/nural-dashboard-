// The Tasks in hand planner's grid (2026-11-08, SRS 25), shared by the planner popup and the
// planner preview on the dashboards: one row per person (or project), one column per day, week or
// month. Day cells list each task planned for that day, Short (one line a task) or Full (each task
// with its details and what happened); week and month cells count each task once per period.
// Secondary text uses the text colour at reduced strength, not --text-muted (too faint on white).
import type { GroupBy } from '@nural/shared';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import type {
  PlannerCell,
  PlannerEntry,
  PlannerGrid,
  PlannerPeriodCell,
  PlannerProgress,
  PlannerTask,
  PlannerView,
} from '../api/types';
import { heading, isWeekend, longDay, ordinal, shortDay } from './calendarHeading';
import {
  cellTint,
  entryWords,
  FAINT,
  PILL,
  STATUS_TEXT,
  statusOf,
  SUB,
  type Density,
} from './plannerLook';

export type { Density };

type Column = PlannerGrid['columns'][number];
type Row = PlannerGrid['rows'][number];

/** What the grid draws: one period from the API, or several joined (the popup's timeline). */
export interface PlannerTableData {
  view: PlannerView;
  groupBy: GroupBy;
  today: string;
  columns: Column[];
  rows: Row[];
  columnTotals: PlannerGrid['columnTotals'];
  tasks: PlannerGrid['tasks'];
  people: PlannerGrid['people'];
}

const firstName = (name: string | undefined) => (name ?? '').split(' ')[0] ?? '';
const pctOf = (p: PlannerProgress) => (p.planned ? Math.round((p.done / p.planned) * 100) : 0);

/** Column widths: weekends narrow in the Day view; Short is narrower than Full. */
function widthOf(view: PlannerView, density: Density, weekend: boolean, compact?: boolean) {
  if (view !== 'day') return 'min-w-[210px] w-[210px]';
  if (density === 'full') return weekend ? 'min-w-[130px] w-[130px]' : 'min-w-[260px] w-[260px]';
  if (compact) return weekend ? 'min-w-[96px] w-[96px]' : 'min-w-[150px] w-[150px]';
  return weekend ? 'min-w-[110px] w-[110px]' : 'min-w-[180px] w-[180px]';
}

/** Short: a weekend day takes this share of a weekday's width. */
const WEEKEND_SHARE = 0.6;
/** Short: a weekday is never narrower than this (a small screen scrolls instead). */
const MIN_DAY = 110;

export function PlannerTable({
  data,
  density,
  onTask,
  onOverdue,
  onPeriod,
  compact,
  fitWidth,
}: {
  data: PlannerTableData;
  density: Density;
  onTask: (id: number) => void;
  onOverdue?: (row: Row) => void;
  onPeriod?: (row: Row, c: Column) => void;
  /** The dashboard preview: narrower columns, no row progress. */
  compact?: boolean;
  /**
   * The width the grid is shown in. Day view Short sizes a week to fill it exactly (no stretching,
   * no sideways scroll for one week); titles are cut with "…".
   */
  fitWidth?: number;
}) {
  const { view, today, columns, rows } = data;
  const by = data.groupBy;
  const weekend = (c: Column) => view === 'day' && isWeekend(c.from);
  const short = view === 'day' && density === 'short';
  const firstW = compact || short ? 170 : 200;
  // Short day view: 5 weekdays and 2 narrower weekend days share the width left of the names.
  const unit =
    short && fitWidth ? Math.max(MIN_DAY, (fitWidth - firstW - 1) / (5 + 2 * WEEKEND_SHARE)) : 0;
  const colW = (c: Column) => Math.floor(weekend(c) ? unit * WEEKEND_SHARE : unit);
  const fixed = (w: number): CSSProperties => ({ width: w, minWidth: w, maxWidth: w });
  // In the Day view a thicker line marks where a week starts.
  const weekLine = (c: Column, i: number) =>
    view === 'day' && i > 0 && new Date(`${c.from}T00:00:00Z`).getUTCDay() === 1;
  return (
    <table
      className="border-separate border-spacing-0 text-table"
      style={
        unit
          ? { tableLayout: 'fixed', width: firstW + columns.reduce((a, c) => a + colW(c), 0) }
          : undefined
      }
    >
      <thead className="sticky top-0 z-20">
        <tr>
          <th
            className={clsx(
              'sticky left-0 z-30 border-b border-r border-border bg-surface px-3 py-2 text-left align-top',
            )}
            style={fixed(firstW)}
          >
            <span className="block font-heading text-label font-bold uppercase tracking-wide text-primary">
              {by === 'project' ? 'Project' : 'Assignee'}
            </span>
            <span className={clsx('font-body text-[12px] font-normal', SUB)}>
              {rows.length} shown
            </span>
          </th>
          {columns.map((c, i) => {
            const [top, dates] = heading(view, c, today);
            const isToday = c.from <= today && today <= c.to;
            const tot = data.columnTotals[c.key];
            return (
              <th
                key={c.key}
                data-col={c.key}
                style={unit ? fixed(colW(c)) : undefined}
                className={clsx(
                  'overflow-hidden border-b border-border px-2 py-2 text-left align-top',
                  !unit && widthOf(view, density, weekend(c), compact),
                  weekLine(c, i) && 'border-l-2 border-l-primary-soft-300',
                  isToday
                    ? 'bg-accent/15 text-text shadow-[inset_0_2px_0_var(--accent)]'
                    : weekend(c)
                      ? 'bg-bg text-text/70'
                      : 'bg-surface text-primary-dark',
                )}
              >
                {short ? (
                  <span className="block truncate">
                    <span className="font-heading text-label font-bold uppercase">{top}</span>{' '}
                    <span className={clsx('font-body text-[12px] font-normal', SUB)}>{dates}</span>
                  </span>
                ) : (
                  <>
                    <span className="block font-heading text-label font-bold uppercase">{top}</span>
                    <span className={clsx('block font-body text-[12px] font-normal', SUB)}>
                      {dates}
                    </span>
                  </>
                )}
                {tot && (tot.planned > 0 || !weekend(c)) && (
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
            <td
              className={clsx(
                'sticky left-0 z-10 border-b border-r border-border bg-surface px-3',
                short ? 'py-1.5' : 'py-2',
              )}
              style={fixed(firstW)}
            >
              <span
                className="block truncate font-heading font-bold text-primary-dark"
                title={r.name}
              >
                {r.name}
              </span>
              <span className={clsx('block text-[12px]', SUB)}>
                {r.open} open{short ? '' : ' · '}
                {short && r.progress.planned > 0 && (
                  <>
                    {' · '}
                    <b className="text-text">{r.progress.done}</b>/{r.progress.planned} done
                  </>
                )}
                {short && <br />}
                {r.overdueNow ? (
                  onOverdue ? (
                    <button
                      type="button"
                      onClick={() => onOverdue(r)}
                      className="font-bold text-bad underline-offset-2 hover:underline"
                    >
                      {r.overdueNow} overdue now
                    </button>
                  ) : (
                    <b className="text-bad">{r.overdueNow} overdue now</b>
                  )
                ) : (
                  '0 overdue'
                )}
              </span>
              {!compact && !short && <ProgressBar p={r.progress} soFar />}
            </td>
            {columns.map((c, i) => {
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
                    'overflow-hidden border-b border-border px-2',
                    short ? 'py-1.5' : 'py-2',
                    isToday && 'border-x-2 border-x-accent',
                    weekLine(c, i) && !isToday && 'border-l-2 border-l-primary-soft-300',
                    weekend(c) && !cell?.planned && 'bg-bg',
                  )}
                >
                  {cell && 'entries' in cell ? (
                    <DayCell
                      cell={cell}
                      past={c.from <= today}
                      weekend={weekend(c)}
                      density={density}
                      data={data}
                      onTask={onTask}
                    />
                  ) : (
                    <PeriodCell
                      cell={cell as PlannerPeriodCell | undefined}
                      past={c.from <= today}
                      onOpen={onPeriod && (() => onPeriod(r, c))}
                    />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- pieces

export function Legend() {
  const sw = (cls: string, style?: CSSProperties) => (
    <span className={clsx('inline-block h-3 w-3 rounded-sm', cls)} style={style} />
  );
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-5 py-2 text-[12px] text-text/75">
      <span className="flex flex-wrap items-center gap-3">
        <b className="font-heading text-label uppercase text-primary-dark">Task</b>
        <span className="inline-flex items-center gap-1.5">{sw('bg-success')} Done</span>
        <span className="inline-flex items-center gap-1.5">{sw('bg-primary')} Planned</span>
        <span className="inline-flex items-center gap-1.5">{sw('bg-accent')} Day plan</span>
        <span className="inline-flex items-center gap-1.5">{sw('bg-bad')} Not done that day</span>
        <span className="inline-flex items-center gap-1.5">
          {sw('border border-dashed border-text/50')} Moved away
        </span>
        <span className="inline-flex items-center gap-1.5">
          <b className="rounded bg-bad/10 px-1 text-[10.5px] text-bad">2×</b> Deadlines missed
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
      <span className={clsx('mt-1 block font-body text-[11.5px] font-normal', SUB)}>
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
      <span className={clsx('mt-0.5 flex justify-between text-[11.5px]', SUB)}>
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

export function StatusPill({
  p,
  extra,
  short,
}: {
  p: PlannerProgress;
  extra?: string;
  short?: boolean;
}) {
  const s = statusOf(p);
  if (!s) return null;
  return (
    <div className={clsx('mb-1 flex items-center gap-1.5 text-[11.5px]', SUB)}>
      <span
        title={STATUS_TEXT[s]}
        className={clsx('rounded-full px-2 py-0.5 font-heading text-[11px] font-bold', PILL[s])}
      >
        {short ? `${p.done}/${p.planned} done` : STATUS_TEXT[s]}
      </span>
      {!short && (
        <span className="tabular-nums">
          {p.done}/{p.planned}
          {extra}
        </span>
      )}
    </div>
  );
}

function DayCell({
  cell,
  past,
  weekend,
  density,
  data,
  onTask,
}: {
  cell: Extract<PlannerCell, { entries: unknown }>;
  past: boolean;
  weekend: boolean;
  density: Density;
  data: Pick<PlannerTableData, 'tasks' | 'people' | 'groupBy'>;
  onTask: (id: number) => void;
}) {
  if (!cell.entries.length)
    return <span className={clsx('text-[12px]', FAINT)}>{weekend ? 'Weekend' : 'No tasks'}</span>;
  const short = density === 'short';
  return (
    <div className={clsx('flex min-w-0 flex-col', short ? 'gap-0.5' : 'gap-1.5')}>
      {past ? (
        <StatusPill p={cell} short={short} />
      ) : cell.planned ? (
        <div className="mb-1">
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
      {cell.entries.map((e, i) =>
        short ? (
          <ShortEntry key={`${e.taskId}-${e.kind}-${i}`} e={e} data={data} onTask={onTask} />
        ) : (
          <EntryCard key={`${e.taskId}-${e.kind}-${i}`} e={e} data={data} onTask={onTask} full />
        ),
      )}
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
const isStruck = (e: PlannerEntry) => e.kind === 'moved' || e.kind === 'replan';
const edgeOf = (e: PlannerEntry) =>
  isStruck(e)
    ? 'color-mix(in srgb, var(--text) 30%, transparent)'
    : e.kind === 'dayplan' && e.status !== 'done' && e.status !== 'missed'
      ? 'var(--accent)'
      : (EDGE[e.status] ?? 'var(--primary)');

/** Short view: one line a task (title, a coloured edge, a missed count or where it moved). */
function ShortEntry({
  e,
  data,
  onTask,
}: {
  e: PlannerEntry;
  data: Pick<PlannerTableData, 'tasks' | 'people' | 'groupBy'>;
  onTask: (id: number) => void;
}) {
  const t: PlannerTask | undefined = data.tasks[e.taskId];
  const struck = isStruck(e);
  const tip = [
    t ? `#${t.id} · ${t.project} → ${t.title}` : `Task ${e.taskId}`,
    t ? `Assignee: ${t.assignee}` : '',
    ...entryWords(e, data.people),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <button
      type="button"
      onClick={() => onTask(e.taskId)}
      title={tip}
      style={{ borderLeftColor: edgeOf(e) }}
      className={clsx(
        'flex w-full min-w-0 items-center gap-1 rounded-r border-l-[3px] bg-surface/80 px-1.5 py-[3px] text-left text-[12px] leading-tight hover:bg-primary-soft-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
        struck && 'border-dashed',
      )}
    >
      <span
        className={clsx(
          'min-w-0 flex-1 truncate',
          struck ? 'text-text/55 line-through' : 'text-text',
        )}
      >
        {t?.title ?? `Task ${e.taskId}`}
      </span>
      {e.status === 'done' && <span className="shrink-0 font-bold text-success">✓</span>}
      {struck && (
        <span className="shrink-0 text-[10.5px] text-text/65">
          → {e.to ? shortDay(e.to) : 'none'}
        </span>
      )}
      {e.missed > 0 && e.status !== 'done' && (
        <span className="shrink-0 rounded bg-bad/10 px-1 text-[10.5px] font-bold text-bad">
          {e.missed}×
        </span>
      )}
    </button>
  );
}

export function Badge({
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
        tone === 'done' && 'bg-success/15 font-bold text-success',
        tone === 'miss' && 'bg-bad/10 font-bold text-bad',
        tone === 'plan' && 'bg-primary/15 text-primary',
        tone === 'day' && 'bg-accent/20 text-text',
        tone === 'move' && 'bg-text/[0.07] text-text/80',
        tone === 'pull' && 'bg-warn/20 text-text',
      )}
    >
      {children}
    </span>
  );
}

/**
 * One task on one day as a card: the crumb and title, a coloured left edge and what happened.
 * `full` (the Full view, the side panels) adds the task's details: ID, the other name, deadline.
 */
export function EntryCard({
  e,
  data,
  onTask,
  full,
}: {
  e: PlannerEntry;
  data: Pick<PlannerTableData, 'tasks' | 'people' | 'groupBy'>;
  onTask: (id: number) => void;
  full?: boolean;
}) {
  const t: PlannerTask | undefined = data.tasks[e.taskId];
  const crumb = data.groupBy === 'project' ? t?.assignee : t?.project;
  const other = data.groupBy === 'project' ? t?.project : t?.assignee;
  const struck = isStruck(e);
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
      style={{ borderLeftColor: edgeOf(e) }}
      className={clsx(
        'flex w-full min-w-0 flex-col gap-1 rounded-md border border-l-[3px] bg-surface px-2 py-1.5 text-left text-[12.5px] leading-snug hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
        struck ? 'border-dashed border-text/30 text-text/60' : 'border-border text-text',
      )}
    >
      <span className={clsx('min-w-0', struck && 'line-through')}>
        <span className="text-text/60">{crumb ?? '…'} →</span> {t?.title ?? `Task ${e.taskId}`}
      </span>
      {full && t && (
        <span className="text-[11.5px] text-text/65">
          #{t.id} · {other} · deadline now {t.deadlineDay ? longDay(t.deadlineDay) : 'none'}
        </span>
      )}
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
  onOpen?: () => void;
}) {
  if (!cell || !cell.planned) return <span className={clsx('text-[12px]', FAINT)}>No tasks</span>;
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
        disabled={!onOpen}
        className="flex w-full flex-col gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {cell.groups.map((g) => (
          <span key={g.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12px]">
            <span className="min-w-0 truncate text-text">{g.name}</span>
            <span className={clsx('tabular-nums', SUB)}>
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
