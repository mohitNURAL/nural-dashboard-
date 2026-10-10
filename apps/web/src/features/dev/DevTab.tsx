// Development tab (SRS 3, wireframe in SRS 6): the All / Dev / Issues switch, tiles first,
// people next, detail in accordions. Any count drills into "All tasks".
import type { DevPreset, DevScope } from '@nural/shared';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion } from '../../components/Accordion';
import { useDevScope } from '../filters/useFilters';
import { taskColumns } from '../tasks/columns';
import { TaskList } from '../tasks/TaskList';
import { AgeingCard } from './AgeingCard';
import { AlertDetails } from './AlertDetails';
import { useAlerts } from './alerts';
import { useDevAssignees, useDevParams, useDevSummary } from './api';
import { AssigneeTableCard, PendingDoneCard } from './AssigneeCards';
import { useDrillStore } from './drill';
import { TILE_LABELS } from './format';
import { RankingCard } from './RankingCard';
import { StageMatrixCard } from './StageMatrixCard';
import { SummaryTiles } from './SummaryTiles';

type Section = 'dueToday' | 'overdue' | 'all' | 'alerts';

const LIST_COLUMNS = taskColumns();
const ALL_COLUMNS = taskColumns({ withCreator: true });

export function DevTab() {
  const params = useDevParams();
  const { data: summary } = useDevSummary();
  const { data: assignees } = useDevAssignees();
  const [open, setOpen] = useState<Record<Section, boolean>>({
    dueToday: false,
    overdue: false,
    all: false,
    alerts: false,
  });
  // "All tasks" follows the last tile, count or header alert clicked (DEV-01..05).
  const { drill, reveal: revealDrill, open: openDrill, clear, revealed } = useDrillStore();
  const { showAlerts, alertsShown } = useDrillStore();
  const { data: alerts } = useAlerts();
  const [listTotal, setListTotal] = useState<number>();
  const allRef = useRef<HTMLElement>(null);
  const alertsRef = useRef<HTMLElement>(null);
  const refs = {
    dueToday: useRef<HTMLElement>(null),
    overdue: useRef<HTMLElement>(null),
    all: allRef,
    alerts: alertsRef,
  };

  const toggle = (s: Section) => (o: boolean) => setOpen((prev) => ({ ...prev, [s]: o }));
  const reveal = (s: Section) => {
    setOpen((prev) => ({ ...prev, [s]: true }));
    requestAnimationFrame(() =>
      refs[s].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  // A drill from anywhere (this tab or the header bell) opens and scrolls to "All tasks".
  const stopFollow = useRef<() => void>(undefined);
  useEffect(() => {
    if (!revealDrill) return;
    revealed();
    setOpen((prev) => ({ ...prev, all: true }));
    stopFollow.current?.();
    stopFollow.current = keepInView(allRef);
  }, [revealDrill, revealed]);
  // The header bell opens Alert details.
  useEffect(() => {
    if (!showAlerts) return;
    alertsShown();
    setOpen((prev) => ({ ...prev, alerts: true }));
    stopFollow.current?.();
    stopFollow.current = keepInView(alertsRef);
  }, [showAlerts, alertsShown]);
  useEffect(() => () => stopFollow.current?.(), []);

  const onTile = (preset: DevPreset) => {
    if (preset === 'overdue') return reveal('overdue');
    openDrill({ label: TILE_LABELS[preset], preset });
  };

  // Header alerts ignore the filter bar, so their lists do too (keeping only the switch).
  const listParams = useMemo(
    () =>
      drill?.replaceFilters
        ? { scope: params.scope!, ...drill.params }
        : { ...params, ...drill?.params },
    [params, drill],
  );
  const allCount = drill ? listTotal : summary?.total;
  const tilePreset = drill && !drill.params ? drill.preset : null;

  return (
    <div className="space-y-4">
      <ScopeSwitch />
      <SummaryTiles
        active={open.all && tilePreset !== 'total' ? tilePreset : null}
        onSelect={onTile}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <AssigneeTableCard className="lg:col-span-7" />
        <PendingDoneCard className="lg:col-span-5" />
        <AgeingCard className="lg:col-span-6" />
        <RankingCard className="lg:col-span-6" />
        <StageMatrixCard className="lg:col-span-12" />
      </div>

      <Accordion
        ref={refs.dueToday}
        title="Tasks due today"
        hint="Latest deadline first"
        count={assignees?.totals.dueToday}
        open={open.dueToday}
        onOpenChange={toggle('dueToday')}
      >
        <TaskList filterParams={params} preset="dueToday" columns={LIST_COLUMNS} />
      </Accordion>

      <Accordion
        ref={refs.overdue}
        title="Overdue tasks"
        hint="Pending tasks past their deadline"
        count={summary?.overdue}
        tone="bad"
        open={open.overdue}
        onOpenChange={toggle('overdue')}
      >
        <TaskList filterParams={params} preset="overdue" columns={LIST_COLUMNS} />
      </Accordion>

      <Accordion
        ref={refs.all}
        title={drill ? `All tasks: ${drill.label}` : 'All tasks'}
        hint="Row click opens the task"
        count={allCount}
        open={open.all}
        onOpenChange={toggle('all')}
      >
        {drill && (
          <button
            type="button"
            onClick={clear}
            className="mb-3 font-heading text-button text-primary hover:underline"
          >
            Show all tasks
          </button>
        )}
        <TaskList
          filterParams={listParams}
          preset={drill?.preset ?? 'total'}
          columns={ALL_COLUMNS}
          searchable
          onTotal={setListTotal}
        />
      </Accordion>

      <Accordion
        ref={refs.alerts}
        title="Alert details"
        hint="Overdue and over 5 days in a stage, project-wise or assignee-wise"
        count={alerts?.total}
        tone="bad"
        open={open.alerts}
        onOpenChange={toggle('alerts')}
      >
        <AlertDetails />
      </Accordion>
    </div>
  );
}

const SETTLE_MS = 2500;

/**
 * Scrolls to the element and keeps it at the top while the page settles: a new filter makes
 * the cards above reload and change height, which would push the list out of view. Stops after
 * SETTLE_MS or as soon as the user scrolls.
 */
function keepInView(ref: React.RefObject<HTMLElement | null>) {
  const snap = () => ref.current?.scrollIntoView({ block: 'start' });
  const frame = requestAnimationFrame(snap);
  const observer = new ResizeObserver(snap);
  observer.observe(document.body);
  const stop = () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    for (const e of USER_SCROLL) window.removeEventListener(e, stop);
    clearTimeout(timer);
  };
  const timer = setTimeout(stop, SETTLE_MS);
  for (const e of USER_SCROLL) window.addEventListener(e, stop, { passive: true });
  return stop;
}
const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

const SCOPES: { value: DevScope; label: string; hint: string }[] = [
  { value: 'all', label: 'All', hint: 'Tasks and issues' },
  { value: 'dev', label: 'Dev', hint: 'Development tasks' },
  { value: 'issues', label: 'Issues', hint: 'Bugs and feedback' },
];

/** All / Dev / Issues: every number on the tab follows it (Development department only). */
function ScopeSwitch() {
  const [scope, setScope] = useDevScope();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className="inline-flex rounded-control border border-border bg-surface p-1"
        role="radiogroup"
        aria-label="Show"
      >
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={scope === s.value}
            title={s.hint}
            onClick={() => setScope(s.value)}
            className={clsx(
              'rounded px-4 py-1.5 font-heading text-button',
              scope === s.value
                ? 'bg-primary text-white'
                : 'text-primary-dark hover:bg-primary-soft-100',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <span className="text-table text-text-muted">
        {SCOPES.find((s) => s.value === scope)!.hint}, Development department only
      </span>
    </div>
  );
}
