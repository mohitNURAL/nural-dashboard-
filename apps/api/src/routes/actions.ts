// Task edits from the dashboard (SRS 7, Task actions): Kanban column, Bitrix24 status, and the
// fields project, assignee, tags, priority and deadline, for one task or in bulk. Every edit is
// checked by one function (`prepare`): ok with its Bitrix24 calls, skip (already so), or error
// (not allowed or inconsistent). Edits run as the signed-in person, with their own OAuth token,
// through the shared rate limiter, and each is recorded in task_actions. The webhook stays
// read-only.
import { STAGE_TITLES, type MetricTask, type StageTitle } from '@nural/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset } from '../auth/roles';
import type { TokenStore } from '../auth/tokens';
import { BitrixError, type BitrixResponse, type Params } from '../bitrix';
import type { Dataset } from '../data/dataset';
import type { Enqueue } from '../sync/worker';

/** Bitrix24 task statuses the dropdown offers, and their codes. */
export const TASK_STATUSES = ['pending', 'inProgress', 'deferred', 'completed'] as const;
export type TaskStatusChoice = (typeof TASK_STATUSES)[number];

const STATUS_WORD: Record<TaskStatusChoice, string> = {
  pending: 'Pending',
  inProgress: 'In progress',
  deferred: 'Deferred',
  completed: 'Completed',
};

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

/** Fields the dashboard can change, and who may: full access all, members only tags. */
export const TASK_FIELDS = ['project', 'assignee', 'tags', 'priority', 'deadline'] as const;
export type TaskField = (typeof TASK_FIELDS)[number];
export const MEMBER_FIELDS: readonly TaskField[] = ['tags'];
const PRIORITY_CODE = { low: '0', normal: '1', high: '2' } as const;
const PRIORITY_NAMES = ['low', 'normal', 'high'] as const;
/** Most tasks one bulk edit may touch (2 Bitrix24 calls/s: about a minute). */
export const BULK_MAX = 100;

/** Splits "bug, Backend App,  urgent" into clean, distinct tags (first spelling kept). */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

/** One requested change. Stage: a board column (stageId) or a dashboard stage across boards. */
export const editSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stage'),
    stageId: z.coerce.number().int().positive().optional(),
    stage: z.enum(STAGE_TITLES).optional(),
  }),
  z.object({ kind: z.literal('status'), status: z.enum(TASK_STATUSES) }),
  z.object({
    kind: z.literal('field'),
    field: z.enum(TASK_FIELDS),
    value: z.union([z.string(), z.number()]),
    /** Tags: replace the list (default) or add to it. */
    tagsMode: z.enum(['replace', 'add']).optional(),
  }),
]);
export type Edit = z.infer<typeof editSchema>;

interface Call {
  method: string;
  params: Params;
}

/** What an edit means for one task. */
export type Prepared =
  | {
      state: 'ok';
      calls: Call[];
      audit: { action: string; fromValue: string | null; toValue: string };
      /** e.g. "moved to QA Backlog". */
      label: string;
    }
  | { state: 'skip'; reason: string }
  | { state: 'error'; reason: string; status: number };

const err = (reason: string, status = 400): Prepared => ({ state: 'error', reason, status });
const skip = (reason: string): Prepared => ({ state: 'skip', reason });

/** The task's board column; "never moved" (0) is the board's first To do column. */
function currentColumnId(t: MetricTask, board: { id: number; stage: StageTitle | null }[]) {
  const id = Number(t.stageId ?? 0);
  return id || ((board.find((s) => s.stage === 'To do') ?? board[0])?.id ?? 0);
}

/**
 * Checks one edit on one task: allowed for this person, consistent with the task (its board has
 * the column, the person is active, the deadline is ahead), and whether anything would change.
 */
export function prepare(
  ds: Dataset,
  full: boolean,
  t: MetricTask,
  edit: Edit,
  now: Date,
): Prepared {
  const projectName = (id: number) => ds.projects.get(id)?.name ?? `project ${id}`;
  switch (edit.kind) {
    case 'stage': {
      const board = t.groupId > 0 ? (ds.boards?.get(t.groupId) ?? []) : [];
      if (!board.length) return err('Not on a Kanban board (no project), so it has no columns.');
      const to = edit.stageId
        ? board.find((s) => s.id === edit.stageId)
        : edit.stage
          ? board.find((s) => s.stage === edit.stage)
          : undefined;
      if (!to) {
        return err(
          edit.stage
            ? `Its board (${projectName(t.groupId)}) has no "${edit.stage}" column.`
            : `That column is not on its board (${projectName(t.groupId)}).`,
        );
      }
      if (to.id === currentColumnId(t, board)) return skip(`Already in ${to.title}.`);
      return {
        state: 'ok',
        calls: [{ method: 'task.stages.movetask', params: { id: t.id, stageId: to.id } }],
        audit: { action: 'move', fromValue: t.stageTitle, toValue: to.title },
        label: `moved to ${to.title}`,
      };
    }
    case 'status': {
      const plan = statusPlan(t.status, edit.status);
      if (!plan.length) return skip(`Already ${STATUS_WORD[edit.status]}.`);
      return {
        state: 'ok',
        calls: plan.map((method) => ({ method, params: { taskId: t.id } })),
        audit: { action: 'status', fromValue: statusOf(t.status), toValue: edit.status },
        label: STATUS_WORD[edit.status],
      };
    }
    case 'field': {
      if (!full && !MEMBER_FIELDS.includes(edit.field)) {
        return err('Only managers can change the project, assignee, priority or deadline.', 403);
      }
      const update = (
        fields: Record<string, unknown>,
        fromValue: string | null,
        toValue: string,
        label: string,
      ): Prepared => ({
        state: 'ok',
        calls: [{ method: 'tasks.task.update', params: { taskId: t.id, fields } }],
        audit: { action: `field:${edit.field}`, fromValue, toValue },
        label,
      });
      switch (edit.field) {
        case 'project': {
          const to = Number(edit.value);
          if (!ds.projects.get(to)) return err('Unknown project.');
          if (to === t.groupId) return skip(`Already in ${projectName(to)}.`);
          return update(
            { GROUP_ID: to },
            projectName(t.groupId),
            projectName(to),
            `moved to ${projectName(to)}`,
          );
        }
        case 'assignee': {
          const to = Number(edit.value);
          const u = ds.users.get(to);
          if (!u) return err('Unknown person.');
          if (!u.active) return err(`${u.name} is no longer active.`);
          if (to === t.responsibleId) return skip(`Already assigned to ${u.name}.`);
          const from = ds.users.get(t.responsibleId)?.name ?? String(t.responsibleId);
          return update({ RESPONSIBLE_ID: to }, from, u.name, `assigned to ${u.name}`);
        }
        case 'tags': {
          const typed = parseTags(String(edit.value));
          const current = t.tags ?? [];
          const tags =
            edit.tagsMode === 'add' ? parseTags([...current, ...typed].join(',')) : typed;
          if (tags.length > 30 || tags.some((x) => x.length > 60)) {
            return err('Too many or too long tags.');
          }
          const same =
            tags.length === current.length &&
            tags.every((x) => current.some((c) => c.toLowerCase() === x.toLowerCase()));
          if (same) return skip('Tags already so.');
          return update({ TAGS: tags }, current.join(', '), tags.join(', '), 'tags saved');
        }
        case 'priority': {
          const key = String(edit.value) as keyof typeof PRIORITY_CODE;
          if (!(key in PRIORITY_CODE)) return err('Unknown priority.');
          if (PRIORITY_NAMES[t.priority] === key) return skip(`Already ${key} priority.`);
          return update(
            { PRIORITY: PRIORITY_CODE[key] },
            PRIORITY_NAMES[t.priority] ?? null,
            key,
            `priority ${key}`,
          );
        }
        case 'deadline': {
          const to = new Date(String(edit.value));
          if (Number.isNaN(to.getTime())) return err('Not a date.');
          if (to <= now) return err('The deadline must be in the future.');
          if (t.deadline && t.deadline.getTime() === to.getTime()) {
            return skip('Deadline already so.');
          }
          return update(
            { DEADLINE: to.toISOString() },
            t.deadline?.toISOString() ?? null,
            to.toISOString(),
            'deadline changed',
          );
        }
      }
    }
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
    /** 'move', 'status', or 'field:<name>'. */
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

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** A Bitrix24 error as a short message for the person; permission problems read as such. */
function explain(e: unknown): { status: number; message: string } {
  if (e instanceof BitrixError && /insufficient_scope/i.test(`${e.code} ${e.description}`)) {
    return {
      status: 403,
      message:
        'The Bitrix24 app is missing the Tasks permission. Ask the Bitrix24 admin to add it, then sign out and sign in again.',
    };
  }
  if (e instanceof BitrixError) {
    if (/ACCESS_DENIED|NO_AUTH|expired_token|invalid_token/i.test(`${e.code} ${e.description}`)) {
      return { status: 403, message: `Bitrix24 refused: ${e.description || e.code}` };
    }
    return { status: 400, message: `Bitrix24: ${e.description || e.code}` };
  }
  return { status: 502, message: 'Bitrix24 could not be reached. Try again.' };
}

export function actionRoutes(app: FastifyInstance, getDataset: RequestDataset, deps: ActionDeps) {
  const isFull = async (req: FastifyRequest) => ((await deps.viewer?.(req)) ?? { full: true }).full;

  /** The person and their token, or the reason they cannot edit. */
  async function actor(req: unknown) {
    const user = deps.userOf(req);
    if (!user || !user.userId || !deps.tokens || !deps.userCall) {
      return { error: 'Sign in with Bitrix24 to change tasks.' } as const;
    }
    const token = await deps.tokens.get(user.userId).catch(() => null);
    if (!token) return { error: 'Sign in again with Bitrix24 to change tasks.' } as const;
    // No check of the token's scope label: portals report it differently (e.g. just "app"),
    // so Bitrix24 itself decides; a missing permission comes back as insufficient_scope.
    return { user, token: token.accessToken } as const;
  }

  /** Runs a prepared edit: its calls in order, the audit row and the re-sync. */
  async function run(
    who: { user: { userId: number }; token: string },
    taskId: number,
    p: Extract<Prepared, { state: 'ok' }>,
  ): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    const a = { userId: who.user.userId, taskId, ...p.audit };
    try {
      for (const c of p.calls) await deps.userCall!(c.method, c.params, who.token);
    } catch (e) {
      const { status, message } = explain(e);
      await deps.record?.({ ...a, ok: false, error: message }).catch(() => undefined);
      return { ok: false, status, message };
    }
    await deps.record?.({ ...a, ok: true, error: null }).catch(() => undefined);
    // Bitrix24 can answer true without moving; the re-sync shows what really happened.
    await deps.enqueue?.({ taskId, event: 'ONTASKUPDATE' }).catch(() => undefined);
    return { ok: true };
  }

  /** One edit on one task (the cells of the grids and the task view). */
  async function single(req: FastifyRequest, reply: FastifyReply, edit: Edit) {
    const { id } = idParam.parse(req.params);
    const ds = await getDataset(req);
    const t = ds.byId.get(id);
    if (!t) return reply.code(404).send({ error: 'Task not found' });
    const p = prepare(ds, await isFull(req), t, edit, deps.now?.() ?? new Date());
    if (p.state === 'error') return reply.code(p.status).send({ error: p.reason });
    if (p.state === 'skip') return { ok: true, unchanged: true, reason: p.reason };
    const who = await actor(req);
    if ('error' in who) return reply.code(403).send({ error: who.error });
    const r = await run(who, id, p);
    return r.ok ? { ok: true } : reply.code(r.status).send({ error: r.message });
  }

  app.post('/api/tasks/:id/stage', async (req, reply) => {
    const { stageId } = z.object({ stageId: z.coerce.number().int().positive() }).parse(req.body);
    return single(req, reply, { kind: 'stage', stageId });
  });

  app.post('/api/tasks/:id/status', async (req, reply) => {
    const { status } = z.object({ status: z.enum(TASK_STATUSES) }).parse(req.body);
    return single(req, reply, { kind: 'status', status });
  });

  app.post('/api/tasks/:id/field', async (req, reply) => {
    const body = z
      .object({
        field: z.enum(TASK_FIELDS),
        value: z.union([z.string(), z.number()]),
        tagsMode: z.enum(['replace', 'add']).optional(),
      })
      .parse(req.body);
    return single(req, reply, { kind: 'field', ...body });
  });

  // ---------------------------------------------------------------- bulk

  const bulkBody = z.object({
    ids: z.array(z.coerce.number().int().positive()).min(1).max(BULK_MAX),
    edit: editSchema,
  });

  /** Every selected task checked, without changing anything: ok, skip or error with a reason. */
  async function check(req: FastifyRequest) {
    const { ids, edit } = bulkBody.parse(req.body);
    const ds = await getDataset(req);
    const full = await isFull(req);
    const now = deps.now?.() ?? new Date();
    return [...new Set(ids)].map((id) => {
      const t = ds.byId.get(id);
      const p: Prepared = t
        ? prepare(ds, full, t, edit, now)
        : err('Not found, or outside your scope.', 404);
      return { id, p };
    });
  }

  const view = (r: { id: number; p: Prepared }) =>
    r.p.state === 'ok'
      ? { id: r.id, state: 'ok' as const, reason: r.p.label }
      : { id: r.id, state: r.p.state, reason: r.p.reason };

  app.post('/api/tasks/bulk/check', async (req) => ({ results: (await check(req)).map(view) }));

  // Applies the edit to the tasks that pass the check, one after another; the others are reported.
  app.post('/api/tasks/bulk/apply', async (req, reply) => {
    const results = await check(req);
    const who = await actor(req);
    if ('error' in who) return reply.code(403).send({ error: who.error });
    const out = [];
    for (const r of results) {
      if (r.p.state !== 'ok') {
        out.push(view(r));
        continue;
      }
      const done = await run(who, r.id, r.p);
      out.push(
        done.ok
          ? { id: r.id, state: 'done' as const, reason: r.p.label }
          : { id: r.id, state: 'failed' as const, reason: done.message },
      );
    }
    return { results: out };
  });

  // Choices for the project and assignee dropdowns (full access only; members cannot change them).
  app.get('/api/tasks/edit-options', async (req, reply) => {
    if (!(await isFull(req))) return reply.code(403).send({ error: 'Managers only.' });
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
