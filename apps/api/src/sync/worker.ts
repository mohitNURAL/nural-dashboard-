// Sync worker (SRS 7 module 2, 8.3): webhook events -> 2 s debounce -> batched tasks.task.get
// -> applyTasks -> task.changed on the bus.
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { batch, type Call, type Command } from '../bitrix';
import type { EventBus } from '../events/bus';
import type { TaskEvent } from '../hooks/parse';
import { applyTasks, markDeleted } from './apply';
import { TASK_SELECT, type BitrixTask } from './mapTask';

export const TASK_QUEUE = 'task-events';
export const DEBOUNCE_MS = 2000;
const GATHER_MS = 250;

interface TaskJob {
  taskId: number;
  event: TaskEvent;
}

export type Enqueue = (job: TaskJob) => Promise<void>;

const connect = (url: string) => new Redis(url, { maxRetriesPerRequest: null });

/**
 * Producer side. One job per task (jobId = task-<id>), delayed 2 s: further events for the
 * same task while it waits are absorbed, which merges bursts of edits into one fetch.
 */
export function createTaskQueue(redisUrl: string) {
  const queue = new Queue<TaskJob>(TASK_QUEUE, { connection: connect(redisUrl) });
  const enqueue: Enqueue = async (job) => {
    await queue.add(job.event, job, {
      jobId: `task-${job.taskId}`,
      delay: DEBOUNCE_MS,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: { age: 86_400 },
    });
  };
  return { enqueue, close: () => queue.close() };
}

/** Collects task IDs that become ready together and fetches them in one batch. */
function createGatherer(fetchMany: (ids: number[]) => Promise<void>) {
  let pending = new Map<number, { resolve: () => void; reject: (e: unknown) => void }[]>();
  let timer: NodeJS.Timeout | undefined;

  const flush = async () => {
    timer = undefined;
    const current = pending;
    pending = new Map();
    const ids = [...current.keys()];
    try {
      await fetchMany(ids);
      for (const waiters of current.values()) for (const w of waiters) w.resolve();
    } catch (err) {
      for (const waiters of current.values()) for (const w of waiters) w.reject(err);
    }
  };

  return (id: number) =>
    new Promise<void>((resolve, reject) => {
      const waiters = pending.get(id) ?? [];
      waiters.push({ resolve, reject });
      pending.set(id, waiters);
      if (pending.size >= 50) {
        clearTimeout(timer);
        void flush();
      } else {
        timer ??= setTimeout(() => void flush(), GATHER_MS);
      }
    });
}

export interface WorkerDeps {
  redisUrl: string;
  call: Call;
  bus: EventBus;
  log: { info: (o: object, msg: string) => void; error: (o: object, msg: string) => void };
}

export function startTaskWorker({ redisUrl, call, bus, log }: WorkerDeps) {
  const fetchMany = async (ids: number[]) => {
    const commands: Record<string, Command> = {};
    for (const id of ids) {
      commands[`t${id}`] = {
        method: 'tasks.task.get',
        params: { taskId: id, select: [...TASK_SELECT, 'RELATED_TASKS', 'CHANGED_BY'] },
      };
    }
    const res = await batch<{ task?: BitrixTask } | unknown[]>(call, commands, {
      allowErrors: true,
    });
    const found: BitrixTask[] = [];
    const gone: number[] = [];
    for (const id of ids) {
      const r = res.result[`t${id}`];
      const task = r && !Array.isArray(r) ? r.task : undefined;
      // Deleted, or no longer visible to the webhook user: result is [] or an error.
      if (task) found.push(task);
      else gone.push(id);
    }
    const started = Date.now();
    const { changes, stageEvents } = await applyTasks(call, found, { source: 'webhook', bus });
    const deleted = await markDeleted(gone, 'webhook', bus);
    log.info(
      {
        tasks: ids,
        changed: changes.length,
        deleted: deleted.length,
        stageEvents,
        ms: Date.now() - started,
      },
      'synced tasks from webhook',
    );
  };
  const gather = createGatherer(fetchMany);

  const worker = new Worker<TaskJob>(
    TASK_QUEUE,
    // Every event, including ONTASKDELETE, is confirmed by fetching the task: a deleted task
    // comes back empty and is marked deleted.
    (job) => gather(job.data.taskId),
    { connection: connect(redisUrl), concurrency: 50 },
  );
  worker.on('failed', (job, err) =>
    log.error({ taskId: job?.data.taskId, err: err.message }, 'task sync failed'),
  );
  worker.on('error', (err) => log.error({ err: err.message }, 'task worker error'));
  return { close: () => worker.close() };
}
