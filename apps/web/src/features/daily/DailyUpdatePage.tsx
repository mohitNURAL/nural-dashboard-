// My work › Daily update (2026-10-14, SRS 23): today's plan and wrap-up, buttons to open them,
// and the person's last 30 days. Only their own updates; the team sees them in Slack.
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Card } from '../../components/Card';
import { DataTable } from '../../components/DataTable';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import { IconDaily } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { useDailyHistory, useDailyToday, type DailyPlan, type DailyWrap } from './api';
import { useDailyDialog } from './store';

interface HistoryRow {
  day: string;
  planned: number;
  done: number;
  wip: number;
  extra: number;
  note: string;
}
const col = createColumnHelper<HistoryRow>();

const countsOf = (plan: DailyPlan | null, wrap: DailyWrap | null) => ({
  planned: plan?.items.length ?? 0,
  done: wrap?.items.filter((i) => i.state === 'done').length ?? 0,
  wip: wrap?.items.filter((i) => i.state === 'wip').length ?? 0,
  extra: wrap?.items.filter((i) => i.extra).length ?? 0,
});

const btn =
  'h-9 rounded-control border border-border px-3 font-heading text-button text-text-muted hover:border-primary hover:text-primary';
const mainBtn =
  'h-9 rounded-control bg-gradient-to-r from-primary to-accent px-3 font-heading text-button text-white shadow-sm hover:brightness-110';

export function DailyUpdatePage() {
  const { data: today } = useDailyToday();
  const { data: history } = useDailyHistory();
  const open = useDailyDialog((s) => s.open);
  const c = countsOf(today?.plan ?? null, today?.wrap ?? null);
  const rows: HistoryRow[] = (history?.rows ?? []).map((r) => ({
    day: r.day,
    ...countsOf(r.plan, r.wrap),
    note: [r.plan?.note, r.wrap?.note].filter(Boolean).join(' · '),
  }));
  const columns = useMemo(
    () => [
      col.accessor('day', { header: 'Day' }),
      col.accessor('planned', { header: 'Planned', meta: { align: 'right' } }),
      col.accessor('done', { header: 'Done', meta: { align: 'right' } }),
      col.accessor('wip', { header: 'WIP', meta: { align: 'right' } }),
      col.accessor('extra', { header: 'Outside the plan', meta: { align: 'right' } }),
      col.accessor('note', { header: 'Notes', enableSorting: false }),
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHead
        title="Daily update"
        sub="Plan your day in the morning, wrap it up in the evening; both go to the team on Slack"
        icon={<IconDaily size={24} />}
      >
        <button type="button" className={btn} data-tour="daily-plan" onClick={() => open('plan')}>
          {today?.plan ? 'Change my plan' : 'Plan my day'}
        </button>
        <button
          type="button"
          className={mainBtn}
          data-tour="daily-wrap"
          onClick={() => open('wrap')}
        >
          {today?.wrap ? 'Change my wrap-up' : 'Wrap up my day'}
        </button>
      </PageHead>
      <SortableGroup
        group="daily.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          {
            id: 'planned',
            node: (
              <StatTile
                label="Planned today"
                info="Tasks on the plan you posted this morning."
                value={today ? c.planned : undefined}
                sub={today?.plan ? 'Posted' : 'Not posted yet'}
              />
            ),
          },
          {
            id: 'done',
            node: (
              <StatTile
                label="Done"
                info="From your wrap-up: tasks completed or sent to QA today."
                value={today ? c.done : undefined}
                sub={today?.wrap ? 'Wrapped up' : 'Wrap-up not posted'}
              />
            ),
          },
          {
            id: 'wip',
            node: (
              <StatTile
                label="WIP"
                info="From your wrap-up: planned tasks still in progress."
                value={today ? c.wip : undefined}
                sub="Carry on tomorrow"
              />
            ),
          },
          {
            id: 'extra',
            node: (
              <StatTile
                label="Outside the plan"
                info="Work you added in the wrap-up; each became a Bitrix24 task assigned to you."
                value={today ? c.extra : undefined}
                sub="Added today"
              />
            ),
          },
          {
            id: 'streak',
            node: (
              <StatTile
                label="Days posted"
                info="Days in the last 30 with a plan or a wrap-up."
                value={
                  history ? rows.filter((r) => r.planned || r.done || r.wip).length : undefined
                }
                sub="Last 30 days"
              />
            ),
          },
        ]}
      />
      <SortableGroup
        group="daily.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        items={[
          {
            id: 'history',
            className: 'xl:col-span-12',
            node: (
              <Card
                title="My last 30 days"
                info="Each day's plan and wrap-up as posted to the team."
                loading={!history}
                empty={!!history && !rows.length}
                emptyText="No daily updates yet. Plan your day to start."
              >
                <DataTable
                  tableId="daily-history"
                  columns={columns}
                  data={rows}
                  rowKey={(r) => r.day}
                  initialSorting={[{ id: 'day', desc: true }]}
                  maxHeight={480}
                  dense
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
