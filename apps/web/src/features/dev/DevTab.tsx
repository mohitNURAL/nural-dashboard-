// Development tab (SRS 3, wireframe in SRS 6): the All / Dev / Issues switch, tiles first,
// people next, detail in accordions. Any count drills into "All tasks".
import type { DevPreset, DevScope } from '@nural/shared';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion } from '../../components/Accordion';
import { PageHead } from '../../components/ui/PageHead';
import { IconDev } from '../../components/ui/icons';
import { keepInView } from '../../components/keepInView';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { InfoContext } from '../../components/infoContext';
import { useDevScope, useFilterSummary, useFilters } from '../filters/useFilters';
import { taskColumns } from '../tasks/columns';
import { TaskList } from '../tasks/TaskList';
import { TaskAgeingCard } from './AgeingCard';
import { AlertDetails } from './AlertDetails';
import { useAlerts } from './alerts';
import { useDevAssignees, useDevParams, useDevSummary } from './api';
import { AssigneeTableCard, PendingDoneCard } from './AssigneeCards';
import { filterKey, useDrillStore } from './drill';
import { drillInfo } from './drillInfo';
import { TILE_LABELS } from './format';
import { RankingCard } from './RankingCard';
import { StageMatrixCard } from './StageMatrixCard';
import { SummaryTiles } from './SummaryTiles';
import { INFO } from '../info';

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
  // Every "i" on this tab adds what the filters and the switch cover.
  const showing = useFilterSummary('dev');
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
  // Clearing, resetting or changing the filters returns "All tasks" to its default, unless the
  // new filters are the ones the drill-down itself set (e.g. clicking an assignee's count).
  const { filters } = useFilters();
  const [scope] = useDevScope();
  const currentKey = filterKey(filters, scope);
  const lastKey = useRef(currentKey);
  useEffect(() => {
    if (currentKey === lastKey.current) return;
    lastKey.current = currentKey;
    const open = useDrillStore.getState().drill;
    if (open && open.filterKey !== currentKey) clear();
  }, [currentKey, clear]);

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
    <InfoContext.Provider value={showing}>
      <div className="space-y-4">
        <PageHead
          title="Development"
          sub="Tasks and issues of the Development department, their stages and deadlines"
          icon={<IconDev size={24} />}
        >
          <ScopeSwitch />
        </PageHead>
        <SummaryTiles
          active={open.all && tilePreset !== 'total' ? tilePreset : null}
          onSelect={onTile}
        />

        <SortableGroup
          group="dev.cards"
          noun="card"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
          items={[
            { id: 'assignees', className: 'lg:col-span-7', node: <AssigneeTableCard /> },
            { id: 'pendingDone', className: 'lg:col-span-5', node: <PendingDoneCard /> },
            { id: 'ageing', className: 'lg:col-span-6', node: <TaskAgeingCard /> },
            { id: 'ranking', className: 'lg:col-span-6', node: <RankingCard /> },
            { id: 'matrix', className: 'lg:col-span-12', node: <StageMatrixCard /> },
          ]}
        />

        <SortableGroup
          group="dev.sections"
          noun="section"
          className="space-y-4"
          items={[
            {
              id: 'dueToday',
              node: (
                <Accordion
                  ref={refs.dueToday}
                  title="Tasks due today"
                  info={INFO.dueToday}
                  hint="Latest deadline first"
                  count={assignees?.totals.dueToday}
                  open={open.dueToday}
                  onOpenChange={toggle('dueToday')}
                >
                  <TaskList
                    filterParams={params}
                    preset="dueToday"
                    columns={LIST_COLUMNS}
                    exportName="Tasks due today"
                  />
                </Accordion>
              ),
            },
            {
              id: 'overdue',
              node: (
                <Accordion
                  ref={refs.overdue}
                  title="Overdue tasks"
                  info={INFO.overdue}
                  hint="Pending tasks past their deadline"
                  count={summary?.overdue}
                  tone="bad"
                  open={open.overdue}
                  onOpenChange={toggle('overdue')}
                >
                  <TaskList
                    filterParams={params}
                    preset="overdue"
                    columns={LIST_COLUMNS}
                    exportName="Overdue tasks"
                  />
                </Accordion>
              ),
            },
            {
              id: 'all',
              node: (
                <Accordion
                  ref={refs.all}
                  title={drill ? `All tasks: ${drill.label}` : 'All tasks'}
                  info={drillInfo(drill, alerts?.stuckDays)}
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
                    exportName={drill ? `All tasks · ${drill.label}` : 'All tasks'}
                    columns={ALL_COLUMNS}
                    searchable
                    onTotal={setListTotal}
                  />
                </Accordion>
              ),
            },
            {
              id: 'alerts',
              node: (
                <Accordion
                  ref={refs.alerts}
                  title="Alert details"
                  info={INFO.alerts}
                  hint="Overdue and over 5 days in a stage, project-wise or assignee-wise"
                  count={alerts?.total}
                  tone="bad"
                  open={open.alerts}
                  onOpenChange={toggle('alerts')}
                >
                  <AlertDetails />
                </Accordion>
              ),
            },
          ]}
        />
      </div>
    </InfoContext.Provider>
  );
}

const SCOPES: { value: DevScope; label: string; hint: string }[] = [
  { value: 'all', label: 'All', hint: 'Tasks and issues' },
  { value: 'dev', label: 'Dev', hint: 'Development tasks' },
  { value: 'issues', label: 'Issues', hint: 'Bugs and feedback' },
];

/** All / Dev / Issues: every number on the tab follows it (Development department only). */
function ScopeSwitch() {
  const [scope, setScope] = useDevScope();
  return (
    <div className="flex flex-wrap items-center gap-3" data-tour="dev-scope">
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
