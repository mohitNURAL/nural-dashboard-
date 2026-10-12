// The workflow (2026-10-12, SRS 22): everyone reads it (Projects › Workflow, Project types);
// only admins change it. A saved workflow is applied at once (packages/shared applyWorkflow) to
// every rule on the server, the data are reloaded and open pages are told to refresh, so every
// number follows. Every version is kept and can be restored.
import {
  applyWorkflow,
  classifyProject,
  DEFAULT_WORKFLOW,
  DEPARTMENTS,
  STAGE_ROLES,
  unmappedColumns,
  validateWorkflow,
  type Workflow,
} from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset, Viewer } from '../auth/roles';

export interface WorkflowVersion {
  version: number;
  at: Date;
  by: number;
  workflow: Workflow;
}

export interface WorkflowStore {
  /** The current workflow, or null for the default. */
  current(): Promise<WorkflowVersion | null>;
  save(workflow: Workflow, by: number): Promise<WorkflowVersion>;
  history(limit: number): Promise<Omit<WorkflowVersion, 'workflow'>[]>;
  get(version: number): Promise<WorkflowVersion | null>;
}

export function memoryWorkflowStore(): WorkflowStore {
  const versions: WorkflowVersion[] = [];
  return {
    current: async () => versions.at(-1) ?? null,
    async save(workflow, by) {
      const v = {
        version: versions.length + 1,
        at: new Date(),
        by,
        workflow: structuredClone(workflow),
      };
      versions.push(v);
      return v;
    },
    history: async (limit) =>
      versions
        .slice(-limit)
        .reverse()
        .map((v) => ({ version: v.version, at: v.at, by: v.by })),
    get: async (version) => versions.find((v) => v.version === version) ?? null,
  };
}

export async function dbWorkflowStore(): Promise<WorkflowStore> {
  const { db, schema } = await import('../db/client');
  const { desc, eq } = await import('drizzle-orm');
  const t = schema.workflowVersions;
  const row = (r: typeof t.$inferSelect): WorkflowVersion => ({
    version: r.version,
    at: r.at,
    by: r.byUser,
    workflow: r.definition as Workflow,
  });
  return {
    async current() {
      const [r] = await db.select().from(t).orderBy(desc(t.version)).limit(1);
      return r ? row(r) : null;
    },
    async save(workflow, by) {
      const [last] = await db.select({ v: t.version }).from(t).orderBy(desc(t.version)).limit(1);
      const [r] = await db
        .insert(t)
        .values({ version: (last?.v ?? 0) + 1, byUser: by, definition: workflow })
        .returning();
      return row(r!);
    },
    async history(limit) {
      const rows = await db
        .select({ version: t.version, at: t.at, by: t.byUser })
        .from(t)
        .orderBy(desc(t.version))
        .limit(limit);
      return rows;
    },
    async get(version) {
      const [r] = await db.select().from(t).where(eq(t.version, version));
      return r ? row(r) : null;
    },
  };
}

const name = z.string().trim().min(1).max(60);
export const workflowInput = z.object({
  stages: z
    .array(
      z.object({
        title: name,
        aliases: z.array(name).max(40),
        category: z.enum(['open', 'hold', 'completed']),
        roles: z.array(z.enum(STAGE_ROLES)).max(STAGE_ROLES.length),
        department: z.enum(DEPARTMENTS),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        description: z.string().trim().max(400),
        next: z.array(name).max(30),
      }),
    )
    .min(2)
    .max(30),
  rework: z.object({ from: z.array(name).max(30), to: z.array(name).max(30) }),
  projectTypes: z
    .array(
      z.object({
        key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,30}$/),
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(400),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        requires: z.array(name).max(30),
        forbids: z.array(name).max(30),
      }),
    )
    .max(20),
  projectOverrides: z.record(z.string().regex(/^\d+$/), z.string()),
});

export interface WorkflowDeps {
  store: WorkflowStore;
  /** After a change: reload the data and tell open pages. */
  changed: () => Promise<void>;
}

/** Loads the saved workflow (or the default) into the rules; call once at start. */
export async function loadWorkflow(store: WorkflowStore): Promise<WorkflowVersion | null> {
  const cur = await store.current().catch(() => null);
  applyWorkflow(cur?.workflow ?? DEFAULT_WORKFLOW);
  return cur;
}

export function workflowRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  deps: WorkflowDeps,
) {
  let current: WorkflowVersion | null = null;
  void deps.store
    .current()
    .then((c) => (current = c))
    .catch(() => undefined);
  const now = () => current?.workflow ?? DEFAULT_WORKFLOW;
  const admin = async (req: FastifyRequest) => (await viewer(req)).admin;

  app.get('/api/workflow', async () => ({
    workflow: now(),
    version: current?.version ?? 0,
    at: current?.at ?? null,
    by: current?.by ?? null,
    isDefault: !current,
  }));

  // Every project with its board columns, the stage each column maps to and its type.
  app.get('/api/workflow/projects', async (req) => {
    const ds = await getDataset(req);
    const wf = now();
    const rows = [...(ds.boards?.entries() ?? [])].map(([id, cols]) => {
      const titles = cols.map((c) => c.title);
      const type = classifyProject(id, titles, wf);
      return {
        id,
        name: ds.projects.get(id)?.name ?? `Project ${id}`,
        columns: cols.map((c) => ({ title: c.title, stage: c.stage })),
        unmapped: unmappedColumns(titles, wf),
        type: type?.key ?? null,
        overridden: !!wf.projectOverrides[String(id)],
        tasks: ds.tasks.filter((t) => t.groupId === id).length,
      };
    });
    return { projects: rows.sort((a, b) => a.name.localeCompare(b.name)) };
  });

  app.put('/api/workflow', async (req, reply) => {
    const v = await viewer(req);
    if (!v.admin) return reply.code(403).send({ error: 'Only admins can change the workflow.' });
    const parsed = workflowInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: parsed.error.issues[0]?.message ?? 'Invalid workflow.', errors: [] });
    const wf = parsed.data as Workflow;
    const errors = validateWorkflow(wf);
    if (errors.length) return reply.code(400).send({ error: errors[0], errors });
    current = await deps.store.save(wf, v.userId);
    applyWorkflow(wf);
    await deps.changed();
    return { ok: true, version: current.version };
  });

  app.get('/api/workflow/history', async (req, reply) => {
    if (!(await admin(req))) return reply.code(403).send({ error: 'Admins only.' });
    return { versions: await deps.store.history(50) };
  });

  // Restoring a version saves it again as the newest (the history keeps every step).
  app.post('/api/workflow/restore/:version', async (req, reply) => {
    const v = await viewer(req);
    if (!v.admin) return reply.code(403).send({ error: 'Only admins can change the workflow.' });
    const { version } = z.object({ version: z.coerce.number().int().min(0) }).parse(req.params);
    const wf = version === 0 ? DEFAULT_WORKFLOW : (await deps.store.get(version))?.workflow;
    if (!wf) return reply.code(404).send({ error: 'No such version.' });
    current = await deps.store.save(wf, v.userId);
    applyWorkflow(wf);
    await deps.changed();
    return { ok: true, version: current.version };
  });
}
