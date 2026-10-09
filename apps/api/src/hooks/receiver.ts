// POST /hooks/bitrix (SRS 8.2): check the application token, queue the event, return 200 at once.
import formbody from '@fastify/formbody';
import type { FastifyInstance } from 'fastify';
import type { Enqueue } from '../sync/worker';
import {
  applicationToken,
  parseHookEvent,
  redactAuth,
  tokenMatches,
  type HookEvent,
} from './parse';

export interface ReceiverDeps {
  /** BITRIX_OUTBOUND_TOKEN; when empty every call is refused. */
  token: string | undefined;
  enqueue?: Enqueue;
  /** Keeps the call (without auth) for debugging, NFR-10. */
  record?: (
    event: string,
    taskId: number | null,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onAccepted?: (e: HookEvent) => void;
}

export async function hookRoutes(app: FastifyInstance, deps: ReceiverDeps) {
  await app.register(formbody);

  app.post('/hooks/bitrix', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!deps.token) {
      req.log.warn('outbound webhook call refused: BITRIX_OUTBOUND_TOKEN is not set');
      return reply.code(503).send({ error: 'Webhook not configured' });
    }
    if (!tokenMatches(applicationToken(body), deps.token)) {
      req.log.warn('outbound webhook call refused: application token mismatch');
      return reply.code(401).send({ error: 'Invalid application token' });
    }
    if (!deps.enqueue) return reply.code(503).send({ error: 'Queue unavailable' });

    const parsed = parseHookEvent(body);
    const event = typeof body.event === 'string' ? body.event : 'UNKNOWN';
    await deps
      .record?.(event, parsed?.taskId ?? null, redactAuth(body))
      .catch((err: Error) => req.log.error({ err: err.message }, 'could not store webhook event'));
    if (!parsed) return { ok: true, ignored: event };

    await deps.enqueue({ taskId: parsed.taskId, event: parsed.event });
    deps.onAccepted?.(parsed);
    req.log.info({ event: parsed.event, taskId: parsed.taskId }, 'webhook queued');
    return { ok: true };
  });
}
