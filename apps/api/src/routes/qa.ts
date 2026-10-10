// QA tab endpoints (SRS 4, QA-01..07).
import {
  ageingByAssignee,
  applyFilters,
  issueAgeByAssignee,
  issues,
  issuesByAssignee,
  issuesByStage,
  issueStageTable,
  qaSummary,
  qaSummaryParts,
  stageMatrix,
  reworkByDeveloper,
  STAGE_COLORS,
  testingTasks,
  testingWorkload,
  waitingForRetest,
} from '@nural/shared';
import type { FastifyInstance } from 'fastify';
import type { DatasetProvider } from '../data/dataset';
import { contextOf, withGroupNames, withPeople, type AppOptions } from './context';
import { groupByParam, parseQuery } from './params';

export function qaRoutes(app: FastifyInstance, getDataset: DatasetProvider, opts: AppOptions) {
  async function scope(query: unknown) {
    const { filters } = parseQuery(query);
    const ds = await getDataset();
    const ctx = contextOf(ds, opts);
    return { filters, ds, ctx };
  }

  app.get('/api/qa/summary', async (req) => {
    const { filters, ds, ctx } = await scope(req.query);
    const list = applyFilters(issues(ds.tasks, ctx), filters, ctx.tz);
    return {
      ...qaSummary(list, ctx),
      // Tile breakdown: every QA tile split into Bug and Feedback.
      parts: qaSummaryParts(list, ctx),
      asOf: ctx.now,
      dataLoadedAt: ds.loadedAt,
    };
  });

  app.get('/api/qa/issues', async (req) => {
    const { query, filters } = parseQuery(req.query, groupByParam);
    const by = query.groupBy;
    const ds = await getDataset();
    const ctx = contextOf(ds, opts);
    const list = applyFilters(issues(ds.tasks, ctx), filters, ctx.tz);
    const age = issueAgeByAssignee(list, ctx, by);
    const byStage = issuesByStage(list);
    const retest = waitingForRetest(list, ctx);
    return {
      groupBy: by,
      byAssignee: withGroupNames(ds, issuesByAssignee(list, by), by),
      // QA-03 as the stage heat matrix (same as DEV-05): per assignee or project, overdue split.
      matrix: (() => {
        const m = stageMatrix(list, { by, ctx });
        return {
          stages: m.stages.map((s) => ({ stage: s, color: STAGE_COLORS[s] })),
          rows: withGroupNames(ds, m.rows, by),
          max: m.max,
        };
      })(),
      // QA-03 as a table: per assignee (or project), stage columns, bug / feedback split.
      stageTable: (() => {
        const t = issueStageTable(list, by);
        return {
          stages: t.stages.map((s) => ({ stage: s, color: STAGE_COLORS[s] })),
          rows: withGroupNames(ds, t.rows, by),
          totals: t.totals,
        };
      })(),
      byStage: {
        stages: byStage.stages.map((s) => ({ ...s, color: STAGE_COLORS[s.stage] })),
        unmapped: byStage.unmapped,
      },
      age: { rows: withGroupNames(ds, age.rows, by), totals: age.totals },
      // Issue ageing (same as DEV-03 task ageing): open issues by days past deadline.
      ageing: (() => {
        const g = ageingByAssignee(list, ctx, by);
        return { rows: withGroupNames(ds, g.rows, by), totals: g.totals };
      })(),
      rework: withGroupNames(ds, reworkByDeveloper(list, by), by),
      waitingForRetest: { total: retest.total, byCreator: withPeople(ds, retest.byCreator) },
    };
  });

  app.get('/api/qa/testing', async (req) => {
    const { filters, ds, ctx } = await scope(req.query);
    const list = applyFilters(testingTasks(ds.tasks, ctx), filters, ctx.tz);
    return { total: list.length, rows: withPeople(ds, testingWorkload(list, ctx)) };
  });
}
