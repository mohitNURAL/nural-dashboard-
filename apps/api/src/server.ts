import cors from '@fastify/cors';
import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import { authRoutes, sessionUserOf, type AuthOptions } from './auth/routes';
import { loadRoles, requestDataset, resolveFor, type RolesConfig } from './auth/roles';
import { SESSION_DAYS } from './auth/session';
import { accessRoutes, memoryAccessStore, type AccessStore } from './routes/access';
import { employeeRoutes } from './routes/employees';
import { insightRoutes } from './routes/insights';
import { actionRoutes, type ActionDeps } from './routes/actions';
import { feedbackRoutes, memoryFeedbackStore, type FeedbackStore } from './routes/feedback';
import { memoryPrefsStore, prefsRoutes, type PrefsStore } from './routes/prefs';
import type { Call } from './bitrix/limiter';
import { config } from './config';
import { cachedDataset, loadDataset, type DatasetProvider } from './data/dataset';
import { createMemoryBus, type EventBus } from './events/bus';
import { healthStatus, workTime } from './health';
import { hookRoutes, type ReceiverDeps } from './hooks/receiver';
import { alertRoutes } from './routes/alerts';
import { devRoutes } from './routes/dev';
import { filterRoutes } from './routes/filters';
import { kpiRoutes } from './routes/kpi';
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
  health?: {
    worker: 'on' | 'off';
    lastReconcileAt?: () => Promise<Date | null>;
    /** Reconcile runs failed in a row (NFR-9). */
    reconcileFailures?: () => number;
  };
  /** Sign-in; defaults to the config (AUTH, client ID and secret, SESSION_SECRET). */
  auth?: Partial<AuthOptions>;
  /** Who sees everything (NFR-4); defaults to config/roles.json. */
  roles?: RolesConfig;
  /** Support tab feedback; defaults to an in-memory store (Postgres in production). */
  feedback?: FeedbackStore;
  /** Per-person settings (sign-in count, layout, guided tour); in-memory by default. */
  prefs?: PrefsStore;
  /** Access overrides set by admins (SRS 7, Access permissions); in-memory by default. */
  access?: AccessStore;
  /** Task actions (move stage, change status) as the signed-in person; off without them. */
  actions?: Omit<Partial<ActionDeps>, 'userOf'>;
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
  auth = {},
  actions = {},
  roles,
  feedback,
  prefs,
  access,
}: ServerOptions = {}) {
  const app = Fastify({
    logger: logger && {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: [
        'req.headers.authorization',
        'req.body.auth',
        '*.BITRIX_INBOUND_URL',
        '*.BITRIX_OUTBOUND_TOKEN',
        '*.BITRIX_CLIENT_SECRET',
        '*.SESSION_SECRET',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
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

  const startedAt = new Date();
  const work = workTime(config.APP_TIMEZONE, config.WORK_DAYS, config.WORK_HOURS);
  // 503 when degraded (NFR-9), so an external uptime monitor alerts on it.
  app.get('/health', async (_req, reply) => {
    const reconcileFailures = health.reconcileFailures?.() ?? 0;
    const { status, reasons } = healthStatus({
      now: now?.() ?? new Date(),
      lastWebhookOrStart: lastWebhookAt ?? startedAt,
      webhooksExpected: health.worker === 'on' && !!config.BITRIX_OUTBOUND_TOKEN,
      reconcileFailures,
      work,
    });
    if (status !== 'ok') reply.code(503);
    return {
      status,
      reasons,
      time: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      worker: health.worker,
      lastWebhookAt,
      lastChangeAt,
      lastReconcileAt: (await health.lastReconcileAt?.().catch(() => null)) ?? null,
      reconcileFailures,
    };
  });

  let dataset = getDataset;
  if (!dataset) {
    const cache = cachedDataset(loadDataset);
    // A change anywhere invalidates the in-memory dataset; the next query reloads it.
    bus.subscribe(() => cache.invalidate());
    dataset = cache.get;
  }
  const ds = dataset;
  // Access overrides, kept in memory and reloaded on every change so it applies at once.
  const rolesCfg = roles ?? loadRoles();
  const accessStore = access ?? memoryAccessStore();
  let grants = await accessStore.load();
  // NFR-4: every route reads data through this, per request; a member gets only their tasks.
  const scoping = requestDataset(
    ds,
    rolesCfg,
    (auth.mode ?? config.AUTH) === 'bitrix',
    () => grants,
  );
  const prefStore = prefs ?? memoryPrefsStore();
  // Last active (People directory): at most one write a minute per person.
  const lastSeen = new Map<number, number>();
  authRoutes(app, {
    onSignIn: (userId) => prefStore.signIn(userId),
    onSeen: (userId) => {
      const t = Date.now();
      if (t - (lastSeen.get(userId) ?? 0) < 60_000) return;
      lastSeen.set(userId, t);
      void prefStore.seen(userId, new Date(t)).catch(() => undefined);
    },
    describeViewer: async (req) => {
      const v = await scoping.viewer(req);
      const d = await ds();
      return {
        role: v.role,
        full: v.full,
        kpi: v.kpi,
        support: v.support,
        inbox: v.inbox,
        employees: v.employees,
        editAll: v.editAll,
        admin: v.admin,
        dept: d.kpiDept?.get(v.userId) ?? 'other',
        position: d.users.get(v.userId)?.workPosition ?? null,
      };
    },
    mode: config.AUTH,
    clientId: config.BITRIX_CLIENT_ID,
    clientSecret: config.BITRIX_CLIENT_SECRET,
    sessionSecret: config.SESSION_SECRET,
    portalOrigin: new URL(config.BITRIX_INBOUND_URL).origin,
    secure: (config.PUBLIC_BASE_URL ?? '').startsWith('https://'),
    callbackUrl: config.PUBLIC_BASE_URL
      ? new URL('/api/auth/callback', config.PUBLIC_BASE_URL).toString()
      : undefined,
    findUser: async (id) => (await ds()).users.get(id),
    ...auth,
  });
  const opts = { tz: config.APP_TIMEZONE, now };
  devRoutes(app, scoping.dataset, opts);
  qaRoutes(app, scoping.dataset, opts);
  taskRoutes(app, scoping.dataset, opts, { describe, viewer: scoping.viewer });
  filterRoutes(app, scoping.dataset, opts);
  alertRoutes(app, scoping.dataset, opts);
  kpiRoutes(app, scoping.dataset, opts, scoping.viewer);
  insightRoutes(app, scoping.dataset, opts, scoping.viewer);
  actionRoutes(app, scoping.dataset, {
    now,
    ...actions,
    userOf: sessionUserOf,
    viewer: scoping.viewer,
  });
  streamRoutes(app, bus, config.WEB_ORIGIN, scoping.viewer);
  feedbackRoutes(app, scoping.dataset, feedback ?? memoryFeedbackStore(), scoping.viewer);
  prefsRoutes(app, prefStore, scoping.viewer);
  accessRoutes(app, scoping.dataset, scoping.viewer, {
    store: accessStore,
    roles: rolesCfg,
    grants: () => grants,
    refresh: async () => {
      grants = await accessStore.load();
    },
  });
  employeeRoutes(app, scoping.dataset, scoping.viewer, {
    ...opts,
    activity: () => prefStore.activity(),
    resolve: (id, d) => resolveFor(id, d, rolesCfg, grants),
    sessionDays: SESSION_DAYS,
  });
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

  // Task actions run as the signed-in person: their Bitrix24 tokens, kept encrypted.
  const tokens =
    config.AUTH === 'bitrix'
      ? await (
          await import('./auth/tokens')
        ).dbTokenStore({
          secret: config.SESSION_SECRET!,
          clientId: config.BITRIX_CLIENT_ID!,
          clientSecret: config.BITRIX_CLIENT_SECRET!,
        })
      : undefined;
  const app = await buildServer({
    bus,
    auth: { saveTokens: tokens?.save },
    feedback: await (await import('./routes/feedback')).dbFeedbackStore(),
    prefs: await (await import('./routes/prefs')).dbPrefsStore(),
    access: await (await import('./routes/access')).dbAccessStore(),
    actions: {
      userCall: bitrix.getBitrix().userCall,
      tokens,
      enqueue: queue.enqueue,
      record: async (a) => {
        await dbm.db.insert(dbm.schema.taskActions).values(a);
      },
    },
    hooks: {
      enqueue: queue.enqueue,
      record: async (event, taskId, payload) => {
        await dbm.db.insert(dbm.schema.webhookEvents).values({ event, taskId, payload });
      },
    },
    health: {
      worker: workerOn ? 'on' : 'off',
      lastReconcileAt: reconciler.lastReconcileAt,
      reconcileFailures: reconciler.reconcileFailures,
    },
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
