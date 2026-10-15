// Insights (SRS 18): what is holding us back, worked out from Bitrix24 data (Infowan absences join
// once connected). Everyone has it: members see their own work ("My insights"), managers the
// company. Every number opens the tasks behind it in the list at the bottom.
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion } from '../../components/Accordion';
import { Card } from '../../components/Card';
import { Chart } from '../../components/Chart';
import { token } from '../../components/chartTheme';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { closeSpotlight, spotlightSoon } from '../../components/spotlight/spotlight';
import { StatTile } from '../../components/StatTile';
import { PageHead } from '../../components/ui/PageHead';
import { IconInsights } from '../../components/ui/icons';
import { useOpenTask } from '../tasks/api';
import { taskColumns } from '../tasks/columns';
import { TaskList } from '../tasks/TaskList';
import { fmtDate } from '../dev/format';
import {
  useInsightList,
  useInsights,
  type EntityList,
  type Insights,
  type KeyPoint,
  type TileKey,
} from './api';
import { tileEntities } from './entities';

const COLUMNS = taskColumns({ withCreator: true });
const WINDOWS = [7, 14, 30] as const;
/** What each tile counts. */
const UNIT: Record<TileKey, string> = {
  laggingProjects: 'Projects',
  laggingPeople: 'People',
  overloaded: 'People',
  underloaded: 'People',
  shared: 'People',
  atRisk: 'Tasks',
};

const KIND: Record<KeyPoint['kind'], { label: string; cls: string }> = {
  pull: { label: 'Cause', cls: 'bg-bad/15 text-bad' },
  project: { label: 'Project', cls: 'bg-warn/15 text-warn' },
  person: { label: 'Person', cls: 'bg-warn/15 text-warn' },
  overload: { label: 'Overload', cls: 'bg-bad/15 text-bad' },
  underload: { label: 'Has room', cls: 'bg-accent/15 text-accent' },
  release: { label: 'Release', cls: 'bg-primary/15 text-primary' },
};

export function InsightsPage() {
  const [win, setWin] = useState<number>(14);
  const { data, isLoading } = useInsights(win);
  const own = data?.viewScope === 'own';
  const list = useInsightList();
  const [listOpen, setListOpen] = useState(false);
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!list.reveal) return;
    setListOpen(true);
    spotlightSoon(listRef);
  }, [list.reveal]);
  useEffect(() => () => closeSpotlight(), []);
  // Without a choice, the list shows the tasks behind every key point.
  const defaultIds = useMemo(
    () => [...new Set((data?.keyPoints ?? []).flatMap((k) => k.taskIds))],
    [data],
  );
  const ids = list.label ? list.ids : defaultIds;

  const tile = (key: TileKey, label: string, sub: string, info: string, tone?: 'bad') => ({
    id: key,
    node: (
      <StatTile
        label={label}
        info={info}
        value={data?.tiles[key]}
        sub={`${UNIT[key]} · ${sub}`}
        tone={tone && data?.tiles[key] ? tone : undefined}
        // A tile first lists the projects or people it counts; a row then opens their tasks.
        onClick={() => data && list.openEntities(tileEntities(key, data, label))}
      />
    ),
  });

  return (
    <div className="space-y-4">
      <PageHead
        title={own ? 'My insights' : 'Insights'}
        sub={
          own
            ? 'What is holding your work back: your load, your late tasks, and projects pulling you away'
            : 'What is holding us back: lagging projects and people, load, and projects pulling people away'
        }
        icon={<IconInsights size={24} />}
      >
        <div
          className="inline-flex rounded-control border border-border bg-surface p-1"
          role="radiogroup"
          aria-label="Period"
          data-tour="insights-window"
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={win === w}
              onClick={() => setWin(w)}
              className={clsx(
                'rounded px-3 py-1.5 font-heading text-button',
                win === w ? 'bg-primary text-white' : 'text-primary-dark hover:bg-primary-soft-100',
              )}
            >
              {w} days
            </button>
          ))}
        </div>
      </PageHead>

      <SortableGroup
        group="insights.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          tile(
            'laggingProjects',
            own ? 'Projects behind' : 'Lagging projects',
            'Overdue share, no action or slowing',
            'Projects with a high share of overdue tasks, no action for 10+ working days, or closing much less than in the period before.',
            'bad',
          ),
          tile(
            'laggingPeople',
            own ? 'Behind (you)' : 'Lagging people',
            'Overdue, late or slowing',
            'People with many overdue tasks, a low on-time rate, or closing much less than before.',
            'bad',
          ),
          tile(
            'overloaded',
            'Overloaded',
            'Too much open or due soon',
            'At least 10 open tasks and twice the team middle, or 8+ due in the next 5 working days.',
            'bad',
          ),
          tile(
            'underloaded',
            'Has room',
            'Little open while projects are behind',
            'Almost nothing open and little closed lately, while one of their projects has overdue work: could take tasks over.',
          ),
          tile(
            'shared',
            'Split across projects',
            'Open work in 2+ projects',
            'People with open work in two or more projects at once. Click for the overdue tasks of projects losing them to another.',
          ),
          tile(
            'atRisk',
            'Releases at risk',
            'Due this week or next',
            'Tasks due this week or next that are overdue or not started close to the date.',
            'bad',
          ),
        ]}
      />

      <SortableGroup
        group="insights.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        items={[
          {
            id: 'holding',
            className: 'lg:col-span-12',
            node: <HoldingCard data={data} loading={isLoading} />,
          },
          {
            id: 'projects',
            className: 'lg:col-span-6',
            node: <ProjectsCard data={data} loading={isLoading} />,
          },
          {
            id: 'load',
            className: 'lg:col-span-6',
            node: <LoadCard data={data} loading={isLoading} />,
          },
          {
            id: 'overlap',
            className: 'lg:col-span-12',
            node: <OverlapCard data={data} loading={isLoading} />,
          },
          {
            id: 'releases',
            className: 'lg:col-span-12',
            node: <ReleasesCard data={data} loading={isLoading} />,
          },
          { id: 'absences', className: 'lg:col-span-12', node: <AbsenceCard data={data} /> },
        ]}
      />

      <Accordion
        ref={listRef}
        tour="insights-tasks"
        title={
          list.entities
            ? `${list.label} · by ${list.entities.kind === 'project' ? 'project' : 'person'}`
            : list.label
              ? `Tasks: ${list.label}`
              : 'Tasks behind the key points'
        }
        hint={list.entities ? 'Click a row for its tasks' : 'Row click opens the task'}
        count={list.entities ? list.entities.rows.length : ids.length}
        open={listOpen}
        onOpenChange={setListOpen}
      >
        <div className="mb-3 flex flex-wrap gap-4">
          {list.back && (
            <button
              type="button"
              onClick={list.goBack}
              className="font-heading text-button text-primary hover:underline"
            >
              ‹ Back to {list.back.label.toLowerCase()}
            </button>
          )}
          {list.label && (
            <button
              type="button"
              onClick={list.clear}
              className="font-heading text-button text-text-muted hover:text-primary hover:underline"
            >
              Show the tasks behind every key point
            </button>
          )}
        </div>
        {list.entities ? (
          <EntityTable list={list.entities} onPick={list.openEntity} />
        ) : ids.length ? (
          <TaskList
            filterParams={{ ids: ids.join(',') }}
            kind="all"
            preset="all"
            exportName={list.label ? `Insights · ${list.label}` : 'Insights'}
            columns={COLUMNS}
            searchable
          />
        ) : (
          <p className="py-6 text-center text-text-muted">Nothing here: no tasks behind this.</p>
        )}
      </Accordion>
    </div>
  );
}

interface CardProps {
  data?: Insights;
  loading?: boolean;
  className?: string;
}

function HoldingCard({ data, loading, className }: CardProps) {
  const open = useInsightList((s) => s.open);
  const points = data?.keyPoints ?? [];
  return (
    <div className={className}>
      <Card
        title={data?.viewScope === 'own' ? 'What is holding you back' : 'What is holding us back'}
        info="The findings below ranked: causes first (a project pulling people off another), then lagging projects and people, overload, people with room, and releases at risk. Click one for its tasks."
        loading={loading}
        empty={!!data && !points.length}
        emptyText="Nothing holding back right now."
      >
        <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {points.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => open(p.text, p.taskIds)}
                className="flex w-full items-start gap-3 rounded-card border border-border p-3 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-pop"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent font-heading text-button text-white">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={clsx(
                      'mb-1 inline-block rounded-full px-2 py-0.5 font-heading text-label font-bold uppercase',
                      KIND[p.kind].cls,
                    )}
                  >
                    {KIND[p.kind].label}
                  </span>
                  <span className="block text-body text-text">{p.text}</span>
                  <span className="text-table text-text-muted">
                    {p.taskIds.length} task{p.taskIds.length === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function ProjectsCard({ data, loading, className }: CardProps) {
  const open = useInsightList((s) => s.open);
  const rows = useMemo(
    () =>
      (data?.projects ?? [])
        .filter((p) => p.open > 0)
        .slice(0, 12)
        .reverse(),
    [data],
  );
  return (
    <div className={className}>
      <Card
        title="Projects: overdue vs on track"
        info="Open tasks per project, overdue part in red; lagging projects are marked. Click a bar for its tasks."
        loading={loading}
        empty={!!data && !rows.length}
      >
        <Chart
          label="Open and overdue tasks per project"
          height={Math.max(160, rows.length * 24 + 50)}
          onClick={(p) => {
            const r = rows[p.dataIndex];
            if (!r) return;
            const overdue = p.seriesName === 'Overdue';
            open(`${r.name} · ${overdue ? 'overdue' : 'open'}`, overdue ? r.overdueIds : r.openIds);
          }}
          option={{
            grid: { left: 8, right: 16, top: 8, bottom: 28, containLabel: true },
            legend: { bottom: 0, itemWidth: 10, itemHeight: 10, icon: 'rect' },
            tooltip: {
              trigger: 'axis',
              axisPointer: { type: 'shadow' },
              formatter: (params: unknown) => {
                const r = rows[(params as { dataIndex: number }[])[0]?.dataIndex ?? -1];
                if (!r) return '';
                return [
                  `<b>${r.name}</b>`,
                  `${r.overdue} of ${r.open} open overdue`,
                  ...r.reasons,
                ].join('<br/>');
              },
            },
            xAxis: {
              type: 'value',
              splitLine: { lineStyle: { color: token('--primary-soft-100') } },
            },
            yAxis: {
              type: 'category',
              data: rows.map((r) => (r.lagging ? `⚠ ${r.name}` : r.name)),
              axisTick: { show: false },
              axisLabel: { width: 150, overflow: 'truncate' },
              axisLine: { lineStyle: { color: token('--border') } },
            },
            series: [
              {
                name: 'Overdue',
                type: 'bar',
                stack: 'n',
                barMaxWidth: 14,
                itemStyle: { color: token('--bad') },
                data: rows.map((r) => r.overdue),
              },
              {
                name: 'On track',
                type: 'bar',
                stack: 'n',
                barMaxWidth: 14,
                itemStyle: { color: token('--primary'), borderRadius: [0, 3, 3, 0] },
                data: rows.map((r) => r.open - r.overdue),
              },
            ],
          }}
        />
      </Card>
    </div>
  );
}

function LoadCard({ data, loading, className }: CardProps) {
  const open = useInsightList((s) => s.open);
  const rows = useMemo(
    () =>
      (data?.load ?? [])
        .filter((l) => l.open > 0)
        .slice(0, 14)
        .reverse(),
    [data],
  );
  return (
    <div className={className}>
      <Card
        title="Load per person"
        info="Open tasks per person: overdue, due in the next 5 working days, and the rest. ▲ overloaded, ▽ has room. Click a bar for the tasks."
        loading={loading}
        empty={!!data && !rows.length}
      >
        <Chart
          label="Open tasks per person"
          height={Math.max(160, rows.length * 24 + 50)}
          onClick={(p) => {
            const r = rows[p.dataIndex];
            if (r) open(`${r.name} · open`, r.openIds);
          }}
          option={{
            grid: { left: 8, right: 16, top: 8, bottom: 28, containLabel: true },
            legend: { bottom: 0, itemWidth: 10, itemHeight: 10, icon: 'rect' },
            tooltip: {
              trigger: 'axis',
              axisPointer: { type: 'shadow' },
              formatter: (params: unknown) => {
                const r = rows[(params as { dataIndex: number }[])[0]?.dataIndex ?? -1];
                if (!r) return '';
                return [
                  `<b>${r.name}</b>`,
                  `${r.open} open in ${r.projects} project${r.projects === 1 ? '' : 's'}`,
                  `${r.closedNow} closed lately`,
                  r.reason ?? '',
                ].join('<br/>');
              },
            },
            xAxis: {
              type: 'value',
              splitLine: { lineStyle: { color: token('--primary-soft-100') } },
            },
            yAxis: {
              type: 'category',
              data: rows.map(
                (r) => `${r.level === 'over' ? '▲ ' : r.level === 'under' ? '▽ ' : ''}${r.name}`,
              ),
              axisTick: { show: false },
              axisLabel: { width: 150, overflow: 'truncate' },
              axisLine: { lineStyle: { color: token('--border') } },
            },
            series: [
              {
                name: 'Overdue',
                type: 'bar',
                stack: 'n',
                barMaxWidth: 14,
                itemStyle: { color: token('--bad') },
                data: rows.map((r) => r.overdue),
              },
              {
                name: 'Due in 5 days',
                type: 'bar',
                stack: 'n',
                barMaxWidth: 14,
                itemStyle: { color: token('--warn') },
                data: rows.map((r) => r.dueSoon),
              },
              {
                name: 'Other open',
                type: 'bar',
                stack: 'n',
                barMaxWidth: 14,
                itemStyle: { color: token('--primary'), borderRadius: [0, 3, 3, 0] },
                data: rows.map((r) => Math.max(0, r.open - r.overdue - r.dueSoon)),
              },
            ],
          }}
        />
      </Card>
    </div>
  );
}

function OverlapCard({ data, loading, className }: CardProps) {
  const open = useInsightList((s) => s.open);
  const pulls = data?.overlap.pulls ?? [];
  const shared = data?.overlap.shared ?? [];
  return (
    <div className={className}>
      <Card
        title="Projects pulling people away"
        info="People with open work in two or more projects. A project 'pulls' someone when it takes 70 % or more of their actions in the period while their tasks in another project go overdue: the cause behind many delays."
        loading={loading}
        empty={!!data && !shared.length}
        emptyText="Nobody is split across projects right now."
      >
        {pulls.length > 0 && (
          <ul className="mb-4 space-y-2">
            {pulls.map((p) => (
              <li key={`${p.pulling}-${p.suffering}`}>
                <button
                  type="button"
                  onClick={() =>
                    open(
                      `${p.sufferingName} · overdue while ${p.pullingName} takes the time`,
                      p.overdueIds,
                    )
                  }
                  className="flex w-full flex-wrap items-center gap-2 rounded-card border border-bad/40 bg-bad/5 p-3 text-left hover:border-bad"
                >
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 font-heading text-button text-primary">
                    {p.pullingName}
                  </span>
                  <span className="text-text-muted">is taking the time of</span>
                  <span className="font-heading text-button text-primary-dark">
                    {p.peopleNames.join(', ')}
                  </span>
                  <span className="text-text-muted">while</span>
                  <span className="rounded-full bg-bad/15 px-2 py-0.5 font-heading text-button text-bad">
                    {p.sufferingName}
                  </span>
                  <span className="text-text-muted">
                    has {p.overdueIds.length} of their tasks overdue
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="nural-table-wrap overflow-x-auto">
          <table className="nural-table w-full border-separate border-spacing-0 text-table [&_td]:px-3 [&_th]:px-3">
            <thead>
              <tr className="text-left font-heading text-label uppercase text-text-muted">
                <th className="py-2 pr-3">Person</th>
                <th className="py-2">Projects (open · overdue · actions in the period)</th>
              </tr>
            </thead>
            <tbody>
              {shared.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 pr-3 font-heading text-button text-primary-dark">{s.name}</td>
                  <td className="py-2">
                    <span className="flex flex-wrap gap-1.5">
                      {s.projects.map((p) => (
                        <span
                          key={p.id}
                          className={clsx(
                            'rounded-lg px-2 py-0.5',
                            p.overdue ? 'bg-bad/10' : 'bg-primary-soft-100',
                          )}
                        >
                          <b className="font-heading">{p.name}</b> {p.open} ·{' '}
                          <span className={clsx(p.overdue && 'font-bold text-bad')}>
                            {p.overdue}
                          </span>{' '}
                          · {p.activity}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const RISK = {
  high: 'bg-bad/15 text-bad',
  medium: 'bg-warn/15 text-warn',
  low: 'bg-good/15 text-good',
} as const;

function ReleasesCard({ data, loading, className }: CardProps) {
  const [, openTask] = useOpenTask();
  const rows = data?.releases ?? [];
  return (
    <div className={className}>
      <Card
        title="Release plan: this week and next"
        info="Open tasks due this week and next, by their planned completion date (deadline), with the risk of slipping: high if overdue or not started within 2 working days of the date, medium if still in progress, low if waiting for QA."
        loading={loading}
        empty={!!data && !rows.length}
        emptyText="Nothing due this week or next."
      >
        <div className="nural-table-wrap max-h-[420px] overflow-auto">
          <table className="nural-table w-full border-separate border-spacing-0 text-table [&_td]:px-3 [&_th]:px-3">
            <thead className="sticky top-0">
              <tr className="text-left font-heading text-label uppercase text-text-muted">
                <th className="py-2 pr-2">Week</th>
                <th className="py-2 pr-2">Task</th>
                <th className="py-2 pr-2">Project</th>
                <th className="py-2 pr-2">Assignee</th>
                <th className="py-2 pr-2">Planned</th>
                <th className="py-2 pr-2">Stage</th>
                <th className="py-2">Risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => void openTask(r.id)}
                  className="cursor-pointer border-t border-border hover:bg-primary-soft-100"
                >
                  <td className="py-2 pr-2 text-text-muted">
                    {r.week === 'this' ? 'This week' : 'Next week'}
                  </td>
                  <td className="py-2 pr-2 font-heading text-button text-primary-dark">
                    {r.title}
                  </td>
                  <td className="py-2 pr-2">{r.project}</td>
                  <td className="py-2 pr-2">{r.assignee}</td>
                  <td className="py-2 pr-2 tabular-nums">{fmtDate(r.deadline)}</td>
                  <td className="py-2 pr-2">{r.stage ?? '—'}</td>
                  <td className="py-2" title={r.reason}>
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 font-heading text-label font-bold uppercase',
                        RISK[r.risk],
                      )}
                    >
                      {r.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AbsenceCard({ data, className }: { data?: Insights; className?: string }) {
  return (
    <div className={className}>
      <Card
        title="Leave and attendance"
        info="Planned and urgent leave, late arrivals and early leaving from Infowan, and which tasks and projects they put at risk."
      >
        {data?.absences ? null : (
          <p className="text-text-muted">
            Infowan is not connected yet, so these insights use Bitrix24 and dashboard data only.
            Once it is connected, leave and attendance show here with the tasks and projects they
            put at risk.
          </p>
        )}
      </Card>
    </div>
  );
}

/** The projects or people behind a tile, each with why it counts; a row opens its tasks. */
function EntityTable({
  list,
  onPick,
}: {
  list: EntityList;
  onPick: (e: EntityList['rows'][number]) => void;
}) {
  if (!list.rows.length)
    return <p className="py-6 text-center text-text-muted">Nobody here right now.</p>;
  const heads = list.rows[0]!.stats.map(([h]) => h);
  return (
    <div className="nural-table-wrap overflow-auto">
      <table className="nural-table w-full border-separate border-spacing-0 text-table [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
        <thead>
          <tr className="text-left font-heading text-label uppercase">
            <th>{list.kind === 'project' ? 'Project' : 'Person'}</th>
            <th>Why</th>
            {heads.map((h) => (
              <th key={h} className="text-center">
                {h}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {list.rows.map((e) => (
            <tr key={`${e.id}-${e.name}`} className="cursor-pointer" onClick={() => onPick(e)}>
              <td className="font-heading font-bold text-primary-dark">{e.name}</td>
              <td className="text-text">{e.reason}</td>
              {e.stats.map(([h, n]) => (
                <td key={h} className="text-center tabular-nums">
                  {n.toLocaleString('en-IN')}
                </td>
              ))}
              <td className="whitespace-nowrap text-right">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-heading text-label font-bold text-primary">
                  {e.ids.length} task{e.ids.length === 1 ? '' : 's'} ›
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.total > list.rows.length && (
        <p className="px-3 py-2 text-table text-text-muted">
          The {list.rows.length} most important of {list.total}.
        </p>
      )}
    </div>
  );
}
