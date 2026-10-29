import cors from '@fastify/cors';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import { authRoutes, sessionUserOf, type AuthOptions } from './auth/routes';
import { loadRoles, requestDataset, resolveFor, type RolesConfig } from './auth/roles';
import { SESSION_DAYS } from './auth/session';
import { accessRoutes, memoryAccessStore, type AccessStore } from './routes/access';
import { employeeRoutes } from './routes/employees';
import { insightRoutes } from './routes/insights';
import { reportRoutes } from './routes/reports';
import { graphMailer, type Mailer } from './integrations/mail';
import { slackBot, type Slack } from './integrations/slack';
import { runReport, type EngineDeps } from './reports/engine';
import { startReportScheduler, type ReportScheduler } from './reports/schedule';
import { memoryReportStore, type ReportStore } from './reports/store';
import { actionRoutes, taskWriter, type ActionDeps } from './routes/actions';
import {
  DAILY_SETTING,
  dailyRoutes,
  memoryDailyStore,
  memorySettingsStore,
  type DailySetting,
  type DailyStore,
  type SettingsStore,
} from './routes/daily';
import { dailyReportRoutes } from './routes/dailyReport';
import {
  checkInRoutes,
  loadCheckInConfig,
  runCheckIn,
  startCheckIns,
  type CheckInConfig,
  type CheckInKind,
} from './routes/dailyCheckins';
import { DAILY_EXCLUDED, UNASSIGNED } from './routes/context';
import { kpiConfig } from './data/kpiConfig';
import { feedbackRoutes, memoryFeedbackStore, type FeedbackStore } from './routes/feedback';
import { helpRoutes, memoryHelpStore, type HelpStore } from './routes/help';
import {
  loadWorkflow,
  memoryWorkflowStore,
  workflowRoutes,
  type WorkflowStore,
} from './routes/workflow';
import { peopleRoutes, type PeopleDeps } from './routes/people';
import { memoryPrefsStore, prefsRoutes, type PrefsStore } from './routes/prefs';
import type { Call } from './bitrix/limiter';
import { config } from './config';
import { cachedDataset, loadDataset, type Dataset, type DatasetProvider } from './data/dataset';
import { createMemoryBus, type EventBus } from './events/bus';
import { healthStatus, workTime } from './health';
import { hookRoutes, type ReceiverDeps } from './hooks/receiver';
import { alertRoutes } from './routes/alerts';
import type { Viewer } from './auth/roles';
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
  /** Help feedback and its attachments (SRS 20); in-memory by default. */
  help?: HelpStore;
  /** The development workflow (SRS 22); in-memory by default (the standard workflow). */
  workflow?: WorkflowStore;
  /** Per-person settings (sign-in count, layout, guided tour); in-memory by default. */
  prefs?: PrefsStore;
  /** Access overrides set by admins (SRS 7, Access permissions); in-memory by default. */
  access?: AccessStore;
  /** Reports by mail and Slack (SRS 19): store, senders, and a scheduler where the worker runs. */
  reports?: {
    store?: ReportStore;
    mailer?: Mailer;
    slack?: Slack;
    makeScheduler?: (
      run: (reportId: number) => Promise<unknown>,
      log: FastifyBaseLogger,
    ) => ReportScheduler;
  };
  /** Task actions (move stage, change status) as the signed-in person; off without them. */
  actions?: Omit<Partial<ActionDeps>, 'userOf'>;
  /** People directory edits sent to Bitrix24 (SRS 17): admin's token, audit, directory sync. */
  people?: Pick<PeopleDeps, 'peopleCall' | 'tokens' | 'record' | 'refreshDirectory'>;
  /** Task description for the drawer, read live from Bitrix24 (not stored by the sync). */
  describe?: (taskId: number) => Promise<string | null>;
  /** Daily update (SRS 23): plans and wrap-ups, and the channel setting; in-memory by default. */
  daily?: {
    store?: DailyStore;
    settings?: SettingsStore;
    /** The 11:30 and 19:00 check-ins to the directors (SRS 24); only where the worker runs. */
    makeCheckIns?: (
      run: (kind: CheckInKind) => Promise<unknown>,
      config: CheckInConfig,
      log: FastifyBaseLogger,
    ) => { close: () => Promise<void> };
  };
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
  help,
  workflow,
  people,
  prefs,
  access,
  reports,
  daily,
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

  // The workflow every rule reads: the saved one, else the standard (SRS 22).
  const workflowStore = workflow ?? memoryWorkflowStore();
  await loadWorkflow(workflowStore);
  let dataset = getDataset;
  let invalidateDataset = () => {};
  if (!dataset) {
    const cache = cachedDataset(loadDataset);
    // A change anywhere invalidates the in-memory dataset; the next query reloads it.
    bus.subscribe(() => cache.invalidate());
    dataset = cache.get;
    invalidateDataset = cache.invalidate;
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
        dev: v.dev,
        qa: v.qa,
        support: v.support,
        inbox: v.inbox,
        insights: v.insights,
        workflow: v.workflow,
        projectTypes: v.projectTypes,
        org: v.org,
        people: v.people,
        employees: v.employees,
        editAll: v.editAll,
        admin: v.admin,
        connections: v.connections,
        mailing: v.mailing,
        helpFeedback: v.helpFeedback,
        helpInbox: v.helpInbox,
        helpDocs: v.helpDocs,
        helpFaq: v.helpFaq,
        dailyUpdate: v.dailyUpdate,
        dailyReport: v.dailyReport,
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
  // Each page's data needs that page's right (2026-10-12, Access permissions); the first prefix
  // that matches decides. KPI, Support, Access and the Help routes check their own.
  const PAGE_GUARD: [string, (v: Viewer) => boolean, string][] = [
    ['/api/dev/', (v) => v.dev, 'Development'],
    ['/api/qa/', (v) => v.qa, 'QA'],
    ['/api/insights', (v) => v.insights, 'Insights'],
    ['/api/workflow/projects', (v) => v.projectTypes || v.workflow, 'Project types'],
    ['/api/employees/tree', (v) => v.org, 'the Company tree'],
    // The people list also fills the person pickers of Mailing and Access permissions.
    ['/api/employees', (v) => v.people || v.mailing || v.admin, 'the People directory'],
    ['/api/reports', (v) => v.mailing, 'Mailing'],
    ['/api/daily', (v) => v.dailyUpdate, 'Daily update'],
    ['/api/report/daily', (v) => v.dailyReport, 'the Daily task update report'],
    ['/api/integrations/test', (v) => v.connections, 'Connections'],
    ['/api/integrations', (v) => v.connections || v.mailing, 'Integration'],
  ];
  app.addHook('preHandler', async (req, reply) => {
    const guard = PAGE_GUARD.find(([prefix]) => req.url.startsWith(prefix));
    if (guard && !guard[1](await scoping.viewer(req)))
      return reply.code(403).send({ error: `You have no access to ${guard[2]}.` });
  });
  devRoutes(app, scoping.dataset, opts, {
    pms: () =>
      new Set([
        ...rolesCfg.pms,
        ...[...grants.users].filter(([, g]) => g.role === 'pm').map(([id]) => id),
      ]),
  });
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
  helpRoutes(app, scoping.dataset, scoping.viewer, help ?? memoryHelpStore());
  workflowRoutes(app, scoping.dataset, scoping.viewer, {
    store: workflowStore,
    // Reload the data under the new workflow and tell every open page to refresh.
    changed: async () => {
      invalidateDataset();
      await bus
        .publish({
          type: 'task.changed',
          taskId: 0,
          title: 'Workflow updated',
          projectId: 0,
          stage: null,
          fromStage: null,
          stageGroup: null,
          isIssue: false,
          isNew: false,
          reopened: false,
          deleted: false,
          source: 'workflow',
          at: new Date().toISOString(),
        })
        .catch(() => undefined);
    },
  });
  prefsRoutes(app, prefStore, scoping.viewer);
  accessRoutes(app, scoping.dataset, scoping.viewer, {
    store: accessStore,
    roles: rolesCfg,
    grants: () => grants,
    refresh: async () => {
      grants = await accessStore.load();
    },
  });
  peopleRoutes(app, scoping.dataset, scoping.viewer, {
    ...people,
    userOf: sessionUserOf,
    access: accessStore,
    roles: rolesCfg,
    grants: () => grants,
    refreshGrants: async () => {
      grants = await accessStore.load();
    },
    refreshDirectory: async () => {
      await people?.refreshDirectory?.();
      invalidateDataset();
    },
  });
  // Reports: built from the full dataset, then scoped per recipient (reports/scope.ts).
  const reportStore = reports?.store ?? memoryReportStore();
  const engine: EngineDeps = {
    dataset: ds,
    roles: rolesCfg,
    grants: () => grants,
    mailer:
      reports?.mailer ??
      graphMailer({
        tenantId: config.MS_TENANT_ID,
        clientId: config.MS_CLIENT_ID,
        clientSecret: config.MS_CLIENT_SECRET,
        from: config.MAIL_FROM,
      }),
    slack: reports?.slack ?? slackBot(config.SLACK_BOT_TOKEN),
    store: reportStore,
    tz: config.APP_TIMEZONE,
    now: () => now?.() ?? new Date(),
    dashboardUrl: config.PUBLIC_BASE_URL ?? config.WEB_ORIGIN,
    slackPauseMs: 1100,
  };
  const scheduler = reports?.makeScheduler?.(async (id) => {
    const r = await reportStore.get(id);
    return r ? runReport(r, engine, { kind: 'scheduled' }) : null;
  }, app.log);
  if (scheduler) {
    void reportStore
      .list()
      .then((list) => Promise.all(list.map((r) => scheduler.sync(r))))
      .catch((err: Error) => app.log.error({ err: err.message }, 'report schedules not set'));
    app.addHook('onClose', async () => scheduler.close());
  }
  reportRoutes(app, scoping.viewer, { engine, store: reportStore, scheduler });
  // Daily update: the KPI calendar's holidays with the company's working days (WORK_DAYS).
  const cal = kpiConfig().calendar;
  const dailyStore = daily?.store ?? memoryDailyStore();
  const dailyCalendar = {
    ...cal,
    days: new Set(
      config.WORK_DAYS.split(',')
        .map((d) => Number(d.trim()))
        .filter(Boolean),
    ),
  };
  const dailySettings = daily?.settings ?? memorySettingsStore();
  const checkInConfig = loadCheckInConfig();
  dailyRoutes(app, scoping.dataset, scoping.viewer, {
    store: dailyStore,
    settings: dailySettings,
    slack: engine.slack,
    writer: taskWriter({ now, ...actions, userOf: sessionUserOf, viewer: scoping.viewer }),
    tz: config.APP_TIMEZONE,
    calendar: {
      ...cal,
      days: new Set(
        config.WORK_DAYS.split(',')
          .map((d) => Number(d.trim()))
          .filter(Boolean),
      ),
    },
    planBy: checkInConfig.plan,
    now,
  });
  // Report › Daily task update (SRS 24): expected = active people with the Daily update right,
  // not a placeholder and not left out in config/daily-exclude.json.
  const expectedToPost = (d: Dataset) =>
    [...d.users.values()]
      .filter(
        (u) =>
          u.active &&
          !UNASSIGNED.has(u.id) &&
          !DAILY_EXCLUDED.has(u.id) &&
          resolveFor(u.id, d, rolesCfg, grants).rights.dailyUpdate,
      )
      .map((u) => u.id);
  dailyReportRoutes(app, scoping.dataset, scoping.viewer, {
    store: dailyStore,
    calendar: dailyCalendar,
    tz: config.APP_TIMEZONE,
    planBy: checkInConfig.plan,
    now,
    expected: expectedToPost,
  });
  // Check-ins to the directors: previews for admins here; the timed sends only on the server.
  const checkIns = {
    dataset: ds,
    store: dailyStore,
    settings: dailySettings,
    slack: engine.slack,
    calendar: dailyCalendar,
    tz: config.APP_TIMEZONE,
    config: checkInConfig,
    expected: expectedToPost,
    channel: async () => (await dailySettings.get<DailySetting>(DAILY_SETTING))?.channel ?? null,
    reportUrl: `${config.PUBLIC_BASE_URL ?? config.WEB_ORIGIN ?? ''}/?tab=dailyreport`,
    now,
  };
  checkInRoutes(app, scoping.viewer, checkIns);
  const checkInJobs = daily?.makeCheckIns?.(
    (kind) => runCheckIn(kind, checkIns),
    checkIns.config,
    app.log,
  );
  if (checkInJobs) app.addHook('onClose', async () => checkInJobs.close());
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
          // Why Add task and task edits are greyed out for someone: they must sign in again.
          onRefreshFail: (userId, reason) =>
            app.log.warn({ userId, reason }, 'Bitrix24 sign-in could not be renewed'),
        })
      : undefined;
  const app = await buildServer({
    bus,
    auth: { saveTokens: tokens?.save },
    feedback: await (await import('./routes/feedback')).dbFeedbackStore(),
    help: await (await import('./routes/help')).dbHelpStore(),
    workflow: await (await import('./routes/workflow')).dbWorkflowStore(),
    prefs: await (await import('./routes/prefs')).dbPrefsStore(),
    access: await (await import('./routes/access')).dbAccessStore(),
    daily: {
      ...(await (await import('./routes/daily')).dbDailyStores()),
      // The directors' check-ins run only where the worker runs (the server), never on a laptop.
      makeCheckIns: workerOn
        ? (run, cfg, log) =>
            startCheckIns({
              redisUrl: config.REDIS_URL,
              tz: config.APP_TIMEZONE,
              config: cfg,
              run,
              log,
            })
        : undefined,
    },
    reports: {
      store: await (await import('./reports/store')).dbReportStore(),
      // Only where the worker runs (the server): a laptop copy never sends reports.
      makeScheduler: workerOn
        ? (run, log) =>
            startReportScheduler({ redisUrl: config.REDIS_URL, tz: config.APP_TIMEZONE, run, log })
        : undefined,
    },
    actions: {
      userCall: bitrix.getBitrix().userCall,
      tokens,
      enqueue: queue.enqueue,
      record: async (a) => {
        await dbm.db.insert(dbm.schema.taskActions).values(a);
      },
    },
    people: {
      peopleCall: bitrix.getBitrix().peopleCall,
      tokens,
      record: async (a) => {
        await dbm.db.insert(dbm.schema.peopleActions).values(a);
      },
      // Users and departments again from Bitrix24 (read-only webhook), at once.
      refreshDirectory: async () => {
        const { syncDirectory } = await import('./sync/directory');
        await syncDirectory(bitrix.getBitrix().call);
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
