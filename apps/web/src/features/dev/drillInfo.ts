// The "i" text of "All tasks" when a count was clicked: which rule picks these tasks.
import { INFO } from '../info';
import type { Drill } from './drill';

const PRESET_RULE: Record<Drill['preset'], string> = {
  total: '',
  completed: INFO.colDone,
  pending: INFO.pending,
  ready: INFO.ready,
  deployed: INFO.deployed,
  overdue: INFO.overdue,
  doneToday: INFO.doneToday,
  dueToday: INFO.dueToday,
};

const AGEING: Record<string, string> = {
  notDue: 'Open, deadline not yet reached.',
  '0-2': 'Open, 0 to 2 days past deadline.',
  '3-7': 'Open, 3 to 7 days past deadline.',
  '8-14': 'Open, 8 to 14 days past deadline.',
  '15-30': 'Open, 15 to 30 days past deadline.',
  '30+': 'Open, over 30 days past deadline.',
  noDeadline: 'Open, no deadline.',
};

/** E.g. "Umang Singh · Pending: In To do, In progress, … or Pending for QA." */
export function drillInfo(d: Drill | null, stuckDays = 5): string {
  if (!d) return INFO.allTasks;
  const p = d.params ?? {};
  const rules = [
    p.ranked ? 'Sent to QA with a deadline (speed ranking).' : PRESET_RULE[d.preset],
    p.stage && `In ${p.stage.split(',').join(', ')}.`,
    p.overdue === 'true' && 'Overdue only.',
    p.overdue === 'false' && 'Not overdue.',
    p.ageing && AGEING[p.ageing],
    p.stuck && `More than ${stuckDays} days in their current stage.`,
    p.owner && 'Person = assignee, or the tester / QA lead in QA Backlog and In QA.',
    p.type && (p.type === 'bug' ? 'Bugs only.' : 'Feedback only.'),
    p.scope === 'dev' && 'Dev tasks only.',
    p.scope === 'issues' && 'Issues only.',
  ].filter(Boolean);
  return `${d.label}: ${rules.join(' ') || 'every task.'}`;
}
