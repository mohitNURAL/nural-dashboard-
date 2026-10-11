// GET /api/alerts: the header bell. Overdue tasks per assignee and project, and tasks stuck more
// than STUCK_DAYS days in a stage (LIVE aside), for the Development department's tasks and
// issues. Work stuck in QA Backlog or In QA names the tester who filed it, or the QA lead.
// The filter bar does not apply: the bell shows the whole picture.
import { alerts, boardStageCount, devTasks, PENDING_STAGES, STUCK_DAYS } from '@nural/shared';
import type { FastifyInstance } from 'fastify';
import type { RequestDataset } from '../auth/roles';
import { boardUrl, contextOf, person, project, type AppOptions } from './context';

/** Overdue = pending and not On Hold (SRS 5), so the Bitrix24 link uses these stages. */
const OVERDUE_STAGES = PENDING_STAGES.filter((s) => s !== 'On Hold');

/** A tester's line: the issues they filed. A QA lead's line mixes creators: stage only. */
const ownerFilter = (r: { role: 'assignee' | 'tester' | 'qaLead'; personId: number }) =>
  r.role === 'assignee'
    ? { responsibleId: r.personId }
    : r.role === 'tester'
      ? { createdBy: r.personId }
      : {};

export function alertRoutes(app: FastifyInstance, getDataset: RequestDataset, opts: AppOptions) {
  app.get('/api/alerts', async (req) => {
    const ds = await getDataset(req);
    const ctx = contextOf(ds, opts);
    const a = alerts(devTasks(ds.tasks, ctx, 'all'), ctx);
    const names = <R extends { personId: number; projectId: number }>(r: R) => ({
      ...r,
      person: person(ds, r.personId),
      project: project(ds, r.projectId),
    });
    // Each alert links to its project's Bitrix24 board, filtered to it; fixing the tasks there
    // clears the alert here on the next sync.
    return {
      stuckDays: STUCK_DAYS,
      overdue: a.overdue.map((r) => ({
        ...names(r),
        // Same rule as the dashboard: Bitrix24 "Overdue" status in a pending stage, On Hold aside.
        boardUrl: boardUrl(ds, r.projectId, {
          responsibleId: r.personId,
          overdue: true,
          stages: OVERDUE_STAGES,
        }),
      })),
      stuck: a.stuck.map((r) => ({
        ...names(r),
        // Bitrix24 cannot filter by days in a stage, so its board shows the whole stage.
        boardCount: boardStageCount(ds.tasks, r.projectId, r.stage, ownerFilter(r)),
        boardUrl: boardUrl(ds, r.projectId, {
          stages: [r.stage],
          ...ownerFilter(r),
        }),
      })),
      total: a.overdue.length + a.stuck.length,
    };
  });
}
