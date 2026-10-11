// Insights (SRS 18): what is holding us back, from Bitrix24 data (and Infowan absences once
// connected). Open to everyone: it reads the request's own dataset, so a member's insights cover
// their own tasks and a manager's the whole company (NFR-4). The usual filters plus
// `window=7|14|30` (days of activity looked at).
import {
  applyFilters,
  keyPoints,
  kpiScope,
  load,
  overlap,
  peopleLag,
  projectLag,
  releasePlan,
  windows,
} from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset, Viewer } from '../auth/roles';
import type { Dataset } from '../data/dataset';
import { person, project, type AppOptions } from './context';
import { kpiContext } from './kpi';
import { parseQuery } from './params';

export const insightParams = {
  window: z.coerce
    .number()
    .int()
    .refine((n) => [7, 14, 30].includes(n), 'window: 7, 14 or 30')
    .default(14),
};

const LIMIT = { projects: 15, people: 20, load: 30, shared: 30, releases: 80 };

export function insightRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  opts: AppOptions,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
) {
  app.get('/api/insights', async (req) => {
    const { query, filters } = parseQuery(req.query, insightParams);
    const ds = await getDataset(req);
    const v = await viewer(req);
    const ctx = kpiContext(ds, opts.now?.() ?? new Date(), opts.tz);
    const scope = kpiScope(applyFilters(ds.tasks, filters, opts.tz), ctx);
    const w = windows(ctx, query.window);
    const projects = projectLag(scope, ctx, w);
    const people = peopleLag(scope, ctx, w);
    const loads = load(scope, ctx, w);
    const { shared, pulls } = overlap(scope, ctx, w);
    const releases = releasePlan(scope, ctx);
    const pName = (id: number) => projectName(ds, id);
    const uName = (id: number) => person(ds, id).name;
    const points = keyPoints(
      { projects, people, load: loads, pulls, releases },
      { project: pName, person: uName },
    );
    const byId = ds.byId;
    return {
      window: query.window,
      // Whose tasks these are: everything, or the viewer's own (members).
      viewScope: v.full ? 'all' : 'own',
      tiles: {
        laggingProjects: projects.filter((p) => p.lagging).length,
        laggingPeople: people.filter((p) => p.lagging).length,
        overloaded: loads.filter((l) => l.level === 'over').length,
        underloaded: loads.filter((l) => l.level === 'under').length,
        shared: shared.length,
        atRisk: releases.filter((r) => r.risk === 'high').length,
      },
      ids: {
        laggingProjects: uniq(projects.filter((p) => p.lagging).flatMap((p) => p.overdueIds)),
        laggingPeople: uniq(people.filter((p) => p.lagging).flatMap((p) => p.overdueIds)),
        overloaded: uniq(loads.filter((l) => l.level === 'over').flatMap((l) => l.openIds)),
        underloaded: uniq(loads.filter((l) => l.level === 'under').flatMap((l) => l.openIds)),
        atRisk: releases.filter((r) => r.risk === 'high').map((r) => r.id),
      },
      keyPoints: points,
      projects: projects.slice(0, LIMIT.projects).map((p) => ({
        ...p,
        name: pName(p.id),
        owner: ds.owners?.get(p.id) ? uName(ds.owners.get(p.id)!) : null,
      })),
      people: people
        .filter((p) => p.lagging || p.overdue > 0)
        .slice(0, LIMIT.people)
        .map((p) => ({ ...p, name: uName(p.id) })),
      load: loads.slice(0, LIMIT.load).map((l) => ({ ...l, name: uName(l.id) })),
      overlap: {
        shared: shared.slice(0, LIMIT.shared).map((s) => ({
          ...s,
          name: uName(s.id),
          projects: s.projects.map((p) => ({ ...p, name: pName(p.id) })),
        })),
        pulls: pulls.map((p) => ({
          ...p,
          pullingName: pName(p.pulling),
          sufferingName: pName(p.suffering),
          peopleNames: p.people.map(uName),
        })),
      },
      releases: releases.slice(0, LIMIT.releases).map((r) => {
        const t = byId.get(r.id);
        return {
          ...r,
          title: t?.title ?? '',
          assignee: t ? uName(t.responsibleId) : '',
          project: t ? pName(t.groupId) : '',
        };
      }),
      // Infowan absences join here once connected (SRS 19, CRM).
      absences: null,
    };
  });
}

const uniq = (ids: number[]) => [...new Set(ids)];
const projectName = (ds: Dataset, id: number) => project(ds, id)?.name ?? 'No project';
