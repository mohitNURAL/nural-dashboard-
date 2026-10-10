// Task lists behind tiles and accordions (DEV-06..08, QA-08, QA-09) and the task drawer.
import {
  AGEING_BUCKETS,
  ageingBucket,
  alertOwner,
  applyFilters,
  DEV_PRESETS,
  devTasks,
  ISSUE_PRESETS,
  issues,
  lastFiled,
  presetPredicate,
  reopenEvents,
  isOverdue,
  isPending,
  isRankedTask,
  isStuck,
  STAGE_TITLES,
  testingTasks,
  type MetricTask,
} from '@nural/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatasetProvider } from '../data/dataset';
import { contextOf, person, taskRow, type AppOptions } from './context';
import { list as listParam, parseQuery, scopeParam } from './params';

const SORTS = ['deadline', '-deadline', 'created', '-created', 'id', '-id'] as const;

const listParams = {
  kind: z.enum(['tasks', 'issues', 'testing']).default('tasks'),
  preset: z.enum([...DEV_PRESETS, ...ISSUE_PRESETS]).optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(SORTS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  // Drill-downs from a clicked count: Kanban stage, overdue or not, ageing bucket.
  // One or more stages (comma list), e.g. the alert details' stage filter.
  stage: listParam(z.enum(STAGE_TITLES)),
  overdue: z.enum(['true', 'false']).optional(),
  ageing: z.enum(AGEING_BUCKETS).optional(),
  // Header alert: more than STUCK_DAYS days in the current stage (LIVE aside).
  stuck: z.enum(['true']).optional(),
  // Header alert person: the assignee, or the tester / QA lead for work waiting in QA.
  owner: z.coerce.number().int().positive().optional(),
  // DEV-04: the tasks behind a speed ranking row (sent to QA, with a deadline).
  ranked: z.enum(['true']).optional(),
  ...scopeParam,
};

const time = (d: Date | null) => d?.getTime() ?? null;

function sorter(sort: (typeof SORTS)[number]) {
  const desc = sort.startsWith('-');
  const key = sort.replace('-', '') as 'deadline' | 'created' | 'id';
  const value = (t: MetricTask) =>
    key === 'id' ? t.id : key === 'created' ? t.createdAt.getTime() : time(t.deadline);
  return (a: MetricTask, b: MetricTask) => {
    const va = value(a);
    const vb = value(b);
    // Tasks without a deadline go last either way.
    if (va === null || vb === null) return va === vb ? b.id - a.id : va === null ? 1 : -1;
    return (desc ? vb - va : va - vb) || b.id - a.id;
  };
}

export interface TaskRouteDeps {
  /** Live description lookup (tasks.task.get); the drawer works without it. */
  describe?: (taskId: number) => Promise<string | null>;
}

export function taskRoutes(
  app: FastifyInstance,
  getDataset: DatasetProvider,
  opts: AppOptions,
  { describe }: TaskRouteDeps = {},
) {
  app.get('/api/tasks', async (req) => {
    const { query, filters } = parseQuery(req.query, listParams);
    const ds = await getDataset();
    const ctx = contextOf(ds, opts);
    const base =
      query.kind === 'issues'
        ? issues(ds.tasks)
        : query.kind === 'testing'
          ? testingTasks(ds.tasks, ctx)
          : devTasks(ds.tasks, ctx, query.scope);
    let list = applyFilters(base, filters, ctx.tz);
    const stages = query.stage;
    if (stages) list = list.filter((t) => t.stage !== null && stages.includes(t.stage));
    if (query.overdue) {
      const want = query.overdue === 'true';
      list = list.filter((t) => isOverdue(t, ctx) === want);
    }
    if (query.stuck) list = list.filter((t) => isStuck(t, ctx));
    if (query.owner) list = list.filter((t) => alertOwner(t, ctx).id === query.owner);
    if (query.ranked) list = list.filter(isRankedTask);
    // Ageing buckets describe open (pending) tasks only, as in DEV-03.
    if (query.ageing) {
      list = list.filter((t) => isPending(t) && ageingBucket(t, ctx) === query.ageing);
    }
    if (query.preset) {
      const last = query.preset === 'lastFiled' ? lastFiled(list, ctx)?.date : undefined;
      list = list.filter(
        presetPredicate(query.preset, ctx, { byId: ds.byId, lastFiledDate: last }),
      );
    }
    if (query.q) {
      const q = query.q.toLowerCase();
      list = list.filter((t) => String(t.id).includes(q) || t.title.toLowerCase().includes(q));
    }
    // DEV lists: by deadline, latest first. Issue lists: by created, newest first.
    list.sort(sorter(query.sort ?? (query.kind === 'issues' ? '-created' : '-deadline')));

    const start = (query.page - 1) * query.pageSize;
    return {
      total: list.length,
      page: query.page,
      pageSize: query.pageSize,
      rows: list.slice(start, start + query.pageSize).map((t) => taskRow(ds, ctx, t)),
    };
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const ds = await getDataset();
    const t = ds.byId.get(id);
    if (!t) return reply.code(404).send({ error: 'Task not found' });
    const ctx = contextOf(ds, opts);

    // Issues filed against this task: its sub-tasks / related tasks tagged bug or feedback.
    const linkedIssues = ds.tasks.filter(
      (x) => x.isIssue && x.id !== t.id && (x.parentId === t.id || x.relatedIds.includes(t.id)),
    );
    const parent = t.parentId ? ds.byId.get(t.parentId) : undefined;
    const timeline = t.events.map((e) => ({ ...e, by: e.by ? person(ds, e.by) : null }));
    const description = describe
      ? await describe(t.id).catch((err: unknown) => {
          req.log.warn({ err, taskId: t.id }, 'task description unavailable');
          return null;
        })
      : null;

    return {
      task: taskRow(ds, ctx, t),
      description,
      timeline,
      reopens: reopenEvents(t).map((e) => ({ ...e, by: e.by ? person(ds, e.by) : null })),
      parent: parent ? taskRow(ds, ctx, parent) : null,
      linkedIssues: linkedIssues.map((x) => taskRow(ds, ctx, x)),
      related: t.relatedIds
        .map((rid) => ds.byId.get(rid))
        .filter((x): x is MetricTask => !!x)
        .map((x) => taskRow(ds, ctx, x)),
    };
  });
}
