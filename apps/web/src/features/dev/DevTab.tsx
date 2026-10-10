// Development tab (SRS 3, wireframe in SRS 6): tiles first, people next, detail in accordions.
import type { DevPreset } from '@nural/shared';
import { useRef, useState } from 'react';
import { Accordion } from '../../components/Accordion';
import { TaskList } from '../tasks/TaskList';
import { AgeingCard } from './AgeingCard';
import { useDevAssignees, useDevParams, useDevSummary } from './api';
import { AssigneeTableCard, PendingDoneCard } from './AssigneeCards';
import { TILE_LABELS } from './format';
import { RankingCard } from './RankingCard';
import { StageMatrixCard } from './StageMatrixCard';
import { SummaryTiles } from './SummaryTiles';

type Section = 'dueToday' | 'overdue' | 'all';

export function DevTab() {
  const params = useDevParams();
  const { data: summary } = useDevSummary();
  const { data: assignees } = useDevAssignees();
  const [open, setOpen] = useState<Record<Section, boolean>>({
    dueToday: false,
    overdue: false,
    all: false,
  });
  // The "All tasks" list follows the last tile clicked (DEV-01).
  const [allPreset, setAllPreset] = useState<DevPreset>('total');
  const refs = {
    dueToday: useRef<HTMLElement>(null),
    overdue: useRef<HTMLElement>(null),
    all: useRef<HTMLElement>(null),
  };

  const toggle = (s: Section) => (o: boolean) => setOpen((prev) => ({ ...prev, [s]: o }));
  const reveal = (s: Section) => {
    setOpen((prev) => ({ ...prev, [s]: true }));
    requestAnimationFrame(() =>
      refs[s].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const onTile = (preset: DevPreset) => {
    if (preset === 'overdue') return reveal('overdue');
    setAllPreset(preset);
    reveal('all');
  };

  const allCount =
    allPreset === 'dueToday'
      ? assignees?.totals.dueToday
      : (summary?.[allPreset as keyof typeof summary] as number | undefined);

  return (
    <div className="space-y-4">
      <SummaryTiles
        active={open.all && allPreset !== 'total' ? allPreset : null}
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
        <TaskList filterParams={params} preset="dueToday" />
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
        <TaskList filterParams={params} preset="overdue" />
      </Accordion>

      <Accordion
        ref={refs.all}
        title={allPreset === 'total' ? 'All tasks' : `All tasks: ${TILE_LABELS[allPreset]}`}
        hint="Row click opens the task"
        count={allCount}
        open={open.all}
        onOpenChange={toggle('all')}
      >
        {allPreset !== 'total' && (
          <button
            type="button"
            onClick={() => setAllPreset('total')}
            className="mb-3 font-heading text-button text-primary hover:underline"
          >
            Show all tasks
          </button>
        )}
        <TaskList filterParams={params} preset={allPreset} withCreator searchable />
      </Accordion>
    </div>
  );
}
