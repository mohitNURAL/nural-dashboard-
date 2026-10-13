// Development tab endpoints (SRS 3, DEV-01..05). Every one takes `scope` (All / Dev / Issues).
import {
  ageingByAssignee,
  applyFilters,
  assigneeTable,
  devSummary,
  devSummaryParts,
  devTasks,
  speedRanking,
  stageMatrix,
  STAGE_COLORS,
  tasksInHand,
  inHandByGroup,
  projectWork,
  projectWorkSummary,
  type DevScope,
  type GroupBy,
} from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset } from '../auth/roles';
import { contextOf, person, project, withGroupNames, withPeople, type AppOptions } from './context';
import { groupByParam, parseQuery, scopeParam } from './params';

export function devRoutes(app: FastifyInstance, getDataset: RequestDataset, opts: AppOptions) {
  async function scope(req: FastifyRequest, extra?: z.ZodRawShape) {
    const { query: q, filters } = parseQuery(req.query, { ...scopeParam, ...extra });
    const ds = await getDataset(req);
    const ctx = contextOf(ds, opts);
    const sq = q as typeof q & { groupBy?: GroupBy; scope: DevScope };
    return {
      q: sq,
      filters,
      ds,
      ctx,
      tasks: applyFilters(devTasks(ds.tasks, ctx, sq.scope), filters, ctx.tz),
    };
  }

  app.get('/api/dev/summary', async (req) => {
    const { ds, ctx, tasks, filters, q } = await scope(req);
    const s = devSummary(tasks, ctx, filters);
    return {
      ...s,
      // Tile sub-lines: Dev vs Issues (All) or Bug vs Feedback (Issues).
      parts: devSummaryParts(tasks, ctx, q.scope),
      // Tasks in hand: pending, deadline ahead, by window.
      inHand: tasksInHand(tasks, ctx),
      split: s.split && {
        by: s.split.by,
        items: s.split.items.map((i) => ({
          ...i,
          name: s.split!.by === 'project' ? project(ds, i.id)?.name : person(ds, i.id).name,
        })),
      },
      asOf: ctx.now,
      dataLoadedAt: ds.loadedAt,
    };
  });

  // Projects at work (2026-10-13): recent projects, who works on them, deadlines, done yesterday,
  // overdue and yesterday's spill, per project and assignee.
  app.get('/api/dev/projects', async (req) => {
    const { ds, ctx, tasks } = await scope(req);
    const rows = projectWork(tasks, ctx);
    return {
      summary: projectWorkSummary(rows),
      rows: rows.map((r) => ({
        ...r,
        name: project(ds, r.id)?.name ?? 'No project',
        people: r.people.map((p) => ({ ...p, person: person(ds, p.id) })),
      })),
    };
  });

  // Tasks in hand per assignee or project (pending, deadline ahead, by window).
  app.get('/api/dev/inhand', async (req) => {
    const { ds, ctx, tasks, q } = await scope(req, groupByParam);
    const by = q.groupBy ?? 'assignee';
    const r = inHandByGroup(tasks, ctx, by);
    return { groupBy: by, rows: withGroupNames(ds, r.rows, by), totals: r.totals };
  });

  app.get('/api/dev/assignees', async (req) => {
    const { ds, ctx, tasks, q } = await scope(req, groupByParam);
    const by = q.groupBy ?? 'assignee';
    const table = assigneeTable(tasks, ctx, by);
    const ageing = ageingByAssignee(tasks, ctx, by);
    return {
      groupBy: by,
      rows: withGroupNames(ds, table.rows, by),
      totals: table.totals,
      ageing: { rows: withGroupNames(ds, ageing.rows, by), totals: ageing.totals },
    };
  });

  app.get('/api/dev/ranking', async (req) => {
    const { ds, tasks, q } = await scope(req, {
      minTasks: z.coerce.number().int().min(1).optional(),
    });
    const minTasks = (q as { minTasks?: number }).minTasks ?? 3;
    // Only the Development department group is ranked (Software Development tree).
    const eligible = new Set(
      [...ds.users.values()].filter((u) => u.deptGroup === 'Development').map((u) => u.id),
    );
    return { minTasks, rows: withPeople(ds, speedRanking(tasks, { minTasks, eligible })) };
  });

  app.get('/api/dev/matrix', async (req) => {
    const { ds, ctx, tasks, q } = await scope(req, {
      splitTag: z.string().min(1).optional(),
      ...groupByParam,
    });
    const by = q.groupBy ?? 'assignee';
    const m = stageMatrix(tasks, { tag: (q as { splitTag?: string }).splitTag, by, ctx });
    return {
      ...m,
      groupBy: by,
      stages: m.stages.map((s) => ({ stage: s, color: STAGE_COLORS[s] })),
      rows: withGroupNames(ds, m.rows, by),
    };
  });
}
