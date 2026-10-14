// Daily update data (apps/api/src/routes/daily.ts, SRS 23): today's plan and wrap-up, the
// person's own tasks to add, their projects, history, and the channel setting (Connections).
import { useQueryClient } from '@tanstack/react-query';
import type { DailyItem, WrapItem } from '@nural/shared';
import { apiPost } from '../../api/client';
import { API_KEY, useApi } from '../../api/queries';

export type { DailyItem, WrapItem };

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
  wrap: DailyWrap | null;
  wrappedAt: string | null;
  posted: boolean;
  suggestions: DailyItem[];
  wrapItems: WrapItem[];
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

export const useDailyToday = (enabled = true) =>
  useApi<DailyToday>('/api/daily/today', {}, { enabled });
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

/** Posts and refreshes every daily view (and the task pages, as tasks may have changed). */
export function useDailyPost() {
  const qc = useQueryClient();
  return async (kind: 'plan' | 'wrap', body: unknown) => {
    const r = await apiPost<PostResult>(`/api/daily/${kind}`, body);
    await qc.invalidateQueries({ queryKey: [API_KEY] });
    return r;
  };
}
