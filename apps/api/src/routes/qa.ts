// QA tab endpoints (SRS 4, QA-01..07). The QA tab counts every bug and feedback, whoever it is
// assigned to (the Development tab counts only the Development department's).
import {
  ageingByAssignee,
  assigneeTable,
  applyFilters,
  dayKey,
  filedOnDay,
  lastFiled,
  issueAgeByAssignee,
  issues,
  isOpenIssue,
  issuesByAssignee,
  issuesByStage,
  issueStageTable,
  issueTrend,
  qaSummary,
  qaSummaryParts,
  stageMatrix,
  reworkByDeveloper,
  retestBreakdown,
  STAGE_COLORS,
  tasksInHand,
  inHandByGroup,
  testingTasks,
  testingWorkload,
  waitingForRetest,
} from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset } from '../auth/roles';
import {
  assignee,
  contextOf,
  person,
  project,
  unassignedOpen,
  withAssignees,
  withGroupNames,
  withPeople,
  type AppOptions,
} from './context';
import { groupByParam, parseQuery } from './params';

export function qaRoutes(app: FastifyInstance, getDataset: RequestDataset, opts: AppOptions) {
  async function scope(req: FastifyRequest) {
    const { filters } = parseQuery(req.query);
    const ds = await getDataset(req);
    const ctx = contextOf(ds, opts);
    return { filters, ds, ctx };
  }

  app.get('/api/qa/summary', async (req) => {
    const { filters, ds, ctx } = await scope(req);
    const list = applyFilters(issues(ds.tasks), filters, ctx.tz);
    return {
      ...qaSummary(list, ctx),
      // Tile breakdown: every QA tile split into Bug and Feedback.
      parts: qaSummaryParts(list, ctx),
      // Open tile: open issues nobody has picked up (placeholder assignee).
      unassigned: unassignedOpen(list, isOpenIssue),
      // Tasks in hand: the QA team's pending testing tasks with the deadline ahead, by window.
      inHand: tasksInHand(applyFilters(testingTasks(ds.tasks, ctx), filters, ctx.tz), ctx),
      asOf: ctx.now,
      dataLoadedAt: ds.loadedAt,
    };
  });

  // Last filed popup (2026-10-16): the issues filed on one day (default: the Last filed day) per
  // project, then per creator, then per assignee, each split into bug and feedback.
  app.get('/api/qa/filed', async (req) => {
    const { query, filters } = parseQuery(req.query, {
      day: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    });
    const ds = await getDataset(req);
    const ctx = contextOf(ds, opts);
    const list = applyFilters(issues(ds.tasks), filters, ctx.tz);
    const day = (query as { day?: string }).day ?? lastFiled(list, ctx)?.date ?? null;
    const rows = day ? filedOnDay(list, ctx, day) : [];
    return {
      day,
      isToday: day === dayKey(ctx.now, ctx.tz),
      rows: rows.map((r) => ({
        ...r,
        name: project(ds, r.id)?.name ?? 'No project',
        creators: r.creators.map((c) => ({
          ...c,
          person: person(ds, c.id),
          assignees: c.assignees.map((a) => ({ ...a, person: assignee(ds, a.id) })),
        })),
      })),
    };
  });

  // Tasks in hand per assignee or project: the QA team's pending testing tasks, deadline ahead.
  app.get('/api/qa/inhand', async (req) => {
    const { query, filters } = parseQuery(req.query, groupByParam);
    const by = query.groupBy;
    const ds = await getDataset(req);
    const ctx = contextOf(ds, opts);
    const r = inHandByGroup(applyFilters(testingTasks(ds.tasks, ctx), filters, ctx.tz), ctx, by);
    return { groupBy: by, rows: withGroupNames(ds, r.rows, by), totals: r.totals };
  });

  app.get('/api/qa/issues', async (req) => {
    const { query, filters } = parseQuery(req.query, groupByParam);
    const by = query.groupBy;
    const ds = await getDataset(req);
    const ctx = contextOf(ds, opts);
    const list = applyFilters(issues(ds.tasks), filters, ctx.tz);
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
      // QA-02 table view: the assignee-wise table of DEV-02, for issues.
      table: (() => {
        const t = assigneeTable(list, ctx, by);
        return { rows: withGroupNames(ds, t.rows, by), totals: t.totals };
      })(),
      // Issue ageing (same as DEV-03 task ageing): open issues by days past deadline.
      ageing: (() => {
        const g = ageingByAssignee(list, ctx, by);
        return { rows: withGroupNames(ds, g.rows, by), totals: g.totals };
      })(),
      rework: withGroupNames(ds, reworkByDeveloper(list, by), by),
      // Issue trend: filed (bug, feedback) and resolved on each of the last 7 days, overall and per row.
      trend: (() => {
        const t = issueTrend(list, ctx, by);
        return { days: t.days, totals: t.totals, rows: withGroupNames(ds, t.rows, by) };
      })(),
      waitingForRetest: { total: retest.total, byCreator: withPeople(ds, retest.byCreator) },
    };
  });

  // Retesting awaited: every task in QA Backlog or In QA, dev tasks and issues, per row.
  app.get('/api/qa/retest', async (req) => {
    const { query, filters } = parseQuery(req.query, groupByParam);
    const ds = await getDataset(req);
    const ctx = contextOf(ds, opts);
    const r = retestBreakdown(applyFilters(ds.tasks, filters, ctx.tz), query.groupBy);
    return {
      groupBy: query.groupBy,
      totals: r.totals,
      rows: withGroupNames(ds, r.rows, query.groupBy),
    };
  });

  app.get('/api/qa/testing', async (req) => {
    const { filters, ds, ctx } = await scope(req);
    const list = applyFilters(testingTasks(ds.tasks, ctx), filters, ctx.tz);
    return { total: list.length, rows: withAssignees(ds, testingWorkload(list, ctx)) };
  });
}
