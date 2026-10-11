// KPI-01 headline tiles: open, overdue, closed, on-time %, active projects, no deadline.
// Every number opens the tasks behind it.
import { StatTile } from '../../components/StatTile';
import { useKpiControls } from '../filters/useFilters';
import { useKpiSummary } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';
import { PERIOD_WORDS } from './format';

export function KpiTiles({ onProjects }: { onProjects: () => void }) {
  const { data: s } = useKpiSummary();
  const { period } = useKpiControls();
  const open = useOpenKpiList();
  const words = PERIOD_WORDS[period];
  const list = (label: string, params: Record<string, string>, info: string) =>
    open({ label, params, info });

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <StatTile
        label="Open tasks"
        value={s?.open}
        info={KPI_INFO.open}
        onClick={() => list('Open', { kpi: 'open' }, KPI_INFO.open)}
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
      <StatTile
        label="On hold"
        value={s?.hold}
        info={KPI_INFO.hold}
        sub="Neither open nor closed"
        onClick={() => list('On hold', { kpi: 'hold' }, KPI_INFO.hold)}
      />
      <StatTile
        label="Overdue"
        value={s?.overdue}
        tone="bad"
        info={KPI_INFO.overdue}
        sub={s && `${s.overduePct} % of open`}
        onClick={() => list('Overdue', { kpi: 'overdue' }, KPI_INFO.overdue)}
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
      <StatTile
        label="On-time"
        value={s && (s.onTimePct === null ? '—' : `${s.onTimePct} %`)}
        info={KPI_INFO.onTime}
        sub={s && `${words.prev}: ${s.onTimePrevPct === null ? '—' : `${s.onTimePrevPct} %`}`}
        onClick={() =>
          list(`Closed ${words.now.toLowerCase()}`, { kpi: 'closed' }, KPI_INFO.onTime)
        }
      />
      <StatTile
        label="Active projects"
        value={s?.activeProjects}
        info={KPI_INFO.active}
        onClick={onProjects}
        parts={
          s && [
            {
              label: 'Silent',
              value: s.silentProjects,
              onClick: () =>
                list('Open tasks in silent projects', { kpi: 'silent' }, KPI_INFO.active),
            },
          ]
        }
      />
      <StatTile
        label="No deadline"
        value={s?.noDeadline}
        info={KPI_INFO.noDeadline}
        sub="Open tasks without a deadline"
        onClick={() => list('Open, no deadline', { kpi: 'noDeadline' }, KPI_INFO.noDeadline)}
      />
    </div>
  );
}

/** " ▲ 12" / " ▼ 5" against the previous period. */
const trend = (now: number, prev: number) =>
  now === prev ? '' : now > prev ? ` · ▲ ${now - prev}` : ` · ▼ ${prev - now}`;
