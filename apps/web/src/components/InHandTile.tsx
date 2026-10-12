// Tasks in hand (2026-10-12): open tasks with the deadline ahead, split by when they are planned.
// The same tile on KPI, Development and QA; each tab passes its own counts and opens its own list.
import type { DueWindow } from '@nural/shared';
import { StatTile } from './StatTile';

const DUE_LABEL: Record<DueWindow, string> = {
  ahead: 'Deadline ahead',
  tomorrow: 'Tomorrow',
  restWeek: 'Rest of week',
  restMonth: 'Rest of month',
  nextWeek: 'Next week',
  nextMonth: 'Next month',
};

const PARTS = ['tomorrow', 'restWeek', 'restMonth', 'nextWeek', 'nextMonth'] as const;

export function InHandTile({
  counts,
  info,
  onOpen,
}: {
  counts: Record<DueWindow, number> | undefined;
  info: string;
  /** Opens the tab's list of these tasks, narrowed to one window. */
  onOpen: (w: DueWindow, label: string) => void;
}) {
  return (
    <StatTile
      label="Tasks in hand"
      info={info}
      value={counts?.ahead}
      onClick={() => onOpen('ahead', 'Tasks in hand')}
      parts={
        counts &&
        PARTS.map((w) => ({
          label: DUE_LABEL[w],
          value: counts[w],
          onClick: () => onOpen(w, `Tasks in hand · ${DUE_LABEL[w]}`),
        }))
      }
    />
  );
}
