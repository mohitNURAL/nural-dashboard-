import cors from '@fastify/cors';
import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import type { Call } from './bitrix/limiter';
import { config } from './config';
import { cachedDataset, loadDataset, type DatasetProvider } from './data/dataset';
import { createMemoryBus, type EventBus } from './events/bus';
import { hookRoutes, type ReceiverDeps } from './hooks/receiver';
import { devRoutes } from './routes/dev';
import { filterRoutes } from './routes/filters';
import { qaRoutes } from './routes/qa';
import { streamRoutes } from './routes/stream';
import { taskRoutes } from './routes/tasks';

export interface ServerOptions {
  /** Defaults to Postgres with a 30 s cache, refreshed on every change; tests pass a fixture. */
  getDataset?: DatasetProvider;
  now?: () => Date;
  logger?: boolean;
  /** Change notifications; defaults to an in-process bus. */
  bus?: EventBus;
  /** Webhook receiver dependencies; without `enqueue` the receiver answers 503. */
  hooks?: Partial<ReceiverDeps>;
  /** For /health (NFR-9). */
  health?: { worker: 'on' | 'off'; lastReconcileAt?: () => Promise<Date | null> };
  /** Task description for the drawer, read live from Bitrix24 (not stored by the sync). */
  describe?: (taskId: number) => Promise<string | null>;
}

export async function buildServer({
  getDataset,
  now,
  logger = true,
  bus = createMemoryBus(),
  hooks = {},
  health = { worker: 'off' },
  describe,
}: ServerOptions = {}) {
  const app = Fastify({
    logger: logger && {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: [
        'req.headers.authorization',
        'req.body.auth',
        '*.BITRIX_INBOUND_URL',
        '*.BITRIX_OUTBOUND_TOKEN',
      ],
      ...(process.env.NODE_ENV !== 'production' && process.stdout.isTTY
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
  });

  await app.register(cors, { origin: config.WEB_ORIGIN });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid query',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    reply.log.error(err);
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    return reply.code(status).send({ error: status === 500 ? 'Internal error' : err.message });
  });

  let lastWebhookAt: Date | null = null;
  let lastChangeAt: Date | null = null;
  bus.subscribe(() => {
    lastChangeAt = new Date();
  });

  app.get('/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    worker: health.worker,
    lastWebhookAt,
    lastChangeAt,
    lastReconcileAt: (await health.lastReconcileAt?.().catch(() => null)) ?? null,
  }));

  let dataset = getDataset;
  if (!dataset) {
    const cache = cachedDataset(loadDataset);
    // A change anywhere invalidates the in-memory dataset; the next query reloads it.
    bus.subscribe(() => cache.invalidate());
    dataset = cache.get;
  }
  const opts = { tz: config.APP_TIMEZONE, now };
  devRoutes(app, dataset, opts);
  qaRoutes(app, dataset, opts);
  taskRoutes(app, dataset, opts, { describe });
  filterRoutes(app, dataset, opts);
  streamRoutes(app, bus, config.WEB_ORIGIN);
  await hookRoutes(app, {
    token: config.BITRIX_OUTBOUND_TOKEN,
    ...hooks,
    onAccepted: (e) => {
      lastWebhookAt = new Date();
      hooks.onAccepted?.(e);
    },
  });

  return app;
}

const DESCRIPTION_TTL_MS = 5 * 60_000;

/** Reads a task description through the rate limiter (read-only tasks.task.get), cached 5 min. */
function describer(call: Call) {
  const cache = new Map<number, { at: number; text: string | null }>();
  return async (taskId: number) => {
    const hit = cache.get(taskId);
    if (hit && Date.now() - hit.at < DESCRIPTION_TTL_MS) return hit.text;
    const res = await call<{ task?: { description?: string | null } }>('tasks.task.get', {
      taskId,
      select: ['ID', 'DESCRIPTION'],
    });
    const text = res.result.task?.description?.trim() || null;
    cache.set(taskId, { at: Date.now(), text });
    return text;
  };
}

/** Production wiring: Redis bus and queue, Bitrix24 limiter, sync worker and schedules. */
async function main() {
  const [{ createRedisBus }, { createTaskQueue, startTaskWorker }, reconciler, bitrix, dbm] =
    await Promise.all([
      import('./events/bus'),
      import('./sync/worker'),
      import('./sync/reconciler'),
      import('./bitrix'),
      import('./db/client'),
    ]);
  const bus = createRedisBus(config.REDIS_URL);
  const queue = createTaskQueue(config.REDIS_URL);
  const workerOn = config.SYNC_WORKER === 'on';

  const app = await buildServer({
    bus,
    hooks: {
      enqueue: queue.enqueue,
      record: async (event, taskId, payload) => {
        await dbm.db.insert(dbm.schema.webhookEvents).values({ event, taskId, payload });
      },
    },
    health: { worker: workerOn ? 'on' : 'off', lastReconcileAt: reconciler.lastReconcileAt },
    describe: describer(bitrix.getBitrix().call),
  });

  const closers: (() => Promise<unknown>)[] = [];
  if (workerOn) {
    const { call } = bitrix.getBitrix();
    const deps = { redisUrl: config.REDIS_URL, call, bus, log: app.log };
    closers.push(startTaskWorker(deps).close);
    closers.push((await reconciler.startSchedules({ ...deps, tz: config.APP_TIMEZONE })).close);
  }

  const shutdown = async () => {
    await app.close();
    for (const close of closers) await close().catch(() => undefined);
    await queue.close();
    await bus.close();
    await bitrix.closeBitrix();
    await dbm.closeDb();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  await app.listen({ host: '0.0.0.0', port: config.PORT });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
