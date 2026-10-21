// Daily update check-ins to the directors (2026-10-17, SRS 24): a Slack direct message to each
// recipient in config/daily-checkins.json (Deepak only since 2026-10-21) at 11:30, who has and has not
// planned their day, and at 19:00, who has and has not wrapped up. Working days only; one send per
// day and kind (recorded in app_settings), so a restart never sends twice. Scheduled only where the
// sync worker runs (the server) and only while the file says enabled. Admins can send themselves a
// preview from the report page.
import {
  dailyCompliance,
  dailyDay,
  isWorkingDay,
  slackCheckIn,
  type WorkCalendar,
} from '@nural/shared';
import { Queue, Worker } from 'bullmq';
import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import { z } from 'zod';
import type { Viewer } from '../auth/roles';
import type { Dataset, DatasetProvider } from '../data/dataset';
import type { Slack } from '../integrations/slack';
import type { DailyStore, SettingsStore } from './daily';

export type CheckInKind = 'plan' | 'wrap';

export interface CheckInConfig {
  enabled: boolean;
  recipients: number[];
  plan: string;
  wrap: string;
}

/** config/daily-checkins.json; off when missing. */
export function loadCheckInConfig(): CheckInConfig {
  const file = fileURLToPath(new URL('../../../../config/daily-checkins.json', import.meta.url));
  const off: CheckInConfig = { enabled: false, recipients: [], plan: '11:30', wrap: '19:00' };
  if (!existsSync(file)) return off;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<CheckInConfig>;
  const hhmm = (v: unknown, d: string) =>
    typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : d;
  return {
    enabled: raw.enabled === true,
    recipients: Array.isArray(raw.recipients)
      ? raw.recipients.map(Number).filter(Number.isInteger)
      : [],
    plan: hhmm(raw.plan, off.plan),
    wrap: hhmm(raw.wrap, off.wrap),
  };
}

export interface CheckInDeps {
  dataset: DatasetProvider;
  store: DailyStore;
  settings: SettingsStore;
  slack: Slack;
  calendar: WorkCalendar;
  tz: string;
  config: CheckInConfig;
  expected: (ds: Dataset) => number[];
  reportUrl?: string;
  now?: () => Date;
}

const dayLabelOf = (now: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(now);

/** The message for today, from everyone's posts so far. */
export async function checkInMessage(kind: CheckInKind, deps: CheckInDeps) {
  const at = deps.now?.() ?? new Date();
  const day = dailyDay(at, deps.tz);
  const ds = await deps.dataset();
  const expected = deps.expected(ds);
  const rows = await deps.store.range(day, day);
  const c = dailyCompliance(
    expected,
    rows.map((r) => ({ userId: r.userId, plannedAt: r.plannedAt, wrappedAt: r.wrappedAt })),
  );
  const name = (id: number) => ds.users.get(id)?.name ?? `User ${id}`;
  const names = (ids: number[]) => ids.map(name).sort((a, b) => a.localeCompare(b));
  return {
    day,
    ds,
    message: slackCheckIn(
      kind,
      dayLabelOf(at, deps.tz),
      {
        expected: c.expected.length,
        planned: names(c.planned),
        notPlanned: names(c.notPlanned),
        wrapped: names(c.wrapped),
        notWrapped: names(c.notWrapped),
        plannedNotWrapped: names(c.plannedNotWrapped),
      },
      deps.reportUrl,
    ),
  };
}

/** The scheduled send: working days only, once per day and kind, to every recipient. */
export async function runCheckIn(kind: CheckInKind, deps: CheckInDeps) {
  const at = deps.now?.() ?? new Date();
  const local = at.getTime() + deps.calendar.offsetMin * 60_000;
  if (!deps.config.enabled) return { sent: 0, skipped: 'disabled' };
  if (!isWorkingDay(Math.floor(local / 86_400_000), deps.calendar))
    return { sent: 0, skipped: 'not a working day' };
  if (!deps.slack.connected) return { sent: 0, skipped: 'Slack not connected' };
  const { day, ds, message } = await checkInMessage(kind, deps);
  const key = `dailyCheckin.${day}.${kind}`;
  if (await deps.settings.get(key)) return { sent: 0, skipped: 'already sent' };
  let sent = 0;
  const failed: number[] = [];
  for (const id of deps.config.recipients) {
    const email = ds.users.get(id)?.email;
    if (!email) {
      failed.push(id);
      continue;
    }
    try {
      await deps.slack.toPerson(email, message);
      sent += 1;
    } catch {
      failed.push(id);
    }
  }
  await deps.settings.set(key, { at: at.toISOString(), sent, failed }, 0);
  return { sent, failed };
}

/** Two timed jobs (BullMQ job schedulers, cron in IST): the plan and the wrap-up check-ins. */
export function startCheckIns(opts: {
  redisUrl: string;
  tz: string;
  config: CheckInConfig;
  run: (kind: CheckInKind) => Promise<unknown>;
  log: Pick<FastifyBaseLogger, 'info' | 'error'>;
}) {
  const connect = () => new Redis(opts.redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('daily-checkins', { connection: connect() });
  const worker = new Worker(
    'daily-checkins',
    async (job) => {
      const kind = (job.data as { kind: CheckInKind }).kind;
      opts.log.info({ kind, result: await opts.run(kind) }, 'daily check-in');
    },
    { connection: connect(), concurrency: 1 },
  );
  worker.on('failed', (job, err) =>
    opts.log.error({ kind: job?.data, err: err.message }, 'daily check-in failed'),
  );
  const cron = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${m} ${h} * * *`;
  };
  void Promise.all(
    (['plan', 'wrap'] as const).map((kind) =>
      queue.upsertJobScheduler(
        `daily-checkin-${kind}`,
        { pattern: cron(opts.config[kind]), tz: opts.tz },
        { name: 'checkin', data: { kind }, opts: { removeOnComplete: 20, removeOnFail: 20 } },
      ),
    ),
  ).catch((err: Error) => opts.log.error({ err: err.message }, 'daily check-ins not scheduled'));
  return {
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}

/**
 * Admins: preview the check-in (GET) or send it to themselves only (POST), to see it before it
 * goes to the directors.
 */
export function checkInRoutes(
  app: FastifyInstance,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  deps: CheckInDeps,
) {
  const kindOf = z.object({ kind: z.enum(['plan', 'wrap']).default('plan') });
  app.get('/api/report/daily/checkin', async (req, reply) => {
    const v = await viewer(req);
    if (!v.admin) return reply.code(403).send({ error: 'Admins only.' });
    const { kind } = kindOf.parse(req.query);
    const { message } = await checkInMessage(kind, deps);
    return {
      enabled: deps.config.enabled,
      recipients: deps.config.recipients,
      times: { plan: deps.config.plan, wrap: deps.config.wrap },
      message,
    };
  });
  app.post('/api/report/daily/checkin/test', async (req, reply) => {
    const v = await viewer(req);
    if (!v.admin) return reply.code(403).send({ error: 'Admins only.' });
    const { kind } = kindOf.parse(req.body ?? {});
    const { ds, message } = await checkInMessage(kind, deps);
    const email = ds.users.get(v.userId)?.email;
    if (!deps.slack.connected) return reply.code(400).send({ error: 'Slack is not connected.' });
    if (!email) return reply.code(400).send({ error: 'Your Bitrix24 profile has no e-mail.' });
    await deps.slack.toPerson(email, message);
    return { ok: true, to: email };
  });
}
