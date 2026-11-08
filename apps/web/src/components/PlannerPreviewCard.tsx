// Planner preview (2026-11-08, SRS 25): the Tasks in hand planner's week on the dashboard itself,
// without opening anything. Day view, Short (one line a task), one row per person or project, the
// week moved with ‹ ›, and the grid drags sideways with the mouse. A task opens the planner on its
// plan log; "Open planner" opens it on this week (Full view, Week and Month, the files). The same
// card on KPI, Development and QA, with the tab's filters and planner endpoint.
import { shiftStart, type GroupBy } from '@nural/shared';
import { useState } from 'react';
import { useApi } from '../api/queries';
import type { PlannerGrid } from '../api/types';
import { periodLabel } from './calendarHeading';
import { Card, GroupToggle } from './Card';
import { InHandCalendarDialog, type InHandCalendarSource } from './InHandCalendar';
import { usePlanner, usePlannerState, type PlannerFocus } from './plannerStore';
import { SUB } from './plannerLook';
import { PlannerTable } from './PlannerTable';
import { useDragPan } from './useDragPan';

export function PlannerPreviewCard({
  source,
  info,
  className,
}: {
  source: InHandCalendarSource;
  info: string;
  className?: string;
}) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const [start, setStart] = useState<string | null>(null);
  // The same request as the planner's Day view, so opening it is instant.
  const { data, isLoading, isFetching } = useApi<PlannerGrid>(source.path, {
    ...source.params,
    groupBy: by,
    view: 'day',
    ...(start ? { start } : {}),
  });
  const planner = usePlanner();
  const st = usePlannerState();
  const scroller = useDragPan<HTMLDivElement>();

  /** Opens the planner on this week, grouped the same way, on a task or a row if given. */
  const open = (focus?: PlannerFocus) => {
    st.openWeek(start, by);
    planner.show(focus, 'preview');
  };

  const nav =
    'grid h-8 w-8 place-items-center rounded-control text-lg text-primary hover:bg-primary-soft-100';
  return (
    <>
      <Card
        title="Planner this week"
        info={info}
        loading={isLoading}
        empty={!!data && data.rows.length === 0}
        emptyText="Nothing planned this week."
        className={className}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <GroupToggle value={by} onChange={setBy} />
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous week"
                onClick={() => data && setStart(shiftStart('day', data.start, -1))}
                className={nav}
              >
                ‹
              </button>
              <span className="min-w-[9.5rem] text-center font-heading text-label font-bold text-primary-dark">
                {data ? periodLabel('day', data.columns) : ''}
              </span>
              <button
                type="button"
                aria-label="Next week"
                onClick={() => data && setStart(shiftStart('day', data.start, 1))}
                className={nav}
              >
                ›
              </button>
              {start && (
                <button
                  type="button"
                  onClick={() => setStart(null)}
                  className="btn btn-stroke h-8 px-2.5"
                >
                  This week
                </button>
              )}
            </span>
            <button type="button" onClick={() => open()} className="btn btn-card h-8 px-3">
              Open planner
            </button>
          </span>
        }
      >
        {data && (
          <>
            <div
              ref={scroller}
              className={
                'max-h-[460px] cursor-grab overflow-auto rounded-lg border border-border' +
                (isFetching ? ' opacity-70' : '')
              }
            >
              <PlannerTable
                data={data}
                density="short"
                compact
                onTask={(id) => open({ type: 'task', id })}
                onOverdue={(r) => open({ type: 'overdue', row: r.id, name: r.name })}
              />
            </div>
            <p className={`mt-2 text-[12px] ${SUB}`}>
              {data.totals.open} open, {data.totals.overdueNow} overdue now. Hover a task for its
              details, click it for its plan log; Open planner for the Full view, past weeks, Week
              and Month, Excel and PDF.
            </p>
          </>
        )}
      </Card>
      {planner.open && planner.from === 'preview' && (
        <InHandCalendarDialog source={source} onClose={planner.close} />
      )}
    </>
  );
}
