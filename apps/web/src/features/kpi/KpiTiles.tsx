// KPI-01 headline tiles: projects (first; the Development tile's rule, all departments), open, overdue, closed, on-time %, no deadline.
// Every number opens the tasks behind it.
import { SortableGroup } from '../../components/layout/SortableGroup';
import { InHandTile } from '../../components/InHandTile';
import { StatTile } from '../../components/StatTile';
import { useKpiControls } from '../filters/useFilters';
import { useKpiSummary } from './api';
import { KPI_INFO } from './info';
import { useKpiList, useOpenKpiList } from './kpiList';
import { PERIOD_WORDS } from './format';
import type { ProjectShow } from './projectShow';

export function KpiTiles({
  onProjects,
  onOverdue,
}: {
  onProjects: (show: ProjectShow) => void;
  /** Brings the Overdue card into view; false when it is hidden (Customise). */
  onOverdue: () => boolean;
}) {
  const { data: s } = useKpiSummary();
  const { period } = useKpiControls();
  const open = useOpenKpiList();
  const shown = useKpiList((st) => st.list.label);
  const words = PERIOD_WORDS[period];
  const list = (label: string, params: Record<string, string>, info: string) =>
    open({ label, params, info });

  return (
    <SortableGroup
      group="kpi.tiles"
      noun="tile"
      className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      items={[
        {
          id: 'active',
          node: (
            <StatTile
              label="Projects"
              value={s?.projectWork.projects}
              sub="Active + silent + hold"
              info={KPI_INFO.active}
              onClick={() => onProjects('all')}
              parts={
                s && [
                  {
                    label: 'Active',
                    value: s.projectWork.active,
                    onClick: () => onProjects('active'),
                  },
                  {
                    label: 'Silent',
                    value: s.projectWork.silent,
                    onClick: () => onProjects('silent'),
                  },
                  { label: 'Hold', value: s.projectWork.hold, onClick: () => onProjects('hold') },
                ]
              }
            />
          ),
        },
        {
          id: 'open',
          node: (
            <StatTile
              label="Open tasks"
              value={s?.open}
              info={KPI_INFO.open}
              onClick={() => list('Open', { kpi: 'open' }, KPI_INFO.open)}
              note={
                s?.unassigned.ids.length
                  ? {
                      label: 'Unassigned',
                      value: s.unassigned.count,
                      onClick: () =>
                        list(
                          'Open · Unassigned',
                          { kpi: 'open', assignee: s.unassigned.ids.join(',') },
                          KPI_INFO.open,
                        ),
                    }
                  : undefined
              }
              parts={
                s && [
                  {
                    label: 'Dev',
                    value: s.openByDept.dev,
                    onClick: () =>
                      list('Open · Development', { kpi: 'open', dept: 'dev' }, KPI_INFO.open),
                  },
                  {
                    label: 'QA',
                    value: s.openByDept.qa,
                    onClick: () => list('Open · QA', { kpi: 'open', dept: 'qa' }, KPI_INFO.open),
                  },
                  {
                    label: 'Support',
                    value: s.openByDept.support,
                    onClick: () =>
                      list('Open · Support', { kpi: 'open', dept: 'support' }, KPI_INFO.open),
                  },
                ]
              }
            />
          ),
        },
        {
          id: 'hold',
          node: (
            <StatTile
              label="On hold"
              value={s?.hold}
              info={KPI_INFO.hold}
              sub="Neither open nor closed"
              onClick={() => list('On hold', { kpi: 'hold' }, KPI_INFO.hold)}
            />
          ),
        },
        {
          id: 'overdue',
          node: (
            <StatTile
              label="Overdue"
              value={s?.overdue}
              tone="bad"
              info={KPI_INFO.overdue}
              sub={s && `${s.overduePct} % of open`}
              // The Overdue card below (by days late, project and person); its list if hidden.
              onClick={() => onOverdue() || list('Overdue', { kpi: 'overdue' }, KPI_INFO.overdue)}
              parts={
                s && [
                  {
                    label: 'Over 30 days',
                    value: s.overdueOver30,
                    onClick: () =>
                      list(
                        'Overdue · over 30 days',
                        { kpi: 'overdue', kpiAgeing: '30+' },
                        KPI_INFO.overdue,
                      ),
                  },
                ]
              }
            />
          ),
        },
        {
          id: 'closed',
          node: (
            <StatTile
              label={`Closed ${words.now.toLowerCase()}`}
              value={s?.closed}
              info={KPI_INFO.closed}
              sub={
                s &&
                `${words.prev}: ${s.closedPrev.toLocaleString('en-IN')}${trend(s.closed, s.closedPrev)}`
              }
              onClick={() =>
                list(`Closed ${words.now.toLowerCase()}`, { kpi: 'closed' }, KPI_INFO.closed)
              }
            />
          ),
        },
        {
          id: 'onTime',
          node: (
            <StatTile
              label="On-time"
              value={s && (s.onTimePct === null ? '—' : `${s.onTimePct} %`)}
              info={KPI_INFO.onTime}
              sub={s && `${words.prev}: ${s.onTimePrevPct === null ? '—' : `${s.onTimePrevPct} %`}`}
              onClick={() =>
                list(`Closed ${words.now.toLowerCase()}`, { kpi: 'closed' }, KPI_INFO.onTime)
              }
            />
          ),
        },
        {
          id: 'inHand',
          node: (
            <InHandTile
              counts={s?.inHand}
              info={KPI_INFO.inHand}
              active={!!shown?.startsWith('Tasks in hand')}
              onOpen={(w, label) => list(label, { kpi: 'open', due: w }, KPI_INFO.inHand)}
            />
          ),
        },
        {
          id: 'noDeadline',
          node: (
            <StatTile
              label="No deadline"
              value={s?.noDeadline}
              info={KPI_INFO.noDeadline}
              sub="Open tasks without a deadline"
              onClick={() => list('Open, no deadline', { kpi: 'noDeadline' }, KPI_INFO.noDeadline)}
            />
          ),
        },
      ]}
    />
  );
}

/** " ▲ 12" / " ▼ 5" against the previous period. */
const trend = (now: number, prev: number) =>
  now === prev ? '' : now > prev ? ` · ▲ ${now - prev}` : ` · ▼ ${prev - now}`;
