// KPI tab endpoints (SRS 13.5), counts first. Every workgroup, every department; the usual
// filters plus `period=day|week|month` and `dept=all|dev|qa|support`. All cards of one page share
// one computation (cached per query for the dataset's lifetime).
import {
  applyFilters,
  hotProjects,
  insights,
  kpiScope,
  kpiSummary,
  overdueBreakdown,
  peoplePerformance,
  projectHealth,
  workload,
  type Dept,
  type KpiContext,
} from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset, Viewer } from '../auth/roles';
import type { Dataset } from '../data/dataset';
import { kpiConfig } from '../data/kpiConfig';
import { person, project, withPeople, type AppOptions } from './context';
import { parseQuery } from './params';

export const kpiParams = {
  period: z.enum(['day', 'week', 'month']).default('week'),
  dept: z.enum(['all', 'dev', 'qa', 'support']).default('all'),
};

export function kpiContext(ds: Dataset, now: Date, tz: string): KpiContext {
  return {
    now,
    tz,
    cal: kpiConfig().calendar,
    deptOf: (id) => ds.kpiDept?.get(id) ?? 'other',
    comments: ds.comments ?? [],
  };
}

function compute(ds: Dataset, query: unknown, opts: AppOptions) {
  const { query: q, filters } = parseQuery(query, kpiParams);
  const ctx = kpiContext(ds, opts.now?.() ?? new Date(), opts.tz);
  const scope = kpiScope(applyFilters(ds.tasks, filters, opts.tz), ctx, q.dept as Dept | 'all');
  const projects = projectHealth(scope, ctx, q.period, (g) => ds.owners?.get(g) ?? null);
  return { q, ctx, scope, projects };
}

/** One computation per (dataset, query) for a minute; the endpoints read from it. */
function computer(getDataset: RequestDataset, opts: AppOptions) {
  // Keyed by query and checked against the very dataset object: a scoped dataset is a different
  // object per person, so one person's numbers can never be served to another.
  const cache = new Map<string, { ds: Dataset; at: number; value: ReturnType<typeof compute> }>();
  return async (req: FastifyRequest) => {
    const query = req.query;
    const ds = await getDataset(req);
    const key = JSON.stringify(query ?? {});
    const hit = cache.get(key);
    if (hit && hit.ds === ds && Date.now() - hit.at < 60_000) return { ds, ...hit.value };
    const value = compute(ds, query, opts);
    if (cache.size > 50) cache.clear();
    cache.set(key, { ds, at: Date.now(), value });
    return { ds, ...value };
  };
}

const projectName = (ds: Dataset, id: number) => project(ds, id)?.name ?? 'No project';
const ownerOf = (ds: Dataset, id: number) => {
  const o = ds.owners?.get(id);
  return o ? person(ds, o) : null;
};

export function kpiRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  opts: AppOptions,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
) {
  const get = computer(getDataset, opts);
  // The KPI tab is for full access only (admin, directors, PM, team leads, product owners).
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/kpi/')) return;
    if (!(await viewer(req)).full) {
      return reply.code(403).send({ error: 'The KPI tab is for managers only.' });
    }
  });

  app.get('/api/kpi/summary', async (req) => {
    const { ds, q, ctx, scope, projects } = await get(req);
    return {
      ...kpiSummary(scope, ctx, q.period, projects),
      asOf: ctx.now,
      dataLoadedAt: ds.loadedAt,
    };
  });

  app.get('/api/kpi/projects', async (req) => {
    const { ds, projects } = await get(req);
    return {
      rows: projects.map((p) => ({ ...p, name: projectName(ds, p.id), owner: ownerOf(ds, p.id) })),
    };
  });

  app.get('/api/kpi/people', async (req) => {
    const { ds, q, ctx, scope } = await get(req);
    const rows = peoplePerformance(scope, ctx, q.period);
    const load = new Map(workload(scope, ctx).map((w) => [w.id, w]));
    return {
      rows: withPeople(ds, rows).map((r) => ({
        ...r,
        name: r.person.name,
        workload: load.get(r.id) ?? null,
      })),
    };
  });

  app.get('/api/kpi/workload', async (req) => {
    const { ds, ctx, scope } = await get(req);
    return {
      rows: withPeople(ds, workload(scope, ctx)).map((r) => ({ ...r, name: r.person.name })),
    };
  });

  app.get('/api/kpi/overdue', async (req) => {
    const { ds, scope } = await get(req);
    const o = overdueBreakdown(scope);
    return {
      ...o,
      byProject: o.byProject.map((g) => ({ ...g, name: projectName(ds, g.id) })),
      byAssignee: withPeople(ds, o.byAssignee).map((g) => ({ ...g, name: g.person.name })),
    };
  });

  app.get('/api/kpi/activity', async (req) => {
    const { ds, ctx, scope, projects } = await get(req);
    return {
      hot: hotProjects(scope, ctx).map((h) => ({
        ...h,
        name: projectName(ds, h.id),
        owner: ownerOf(ds, h.id),
      })),
      silent: projects
        .filter((p) => p.silent)
        .sort((a, b) => (b.idleWorkingDays ?? 0) - (a.idleWorkingDays ?? 0))
        .map((p) => ({
          id: p.id,
          name: projectName(ds, p.id),
          owner: ownerOf(ds, p.id),
          open: p.open,
          overdue: p.overdue,
          idleWorkingDays: p.idleWorkingDays,
          lastAction: p.lastAction,
        })),
    };
  });

  app.get('/api/kpi/insights', async (req) => {
    const { ds, ctx, scope, projects } = await get(req);
    return {
      insights: insights(scope, ctx, projects, {
        person: (id) => person(ds, id).name,
        project: (id) => projectName(ds, id),
      }),
    };
  });
}
