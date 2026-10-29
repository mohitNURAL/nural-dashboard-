// Daily update data (apps/api/src/routes/daily.ts, SRS 23): today's plan and wrap-up, the
// person's own tasks to add, their projects, history, and the channel setting (Connections).
import { useQueryClient } from '@tanstack/react-query';
import type { DailyItem, DailyState, WrapItem } from '@nural/shared';
import type { BoardStage, TaskRow } from '../../api/types';
import { apiPost } from '../../api/client';
import { API_KEY, useApi } from '../../api/queries';

export type { DailyItem, DailyState, WrapItem };

export interface DailyPlan {
  items: DailyItem[];
  note: string;
}
export interface DailyWrap {
  items: WrapItem[];
  note: string;
}

export interface DailyToday {
  day: string;
  /** "Wed 14 Oct". */
  dayLabel: string;
  working: boolean;
  /** Minutes after local midnight now, and from when the wrap-up reminder shows. */
  nowMin: number;
  wrapFromMin: number;
  plan: DailyPlan | null;
  plannedAt: string | null;
  /** The plan was first posted after planBy ("11:30"): Late planned (2026-10-22). */
  late: boolean;
  planBy: string;
  wrap: DailyWrap | null;
  wrappedAt: string | null;
  posted: boolean;
  /** The previous planned day was not wrapped up (2026-10-23): an alert, planning goes on. */
  missedWrap: { day: string; dayLabel: string; planned: number } | null;
  suggestions: DailyItem[];
  /** Open tasks due after today, soonest first (to take on early or report done ahead). */
  upcoming: DailyItem[];
  /** Open tasks with no deadline; posting the plan sets theirs to today (2026-10-21). */
  noDeadline: DailyItem[];
  wrapItems: WrapItem[];
  /** Their tasks assigned or changed after the plan, not on it (2026-10-29): add in the wrap-up. */
  newSince: WrapItem[];
  /** Every listed task as the task lists show it (edited in place), by id. */
  rows: Record<string, TaskRow>;
  /** Each listed task's Daily state now: pending, WIP, done or on hold. */
  states: Record<string, DailyState>;
  /** The Kanban columns of their projects, for the stage editor. */
  boards: Record<string, BoardStage[]>;
  channel: string | null;
  slack: boolean;
  /** Signed in with Bitrix24: Done and new tasks reach Bitrix24. */
  canWrite: boolean;
}

export interface MyTask {
  id: number;
  title: string;
  project: string;
  deadline: string | null;
}

export interface PostResult {
  ok: true;
  posted: boolean;
  reason?: string;
  failures?: { title: string; message: string }[];
}

/** Polled and refreshed on focus, so a tab left open overnight moves to the new day (2026-10-23). */
export const useDailyToday = (enabled = true) =>
  useApi<DailyToday>('/api/daily/today', {}, { enabled, refetchInterval: 5 * 60_000 });
export const useMyOpenTasks = (q: string, enabled = true) =>
  useApi<{ tasks: MyTask[] }>('/api/daily/mine', { q }, { enabled });
export const useMyProjects = (enabled = true) =>
  useApi<{ projects: { id: number; name: string }[] }>('/api/daily/projects', {}, { enabled });
export const useDailyHistory = () =>
  useApi<{
    rows: {
      day: string;
      plan: DailyPlan | null;
      wrap: DailyWrap | null;
      plannedAt: string | null;
      wrappedAt: string | null;
    }[];
  }>('/api/daily/history', {});
export const useDailyChannel = (enabled = true) =>
  useApi<{ channel: string | null }>('/api/integrations/daily-channel', {}, { enabled });

/**
 * Posts and refreshes every daily view (and the task pages, as tasks may have changed). "add"
 * adds tasks to the plan posted earlier today (2026-10-22); "reset" clears a plan saved but not
 * posted to Slack, to plan again (2026-10-23).
 */
export function useDailyPost() {
  const qc = useQueryClient();
  return async (kind: 'plan' | 'wrap' | 'add' | 'reset', body: unknown) => {
    const r = await apiPost<PostResult>(
      kind === 'add' || kind === 'reset' ? `/api/daily/plan/${kind}` : `/api/daily/${kind}`,
      body,
    );
    await qc.invalidateQueries({ queryKey: [API_KEY] });
    return r;
  };
}
