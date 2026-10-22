// Shapes of GET /api/report/daily (apps/api/src/routes/dailyReport.ts, SRS 24).
import type { DailyState } from '@nural/shared';

export interface ReportTask {
  taskId: number;
  title: string;
  project: string;
  planned: boolean;
  why: string | null;
  reported: DailyState | null;
  now: DailyState | null;
  stage: string | null;
  status: string | null;
  priority: string | null;
  tags: string[];
  deadline: string | null;
  moves: { from: string | null; to: string | null; at: string }[];
}

export interface ReportLine {
  userId: number;
  name: string;
  dept: 'dev' | 'qa' | 'support' | 'ba' | 'other';
  day: string;
  plannedAt: string | null;
  /** First posted after the check-in time (11:30): Late planned (2026-10-22). */
  late?: boolean;
  wrappedAt: string | null;
  planned: number;
  added: number;
  done: number;
  wip: number;
  pending: number;
  hold: number;
  planNote: string;
  wrapNote: string;
  tasks: ReportTask[];
}

export interface DailyReport {
  /** "HH:MM": a plan first posted after it is Late planned. */
  planBy?: string;
  from: string;
  to: string;
  days: string[];
  /** The day the tiles describe (the last working day in the range). */
  day: string;
  /** Full data scope: everyone expected; otherwise only the person's own days. */
  full: boolean;
  summary: {
    expected: number;
    planned: { id: number; name: string }[];
    notPlanned: { id: number; name: string }[];
    wrapped: { id: number; name: string }[];
    notWrapped: { id: number; name: string }[];
  };
  people: { id: number; name: string }[];
  lines: ReportLine[];
}
