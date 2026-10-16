// KPI tab endpoints (SRS 13.5), counts first. Every workgroup, every department; the usual
// filters plus `period=day|week|month` and `dept=all|dev|qa|support`. All cards of one page share
// one computation (cached per query for the dataset's lifetime).
import {
  applyFilters,
  emptyProjectRow,
  hotProjects,
  insights,
  kpiScope,
  kpiSummary,
  projectWork,
  projectWorkSummary,
  tasksInHand,
  inHandByGroup,
  GROUP_BY,
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
import {
  contextOf,
  person,
  project,
  unassignedOpen,
  withAssignees,
  withGroupNames,
  type AppOptions,
} from './context';
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
  const activeIds = activeProjectIds(ds, filters.projectIds);
  // The Projects tile (2026-10-15): the Development tab's rule (Active, Silent, Hold) for every
  // active project, all departments, from all its tasks.
  const work = new Map(
    projectWork(ds.tasks, contextOf(ds, opts), 'day', {
      projectIds: activeIds,
      allTasks: ds.tasks,
    }).map((r) => [r.id, r]),
  );
  return { q, ctx, scope, projects, activeIds, work };
}

/**
 * The active Bitrix24 projects in view (KPI Active projects): every project still listed in
 * Bitrix24, narrowed by the Project filter; a person who sees only their own tasks counts the
 * projects of those tasks.
 */
function activeProjectIds(ds: Dataset, picked?: number[]) {
  const mine = ds.scoped ? new Set(ds.tasks.map((t) => t.groupId)) : null;
  const want = picked?.length ? new Set(picked) : null;
  return [...ds.projects.values()]
    .filter((p) => p.active !== false && (!mine || mine.has(p.id)) && (!want || want.has(p.id)))
    .map((p) => p.id);
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
  // The KPI tab needs the kpi right (by default admins, PM, team leads, product owners).
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/kpi/')) return;
    if (!(await viewer(req)).kpi) {
      return reply.code(403).send({ error: 'The KPI tab is for managers only.' });
    }
  });

  app.get('/api/kpi/summary', async (req) => {
    const { ds, q, ctx, scope, projects, activeIds, work } = await get(req);
    return {
      ...kpiSummary(scope, ctx, q.period, projects, activeIds),
      /** Projects tile: every active project = Active + Silent + Hold (the Development rule). */
      projectWork: projectWorkSummary([...work.values()]),
      // Open tile: open tasks nobody has picked up (placeholder assignee).
      unassigned: (() => {
        const open = new Set(scope.all.filter((k) => k.open).map((k) => k.t.id));
        return unassignedOpen(
          scope.all.map((k) => k.t),
          (t) => open.has(t.id),
        );
      })(),
      // Tasks in hand: KPI open tasks with the deadline ahead, by window.
      inHand: (() => {
        const open = new Set(scope.all.filter((k) => k.open).map((k) => k.t.id));
        return tasksInHand(
          scope.all.map((k) => k.t),
          contextOf(ds, opts),
          (t) => open.has(t.id),
        );
      })(),
      asOf: ctx.now,
      dataLoadedAt: ds.loadedAt,
    };
  });

  // Tasks in hand per assignee or project: KPI open tasks with the deadline ahead, by window.
  app.get('/api/kpi/inhand', async (req) => {
    const by = z
      .enum(GROUP_BY)
      .catch('assignee')
      .parse((req.query as { groupBy?: unknown }).groupBy);
    const { ds, scope } = await get(req);
    const open = new Set(scope.all.filter((k) => k.open).map((k) => k.t.id));
    const r = inHandByGroup(
      scope.all.map((k) => k.t),
      contextOf(ds, opts),
      by,
      (t) => open.has(t.id),
    );
    return { groupBy: by, rows: withGroupNames(ds, r.rows, by), totals: r.totals };
  });

  app.get('/api/kpi/projects', async (req) => {
    const { ds, projects, activeIds, work } = await get(req);
    const active = new Set(activeIds);
    const withTasks = new Set(projects.map((p) => p.id));
    // Active projects without tasks in view are listed too, so the tile's parts each have rows.
    const empty = activeIds
      .filter((id) => !withTasks.has(id))
      .map((id) => emptyProjectRow(id, ds.owners?.get(id) ?? null));
    return {
      rows: [...projects, ...empty].map((p) => ({
        ...p,
        name: projectName(ds, p.id),
        owner: ownerOf(ds, p.id),
        active: active.has(p.id),
        /** Active, Silent or Hold (the Projects tile); null when not active in Bitrix24. */
        work: work.get(p.id)?.status ?? null,
      })),
    };
  });

  app.get('/api/kpi/people', async (req) => {
    const { ds, q, ctx, scope } = await get(req);
    const rows = peoplePerformance(scope, ctx, q.period);
    const load = new Map(workload(scope, ctx).map((w) => [w.id, w]));
    return {
      rows: withAssignees(ds, rows).map((r) => ({
        ...r,
        name: r.person.name,
        workload: load.get(r.id) ?? null,
      })),
    };
  });

  app.get('/api/kpi/workload', async (req) => {
    const { ds, ctx, scope } = await get(req);
    return {
      rows: withAssignees(ds, workload(scope, ctx)).map((r) => ({ ...r, name: r.person.name })),
    };
  });

  app.get('/api/kpi/overdue', async (req) => {
    const { ds, scope } = await get(req);
    const o = overdueBreakdown(scope);
    return {
      ...o,
      byProject: o.byProject.map((g) => ({ ...g, name: projectName(ds, g.id) })),
      byAssignee: withAssignees(ds, o.byAssignee).map((g) => ({ ...g, name: g.person.name })),
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
