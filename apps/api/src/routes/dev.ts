// Development tab endpoints (SRS 3, DEV-01..05).
import {
  ageingByAssignee,
  applyFilters,
  assigneeTable,
  devSummary,
  devTasks,
  speedRanking,
  stageMatrix,
  STAGE_COLORS,
} from '@nural/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatasetProvider } from '../data/dataset';
import { contextOf, person, project, withPeople, type AppOptions } from './context';
import { parseQuery } from './params';

export function devRoutes(app: FastifyInstance, getDataset: DatasetProvider, opts: AppOptions) {
  async function scope(query: unknown, extra?: z.ZodRawShape) {
    const { query: q, filters } = parseQuery(query, extra);
    const ds = await getDataset();
    const ctx = contextOf(ds, opts);
    return { q, filters, ds, ctx, tasks: applyFilters(devTasks(ds.tasks, ctx), filters, ctx.tz) };
  }

  app.get('/api/dev/summary', async (req) => {
    const { ds, ctx, tasks, filters } = await scope(req.query);
    const s = devSummary(tasks, ctx, filters);
    return {
      ...s,
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

  app.get('/api/dev/assignees', async (req) => {
    const { ds, ctx, tasks } = await scope(req.query);
    const table = assigneeTable(tasks, ctx);
    const ageing = ageingByAssignee(tasks, ctx);
    return {
      rows: withPeople(ds, table.rows),
      totals: table.totals,
      ageing: { rows: withPeople(ds, ageing.rows), totals: ageing.totals },
    };
  });

  app.get('/api/dev/ranking', async (req) => {
    const { ds, tasks, q } = await scope(req.query, {
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
    const { ds, tasks, q } = await scope(req.query, { splitTag: z.string().min(1).optional() });
    const m = stageMatrix(tasks, { tag: (q as { splitTag?: string }).splitTag });
    return {
      ...m,
      stages: m.stages.map((s) => ({ stage: s, color: STAGE_COLORS[s] })),
      rows: withPeople(ds, m.rows),
    };
  });
}
