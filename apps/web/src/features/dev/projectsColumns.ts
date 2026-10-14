// The columns of Projects at work (2026-10-14): id, name (Done, Overdue and Spill follow the Day /
// Week / Month switch), the "i" text and the task list a count opens. The reader picks, hides and
// orders them (Columns menu, header drag), saved per person under the table id below.
import type { DevPreset } from '@nural/shared';
import type { WorkCounts } from '../../api/types';
import type { ProjectPeriod } from './projectsPopup';

export const PROJECTS_TABLE_ID = 'dev-projects-at-work';

export type CountKey = 'open' | 'noDeadline' | 'done' | 'overdue' | 'spill';
export type ProjectColumnId = 'activity' | 'deadline' | CountKey;

export interface ProjectColumn {
  id: ProjectColumnId;
  label: string;
  info: string;
  /** A count column: opens this task list (with `period` when it follows the switch). */
  preset?: DevPreset;
  period?: boolean;
  tone?: 'bad';
}

export const PROJECT_COLUMN_IDS: ProjectColumnId[] = [
  'activity',
  'deadline',
  'open',
  'noDeadline',
  'done',
  'overdue',
  'spill',
];

export function projectColumns(p: ProjectPeriod): Record<ProjectColumnId, ProjectColumn> {
  const w = p;
  const now = p === 'day' ? 'today' : `this ${w}`;
  return {
    activity: {
      id: 'activity',
      label: 'Activity (7 d)',
      info: 'Tasks touched (changed in Bitrix24 or moved between stages) in the last 7 days; bulk changes (10+ tasks of a project in one minute) left out. Projects are sorted by it, then by the earliest deadline.',
    },
    deadline: {
      id: 'deadline',
      label: 'Deadline',
      info: "The project's deadline: the latest deadline of its tasks. On a person's line, their own last deadline in the project.",
    },
    open: {
      id: 'open',
      label: 'Open',
      info: 'Pending tasks: behind QA Backlog and not on hold. Hover a count for dev tasks and issues; click it for the tasks.',
      preset: 'pending',
    },
    noDeadline: {
      id: 'noDeadline',
      label: 'No deadline',
      info: 'Open (pending) tasks with no deadline set in Bitrix24.',
      preset: 'noDeadline',
      tone: 'bad',
    },
    done: {
      id: 'done',
      label: `Done prev ${w}`,
      info: `Pushed to QA Backlog in the previous ${w} (IST, weeks Monday to Sunday).`,
      preset: 'donePrev',
      period: true,
    },
    overdue: {
      id: 'overdue',
      label: `Overdue ${now}`,
      info: `Pending, not on hold, the deadline has passed and it fell ${now} (IST).`,
      preset: 'overduePeriod',
      period: true,
      tone: 'bad',
    },
    spill: {
      id: 'spill',
      label: `Spill of prev ${w}`,
      info: `The deadline was in the previous ${w} and the task was not pushed to QA Backlog by its end (still pending or on hold, or completed later).`,
      preset: 'spill',
      period: true,
      tone: 'bad',
    },
  };
}

/** A count of one column for a project or person line, and how many of it are issues. */
export const countOf = (w: WorkCounts, k: CountKey) => ({ n: w[k], issues: w.issues[k] });
