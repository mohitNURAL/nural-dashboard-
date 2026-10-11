// Task actions from the dashboard (SRS 7, Task actions): move a task to another column of its
// board, or change its Bitrix24 status (Pending, In progress, Deferred, Completed). They run as
// the signed-in person, with their own OAuth token, through the shared rate limiter, and each is
// recorded in task_actions. The webhook stays read-only.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { TokenStore } from '../auth/tokens';
import { BitrixError, type BitrixResponse, type Params } from '../bitrix';
import type { DatasetProvider } from '../data/dataset';
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
    action: 'move' | 'status';
    fromValue: string | null;
    toValue: string;
    ok: boolean;
    error: string | null;
  }) => Promise<void>;
  /** The signed-in person, or null (sign-in off or signed out). */
  userOf: (req: unknown) => { userId: number; name: string } | null;
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

export function actionRoutes(app: FastifyInstance, getDataset: DatasetProvider, deps: ActionDeps) {
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
      action: 'move' | 'status';
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
    const ds = await getDataset();
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
    const ds = await getDataset();
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
}
