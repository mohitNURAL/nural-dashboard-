// Task actions from the dashboard (SRS 7, Task actions): move a task to another column of its
// board, or change its Bitrix24 status (Pending, In progress, Deferred, Completed). They run as
// the signed-in person, with their own OAuth token, through the shared rate limiter, and each is
// recorded in task_actions. The webhook stays read-only.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TokenStore } from '../auth/tokens';
import { BitrixError, type BitrixResponse, type Params } from '../bitrix';
import type { RequestDataset } from '../auth/roles';
import type { Enqueue } from '../sync/worker';

/** Bitrix24 task statuses the dropdown offers, and their codes. */
export const TASK_STATUSES = ['pending', 'inProgress', 'deferred', 'completed'] as const;
export type TaskStatusChoice = (typeof TASK_STATUSES)[number];

/** Bitrix24 STATUS code → the dropdown's value. 1 new and 2 pending are both "pending". */
export function statusOf(code: number): TaskStatusChoice | 'supposedlyCompleted' | 'declined' {
  if (code === 3) return 'inProgress';
  if (code === 4) return 'supposedlyCompleted';
  if (code === 5) return 'completed';
  if (code === 6) return 'deferred';
  if (code === 7) return 'declined';
  return 'pending';
}

/**
 * The Bitrix24 actions that take a task from its current status to the chosen one, the same as
 * the buttons in Bitrix24. A finished or deferred task is renewed first where Bitrix24 needs it.
 */
export function statusPlan(code: number, target: TaskStatusChoice): string[] {
  const closed = code === 4 || code === 5 || code === 6 || code === 7;
  switch (target) {
    case 'completed':
      return code === 5
        ? []
        : code === 6
          ? ['tasks.task.renew', 'tasks.task.complete']
          : ['tasks.task.complete'];
    case 'deferred':
      return code === 6
        ? []
        : code === 5 || code === 4 || code === 7
          ? ['tasks.task.renew', 'tasks.task.defer']
          : ['tasks.task.defer'];
    case 'inProgress':
      return code === 3
        ? []
        : closed
          ? ['tasks.task.renew', 'tasks.task.start']
          : ['tasks.task.start'];
    case 'pending':
      return code === 3 ? ['tasks.task.pause'] : closed ? ['tasks.task.renew'] : [];
  }
}

export interface ActionDeps {
  /** Runs one task action as the person (limiter.userCall). */
  userCall?: <T = unknown>(
    method: string,
    params: Params,
    token: string,
  ) => Promise<BitrixResponse<T>>;
  tokens?: TokenStore;
  /** Re-syncs the task so every open dashboard updates. */
  enqueue?: Enqueue;
  record?: (a: {
    userId: number;
    taskId: number;
    /** 'move', 'status', or 'field:<name>' (project, assignee, tags, priority, deadline). */
    action: string;
    fromValue: string | null;
    toValue: string;
    ok: boolean;
    error: string | null;
  }) => Promise<void>;
  /** The signed-in person, or null (sign-in off or signed out). */
  userOf: (req: unknown) => { userId: number; name: string } | null;
  /** Access of the person (NFR-4): members may change only stage, status and tags. */
  viewer?: (req: FastifyRequest) => Promise<{ full: boolean }>;
  /** Clock for the future-deadline rule (tests). */
  now?: () => Date;
}

/** Fields the dashboard can change, and who may: full access all, members only tags. */
export const TASK_FIELDS = ['project', 'assignee', 'tags', 'priority', 'deadline'] as const;
export type TaskField = (typeof TASK_FIELDS)[number];
export const MEMBER_FIELDS: readonly TaskField[] = ['tags'];
const PRIORITY_CODE = { low: '0', normal: '1', high: '2' } as const;

/** Splits "bug, Backend App,  urgent" into clean, distinct tags. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim();
    // Case-insensitive duplicates keep the first spelling.
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** A Bitrix24 error as a short message for the person; permission problems read as such. */
function explain(err: unknown): { status: number; message: string } {
  if (err instanceof BitrixError && /insufficient_scope/i.test(`${err.code} ${err.description}`)) {
    return {
      status: 403,
      message:
        'The Bitrix24 app is missing the Tasks permission. Ask the Bitrix24 admin to add it, then sign out and sign in again.',
    };
  }
  if (err instanceof BitrixError) {
    if (
      /ACCESS_DENIED|insufficient_scope|NO_AUTH|expired_token|invalid_token/i.test(
        `${err.code} ${err.description}`,
      )
    ) {
      return { status: 403, message: `Bitrix24 refused: ${err.description || err.code}` };
    }
    return { status: 400, message: `Bitrix24: ${err.description || err.code}` };
  }
  return { status: 502, message: 'Bitrix24 could not be reached. Try again.' };
}

export function actionRoutes(app: FastifyInstance, getDataset: RequestDataset, deps: ActionDeps) {
  /** The person and their token, or a reply explaining why not. */
  async function actor(req: unknown, reply: FastifyReply) {
    const user = deps.userOf(req);
    if (!user || !user.userId || !deps.tokens || !deps.userCall) {
      reply.code(403).send({ error: 'Sign in with Bitrix24 to change tasks.' });
      return null;
    }
    const token = await deps.tokens.get(user.userId).catch(() => null);
    if (!token) {
      reply.code(403).send({ error: 'Sign in again with Bitrix24 to change tasks.' });
      return null;
    }
    // No check of the token's scope label: portals report it differently (e.g. just "app"),
    // so Bitrix24 itself decides; a missing permission comes back as insufficient_scope.
    return { user, token: token.accessToken };
  }

  async function finish(
    a: {
      userId: number;
      taskId: number;
      action: string;
      fromValue: string | null;
      toValue: string;
    },
    run: () => Promise<void>,
    reply: FastifyReply,
  ) {
    try {
      await run();
    } catch (err) {
      const { status, message } = explain(err);
      await deps.record?.({ ...a, ok: false, error: message }).catch(() => undefined);
      return reply.code(status).send({ error: message });
    }
    await deps.record?.({ ...a, ok: true, error: null }).catch(() => undefined);
    // Bitrix24 can answer true without moving; the re-sync shows what really happened.
    await deps.enqueue?.({ taskId: a.taskId, event: 'ONTASKUPDATE' }).catch(() => undefined);
    return { ok: true };
  }

  app.post('/api/tasks/:id/stage', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { stageId } = z.object({ stageId: z.coerce.number().int().positive() }).parse(req.body);
    const ds = await getDataset(req);
    const t = ds.byId.get(id);
    if (!t) return reply.code(404).send({ error: 'Task not found' });
    const board = ds.boards?.get(t.groupId) ?? [];
    const to = board.find((s) => s.id === stageId);
    if (!to) return reply.code(400).send({ error: 'That column is not on this task’s board.' });
    const who = await actor(req, reply);
    if (!who) return reply;
    return finish(
      {
        userId: who.user.userId,
        taskId: id,
        action: 'move',
        fromValue: t.stageTitle,
        toValue: to.title,
      },
      async () => {
        await deps.userCall!('task.stages.movetask', { id, stageId }, who.token);
      },
      reply,
    );
  });

  app.post('/api/tasks/:id/status', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { status } = z.object({ status: z.enum(TASK_STATUSES) }).parse(req.body);
    const ds = await getDataset(req);
    const t = ds.byId.get(id);
    if (!t) return reply.code(404).send({ error: 'Task not found' });
    const plan = statusPlan(t.status, status);
    if (!plan.length) return { ok: true, unchanged: true };
    const who = await actor(req, reply);
    if (!who) return reply;
    return finish(
      {
        userId: who.user.userId,
        taskId: id,
        action: 'status',
        fromValue: statusOf(t.status),
        toValue: status,
      },
      async () => {
        for (const method of plan) await deps.userCall!(method, { taskId: id }, who.token);
      },
      reply,
    );
  });

  // Change one field of a task (project, assignee, tags, priority or deadline) with
  // tasks.task.update. Full access may change any of them; members only tags (NFR-4).
  app.post('/api/tasks/:id/field', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ field: z.enum(TASK_FIELDS), value: z.union([z.string(), z.number()]) })
      .parse(req.body);
    const ds = await getDataset(req);
    const t = ds.byId.get(id);
    if (!t) return reply.code(404).send({ error: 'Task not found' });
    const v = (await deps.viewer?.(req)) ?? { full: true };
    if (!v.full && !MEMBER_FIELDS.includes(body.field)) {
      return reply
        .code(403)
        .send({ error: 'Only managers can change the project, assignee, priority or deadline.' });
    }

    let fields: Record<string, unknown>;
    let fromValue: string | null;
    let toValue: string;
    switch (body.field) {
      case 'project': {
        const to = Number(body.value);
        const p = ds.projects.get(to);
        if (!p) return reply.code(400).send({ error: 'Unknown project.' });
        fields = { GROUP_ID: to };
        fromValue = ds.projects.get(t.groupId)?.name ?? String(t.groupId);
        toValue = p.name;
        break;
      }
      case 'assignee': {
        const to = Number(body.value);
        const u = ds.users.get(to);
        if (!u?.active) return reply.code(400).send({ error: 'Unknown or inactive person.' });
        fields = { RESPONSIBLE_ID: to };
        fromValue = ds.users.get(t.responsibleId)?.name ?? String(t.responsibleId);
        toValue = u.name;
        break;
      }
      case 'tags': {
        const tags = parseTags(String(body.value));
        if (tags.length > 30 || tags.some((x) => x.length > 60)) {
          return reply.code(400).send({ error: 'Too many or too long tags.' });
        }
        fields = { TAGS: tags };
        fromValue = (t.tags ?? []).join(', ');
        toValue = tags.join(', ');
        break;
      }
      case 'priority': {
        const key = String(body.value) as keyof typeof PRIORITY_CODE;
        if (!(key in PRIORITY_CODE)) return reply.code(400).send({ error: 'Unknown priority.' });
        fields = { PRIORITY: PRIORITY_CODE[key] };
        fromValue = ['low', 'normal', 'high'][t.priority] ?? null;
        toValue = key;
        break;
      }
      case 'deadline': {
        const to = new Date(String(body.value));
        const now = deps.now?.() ?? new Date();
        if (Number.isNaN(to.getTime())) return reply.code(400).send({ error: 'Not a date.' });
        if (to <= now)
          return reply.code(400).send({ error: 'The deadline must be in the future.' });
        fields = { DEADLINE: to.toISOString() };
        fromValue = t.deadline?.toISOString() ?? null;
        toValue = to.toISOString();
        break;
      }
    }

    const who = await actor(req, reply);
    if (!who) return reply;
    return finish(
      { userId: who.user.userId, taskId: id, action: `field:${body.field}`, fromValue, toValue },
      async () => {
        await deps.userCall!('tasks.task.update', { taskId: id, fields }, who.token);
      },
      reply,
    );
  });

  // Choices for the project and assignee dropdowns (full access only; members cannot change them).
  app.get('/api/tasks/edit-options', async (req, reply) => {
    const v = (await deps.viewer?.(req)) ?? { full: true };
    if (!v.full) return reply.code(403).send({ error: 'Managers only.' });
    const ds = await getDataset(req);
    return {
      projects: [...ds.projects.values()].sort((a, b) => a.name.localeCompare(b.name)),
      people: [...ds.users.values()]
        .filter((u) => u.active)
        .map((u) => ({ id: u.id, name: u.name, deptGroup: u.deptGroup }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}
