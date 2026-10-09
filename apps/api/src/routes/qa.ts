// QA tab endpoints (SRS 4, QA-01..07).
import {
  applyFilters,
  issueAgeByAssignee,
  issues,
  issuesByAssignee,
  issuesByStage,
  qaSummary,
  reworkByDeveloper,
  STAGE_COLORS,
  testingTasks,
  testingWorkload,
  waitingForRetest,
} from '@nural/shared';
import type { FastifyInstance } from 'fastify';
import type { DatasetProvider } from '../data/dataset';
import { contextOf, withPeople, type AppOptions } from './context';
import { parseQuery } from './params';

export function qaRoutes(app: FastifyInstance, getDataset: DatasetProvider, opts: AppOptions) {
  async function scope(query: unknown) {
    const { filters } = parseQuery(query);
    const ds = await getDataset();
    const ctx = contextOf(ds, opts);
    return { filters, ds, ctx };
  }

  app.get('/api/qa/summary', async (req) => {
    const { filters, ds, ctx } = await scope(req.query);
    const list = applyFilters(issues(ds.tasks), filters, ctx.tz);
    return { ...qaSummary(list, ctx, ds.byId), asOf: ctx.now, dataLoadedAt: ds.loadedAt };
  });

  app.get('/api/qa/issues', async (req) => {
    const { filters, ds, ctx } = await scope(req.query);
    const list = applyFilters(issues(ds.tasks), filters, ctx.tz);
    const age = issueAgeByAssignee(list, ctx);
    const byStage = issuesByStage(list);
    const retest = waitingForRetest(list, ctx);
    return {
      byAssignee: withPeople(ds, issuesByAssignee(list)),
      byStage: {
        stages: byStage.stages.map((s) => ({ ...s, color: STAGE_COLORS[s.stage] })),
        unmapped: byStage.unmapped,
      },
      age: { rows: withPeople(ds, age.rows), totals: age.totals },
      rework: withPeople(ds, reworkByDeveloper(list, ds.byId)),
      waitingForRetest: { total: retest.total, byCreator: withPeople(ds, retest.byCreator) },
    };
  });

  app.get('/api/qa/testing', async (req) => {
    const { filters, ds, ctx } = await scope(req.query);
    const list = applyFilters(testingTasks(ds.tasks, ctx), filters, ctx.tz);
    return { total: list.length, rows: withPeople(ds, testingWorkload(list, ctx)) };
  });
}
