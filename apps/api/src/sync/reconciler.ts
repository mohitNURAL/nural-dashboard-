// Scheduled sync (SRS 7 modules 3-4, 8.4): outbound webhooks are best-effort, so a
// 10-minute reconcile catches missed changes, the directory refreshes hourly and a full
// resync runs nightly. BullMQ job schedulers keep each to one run across processes.
import { Queue, Worker } from 'bullmq';
import { eq, lt, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { listAll, type Call } from '../bitrix';
import { db, schema } from '../db/client';
import type { EventBus } from '../events/bus';
import { applyTasks } from './apply';
import { syncDirectory } from './directory';
import { initialLoad } from './initialLoad';
import { TASK_SELECT, type BitrixTask } from './mapTask';
import type { WorkerDeps } from './worker';

export const SCHEDULE_QUEUE = 'sync-schedules';
const RECONCILE_KEY = 'reconcile';
const OVERLAP_MS = 2 * 60_000;
const WEBHOOK_RETENTION_DAYS = 30;

async function cursor(): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(schema.syncState)
    .where(eq(schema.syncState.key, RECONCILE_KEY));
  const c = row?.cursor as { since?: string } | null | undefined;
  return c?.since ? new Date(c.since) : null;
}

async function saveCursor(since: Date) {
  const value = { key: RECONCILE_KEY, lastRun: new Date(), cursor: { since: since.toISOString() } };
  await db
    .insert(schema.syncState)
    .values(value)
    .onConflictDoUpdate({
      target: schema.syncState.key,
      set: { lastRun: value.lastRun, cursor: value.cursor },
    });
}

/** Tasks changed since the last run (with overlap), in every group, through applyTasks. */
export async function reconcile(call: Call, bus?: EventBus) {
  const startedAt = new Date();
  const last = await cursor();
  // First run: look back one day; the initial load covered everything before that.
  const since = new Date((last?.getTime() ?? startedAt.getTime() - 86_400_000) - OVERLAP_MS);
  const tasks = await listAll<BitrixTask>(
    call,
    'tasks.task.list',
    {
      filter: { '>CHANGED_DATE': since.toISOString() },
      select: TASK_SELECT,
      order: { CHANGED_DATE: 'asc' },
    },
    (r) => ((r as { tasks?: BitrixTask[] } | null)?.tasks ?? []) as BitrixTask[],
  );
  const { changes, stageEvents } = await applyTasks(call, tasks, { source: 'reconcile', bus });
  await saveCursor(startedAt);
  return { since, fetched: tasks.length, changed: changes.length, stageEvents };
}

let failuresInARow = 0;

/** Reconcile runs that failed in a row (NFR-9 health); reset by a successful run. */
export const reconcileFailures = () => failuresInARow;

export async function lastReconcileAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastRun: schema.syncState.lastRun })
    .from(schema.syncState)
    .where(eq(schema.syncState.key, RECONCILE_KEY));
  return row?.lastRun ?? null;
}

export async function startSchedules({
  redisUrl,
  call,
  bus,
  log,
  tz,
}: WorkerDeps & { tz: string }) {
  const connect = () => new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(SCHEDULE_QUEUE, { connection: connect() });
  const opts = { removeOnComplete: 50, removeOnFail: 50 };
  await queue.upsertJobScheduler('reconcile', { every: 10 * 60_000 }, { name: 'reconcile', opts });
  await queue.upsertJobScheduler('directory', { every: 60 * 60_000 }, { name: 'directory', opts });
  await queue.upsertJobScheduler(
    'nightly',
    { pattern: '0 2 * * *', tz },
    { name: 'nightly', opts },
  );

  const worker = new Worker(
    SCHEDULE_QUEUE,
    async (job) => {
      const started = Date.now();
      if (job.name === 'reconcile') {
        const r = await reconcile(call, bus);
        log.info({ ...r, ms: Date.now() - started }, 'reconcile done');
      } else if (job.name === 'directory') {
        const d = await syncDirectory(call);
        log.info(
          { users: d.users, groups: d.groups, memberLists: d.memberLists, stages: d.stages },
          'directory sync done',
        );
      } else if (job.name === 'nightly') {
        const load = await initialLoad(call);
        const removed = await db
          .delete(schema.webhookEvents)
          .where(
            lt(
              schema.webhookEvents.receivedAt,
              sql`now() - make_interval(days => ${WEBHOOK_RETENTION_DAYS})`,
            ),
          )
          .returning({ id: schema.webhookEvents.id });
        await bus.publish({
          type: 'task.changed',
          taskId: 0,
          title: 'Nightly resync',
          projectId: 0,
          stage: null,
          fromStage: null,
          stageGroup: null,
          isIssue: false,
          isNew: false,
          reopened: false,
          deleted: false,
          source: 'nightly',
          at: new Date().toISOString(),
        });
        log.info(
          {
            tasks: load.tasks,
            deletedMarked: load.deletedMarked,
            webhookEventsRemoved: removed.length,
          },
          'nightly resync done',
        );
      }
    },
    { connection: connect(), concurrency: 1 },
  );
  worker.on('failed', (job, err) => {
    if (job?.name === 'reconcile') failuresInARow += 1;
    log.error({ job: job?.name, err: err.message }, 'scheduled sync failed');
  });
  worker.on('completed', (job) => {
    if (job.name === 'reconcile') failuresInARow = 0;
  });
  worker.on('error', (err) => log.error({ err: err.message }, 'schedule worker error'));

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
