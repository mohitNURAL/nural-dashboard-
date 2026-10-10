// GET /api/alerts: the header bell. Overdue tasks per assignee and project, and tasks stuck more
// than STUCK_DAYS days in a stage (LIVE aside), for the Development department's tasks and
// issues. Work stuck in QA Backlog or In QA names the tester who filed it, or the QA lead.
// The filter bar does not apply: the bell shows the whole picture.
import { alerts, devTasks, STUCK_DAYS } from '@nural/shared';
import type { FastifyInstance } from 'fastify';
import type { DatasetProvider } from '../data/dataset';
import { boardUrl, contextOf, person, project, type AppOptions } from './context';

export function alertRoutes(app: FastifyInstance, getDataset: DatasetProvider, opts: AppOptions) {
  app.get('/api/alerts', async () => {
    const ds = await getDataset();
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
        boardUrl: boardUrl(ds, r.projectId, { responsibleId: r.personId }),
      })),
      stuck: a.stuck.map((r) => ({
        ...names(r),
        // A tester's line: the issues they filed. A QA lead's line mixes creators: stage only.
        boardUrl: boardUrl(ds, r.projectId, {
          stage: r.stage,
          ...(r.role === 'assignee'
            ? { responsibleId: r.personId }
            : r.role === 'tester'
              ? { createdBy: r.personId }
              : {}),
        }),
      })),
      total: a.overdue.length + a.stuck.length,
    };
  });
}
