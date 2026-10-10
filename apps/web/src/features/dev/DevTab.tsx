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
import { useDevAssignees, useDevParams, useDevSummary } from './api';
import { AssigneeTableCard, PendingDoneCard } from './AssigneeCards';
import { useDrillStore } from './drill';
import { TILE_LABELS } from './format';
import { RankingCard } from './RankingCard';
import { StageMatrixCard } from './StageMatrixCard';
import { SummaryTiles } from './SummaryTiles';

type Section = 'dueToday' | 'overdue' | 'all';

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
  });
  // "All tasks" follows the last tile, count or header alert clicked (DEV-01..05).
  const { drill, reveal: revealDrill, open: openDrill, clear, revealed } = useDrillStore();
  const [listTotal, setListTotal] = useState<number>();
  const allRef = useRef<HTMLElement>(null);
  const refs = {
    dueToday: useRef<HTMLElement>(null),
    overdue: useRef<HTMLElement>(null),
    all: allRef,
  };

  const toggle = (s: Section) => (o: boolean) => setOpen((prev) => ({ ...prev, [s]: o }));
  const reveal = (s: Section) => {
    setOpen((prev) => ({ ...prev, [s]: true }));
    requestAnimationFrame(() =>
      refs[s].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  // A drill from anywhere (this tab or the header bell) opens and scrolls to "All tasks".
  useEffect(() => {
    if (!revealDrill) return;
    revealed();
    setOpen((prev) => ({ ...prev, all: true }));
    requestAnimationFrame(() =>
      allRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, [revealDrill, revealed]);

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
    </div>
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
