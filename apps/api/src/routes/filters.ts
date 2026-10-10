// Contextual dropdown options (DEV-00): options are limited to values present in the data
// matching every other filter.
import { devTasks, filterOptions, issues, testingTasks } from '@nural/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatasetProvider } from '../data/dataset';
import { contextOf, person, project, type AppOptions } from './context';
import { parseQuery, scopeParam } from './params';

const GROUP_ORDER = { Development: 0, Testing: 1, Other: 2 } as const;

export function filterRoutes(app: FastifyInstance, getDataset: DatasetProvider, opts: AppOptions) {
  app.get('/api/filters/options', async (req) => {
    const { query, filters } = parseQuery(req.query, {
      tab: z.enum(['kpi', 'dev', 'qa']).default('dev'),
      ...scopeParam,
    });
    const ds = await getDataset();
    const ctx = contextOf(ds, opts);
    // QA tab covers issues plus testing work (QA-06); the Development tab its own tasks.
    // KPI tab: every task in every workgroup (SRS 13).
    const universe =
      query.tab === 'kpi'
        ? ds.tasks
        : query.tab === 'qa'
          ? [...issues(ds.tasks), ...testingTasks(ds.tasks, ctx)]
          : devTasks(ds.tasks, ctx, query.scope);
    const o = filterOptions(universe, filters, ctx.tz);
    return {
      projects: o.projects
        .map((p) => ({ ...project(ds, p.value)!, count: p.count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      // Grouped by department group in the dropdown (DEV-00).
      assignees: o.assignees
        .map((a) => ({ ...person(ds, a.value), count: a.count }))
        .sort(
          (a, b) =>
            GROUP_ORDER[a.deptGroup] - GROUP_ORDER[b.deptGroup] || a.name.localeCompare(b.name),
        ),
      tags: o.tags,
      issueTypes: o.issueTypes,
    };
  });
}
