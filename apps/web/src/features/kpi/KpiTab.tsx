// KPI tab (SRS 13): the management overview of every project, counts first. Every number opens
// the tasks behind it in "All tasks" at the bottom.
import { BackButton } from '../../components/BackButton';
import { usePlanner } from '../../components/plannerStore';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Accordion } from '../../components/Accordion';
import { PageHead } from '../../components/ui/PageHead';
import { IconKpi } from '../../components/ui/icons';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { InfoContext } from '../../components/infoContext';
import { InfoTip } from '../../components/InfoTip';
import { closeSpotlight, spotlightSoon } from '../../components/spotlight/spotlight';
import { fmtDate } from '../dev/format';
import {
  useFilterSummary,
  useFilters,
  useKpiControls,
  type KpiPeriod,
} from '../filters/useFilters';
import { taskColumns } from '../tasks/columns';
import { TaskList } from '../tasks/TaskList';
import { ActivityCard } from './ActivityCard';
import { useKpiParams, useKpiSummary } from './api';
import { KPI_INFO } from './info';
import { InsightsCard } from './InsightsCard';
import { KpiTiles } from './KpiTiles';
import { KpiInHandCard } from './InHandByCard';
import { kpiFilterKey, useKpiList, useOpenKpiList } from './kpiList';
import { OverdueCard } from './OverdueCard';
import { PERIOD_WORDS } from './format';
import { PeopleCard } from './PeopleCard';
import { ProjectHealthCard } from './ProjectHealthCard';
import { useProjectShow } from './projectShow';
import { WorkloadCard } from './WorkloadCard';

const COLUMNS = taskColumns();

export function KpiTab() {
  const params = useKpiParams();
  const showing = useFilterSummary('kpi');
  const { data: summary } = useKpiSummary();
  const { list, reveal, reset, revealed } = useKpiList();
  const [open, setOpen] = useState(false);
  const [listTotal, setListTotal] = useState<number>();
  const allRef = useRef<HTMLElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const overdueRef = useRef<HTMLDivElement>(null);

  // A number clicked anywhere on the tab opens and scrolls to "All tasks".
  useEffect(() => {
    if (!reveal) return;
    revealed();
    setOpen(true);
    spotlightSoon(allRef);
  }, [reveal, revealed]);
  // Leaving the tab puts the spotlight away.
  useEffect(() => () => closeSpotlight(), []);

  // Changing the filters returns "All tasks" to its default, unless the click set them.
  const { filters } = useFilters();
  const currentKey = kpiFilterKey(filters);
  const lastKey = useRef(currentKey);
  useEffect(() => {
    if (currentKey === lastKey.current) return;
    lastKey.current = currentKey;
    const l = useKpiList.getState().list;
    if (l.params && l.filterKey !== currentKey) reset();
  }, [currentKey, reset]);

  const label = list.label ? `All tasks: ${list.label}` : 'All tasks';
  return (
    <InfoContext.Provider value={showing}>
      {/* What the filters cover, for the page export in the page tools. */}
      <span hidden data-showing={showing ?? ''} />
      <div className="space-y-4">
        <PageHead
          title="KPI"
          sub="Management overview: every project, all departments"
          icon={<IconKpi size={24} />}
        >
          <PeriodSwitch range={summary?.range} />
        </PageHead>
        <KpiTiles
          onProjects={(show) => {
            useProjectShow.getState().set(show);
            spotlightSoon(projectsRef);
          }}
          onOverdue={() => {
            if (!overdueRef.current) return false;
            spotlightSoon(overdueRef);
            return true;
          }}
        />
        {summary && summary.noProject.open > 0 && <NoProjectNote n={summary.noProject.open} />}

        <SortableGroup
          group="kpi.cards"
          noun="card"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
          items={[
            { id: 'insights', className: 'lg:col-span-12', node: <InsightsCard /> },
            {
              id: 'projectHealth',
              className: 'lg:col-span-12',
              node: <ProjectHealthCard ref={projectsRef} />,
            },
            { id: 'inHand', className: 'lg:col-span-12', node: <KpiInHandCard /> },
            { id: 'overdue', className: 'lg:col-span-6', node: <OverdueCard ref={overdueRef} /> },
            { id: 'workload', className: 'lg:col-span-6', node: <WorkloadCard /> },
            { id: 'people', className: 'lg:col-span-12', node: <PeopleCard /> },
            { id: 'activity', className: 'lg:col-span-12', node: <ActivityCard /> },
          ]}
        />

        <Accordion
          tour="kpi-all"
          ref={allRef}
          title={label}
          info={list.info ?? KPI_INFO.tab}
          hint="Row click opens the task"
          count={list.params ? listTotal : summary?.open}
          open={open}
          onOpenChange={setOpen}
        >
          {list.params && (
            <div className="mb-3 flex flex-wrap items-center gap-4">
              {list.back === 'planner' && (
                <BackButton label="Back to planner" onBack={() => usePlanner.getState().show()} />
              )}
              <button
                type="button"
                onClick={reset}
                className="font-heading text-button text-primary hover:underline"
              >
                Show all open tasks
              </button>
            </div>
          )}
          <TaskList
            filterParams={{ ...params, kpi: 'open', ...list.params }}
            kind="kpi"
            preset="all"
            exportName={list.label ? `KPI · ${list.label}` : 'KPI · Open tasks'}
            columns={COLUMNS}
            searchable
            onTotal={setListTotal}
          />
        </Accordion>
      </div>
    </InfoContext.Provider>
  );
}

const PERIODS: KpiPeriod[] = ['day', 'week', 'month'];

/** Day / Week / Month: the period of "closed", "on-time" and the people table. */
function PeriodSwitch({ range }: { range?: { start: string; end: string } }) {
  const { period, setPeriod } = useKpiControls();
  const end = range && new Date(new Date(range.end).getTime() - 1).toISOString();
  return (
    <div className="flex flex-wrap items-center gap-3" data-tour="kpi-period">
      <div
        className="inline-flex rounded-control border border-border bg-surface p-1"
        role="radiogroup"
        aria-label="Period"
      >
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={period === p}
            onClick={() => setPeriod(p)}
            className={clsx(
              'rounded px-4 py-1.5 font-heading text-button capitalize',
              period === p
                ? 'bg-primary text-white'
                : 'text-primary-dark hover:bg-primary-soft-100',
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <span className="text-table text-text-muted">
        {PERIOD_WORDS[period].now}
        {range && period !== 'day' && `: ${fmtDate(range.start)} to ${fmtDate(end!)}`}
        {' · every project, all departments'}
      </span>
      <InfoTip text={`${KPI_INFO.tab} ${KPI_INFO.workingTime}`} label="KPI tab" />
    </div>
  );
}

function NoProjectNote({ n }: { n: number }) {
  const open = useOpenKpiList();
  return (
    <p className="rounded-card border border-border bg-surface px-3 py-2 text-table">
      <button
        type="button"
        onClick={() =>
          open({
            label: 'Open tasks outside any project',
            params: { kpi: 'open', noProject: 'true' },
            info: 'Open tasks with no workgroup. They count in the tiles but not in project or workload figures.',
          })
        }
        className="font-bold text-primary hover:underline"
      >
        {n} open task{n === 1 ? '' : 's'}
      </button>{' '}
      sit outside any project: counted in the tiles, not in project or workload figures.
    </p>
  );
}
