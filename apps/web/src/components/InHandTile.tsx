// Tasks in hand (2026-10-12): open tasks with the deadline ahead, split by when they are planned.
// The same tile on KPI, Development and QA; each tab passes its own counts and opens its own list.
import type { DueWindow } from '@nural/shared';
import { useState } from 'react';
import { DUE_TEXT as DUE_LABEL } from './dueText';
import { InHandCalendarDialog, type InHandCalendarSource } from './InHandCalendar';
import { StatTile } from './StatTile';

// Week first, then month (2026-10-15).
const PARTS = ['tomorrow', 'restWeek', 'nextWeek', 'restMonth', 'nextMonth'] as const;

export function InHandTile({
  counts,
  info,
  onOpen,
  active,
  calendar,
}: {
  /** The tile opens the planner (2026-10-20); its parts still open their lists. */
  calendar?: InHandCalendarSource;
  /** Its list is the one open below (the tile stays highlighted, like the others). */
  active?: boolean;
  counts: Record<DueWindow, number> | undefined;
  info: string;
  /** Opens the tab's list of these tasks, narrowed to one window. */
  onOpen: (w: DueWindow, label: string) => void;
}) {
  const [planner, setPlanner] = useState(false);
  return (
    <>
      <StatTile
        label="Tasks in hand"
        info={info}
        value={counts?.ahead}
        active={active}
        onClick={() => (calendar ? setPlanner(true) : onOpen('ahead', 'Tasks in hand'))}
        parts={
          counts &&
          PARTS.map((w) => ({
            label: DUE_LABEL[w],
            value: counts[w],
            onClick: () => onOpen(w, `Tasks in hand · ${DUE_LABEL[w]}`),
          }))
        }
      />
      {planner && calendar && (
        <InHandCalendarDialog source={calendar} onClose={() => setPlanner(false)} />
      )}
    </>
  );
}
