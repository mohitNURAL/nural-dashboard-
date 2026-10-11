// Every Bitrix24 call goes through this BullMQ queue. The rate limit is stored in Redis,
// so it holds across the API server, the sync worker and scripts (SRS 8.1, NFR-5).
import { Queue, QueueEvents, UnrecoverableError, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { BitrixError, type BitrixResponse, type Params, type RawCall } from './client';
import { assertPeopleAction, assertReadOnly, assertUserAction } from './methods';

export const QUEUE_NAME = 'bitrix-calls';
export const CALLS_PER_SECOND = 2;

interface CallJob {
  method: string;
  params: Params;
  /** A task action with the person's own token (params.auth), run by `userRawCall`. */
  user?: boolean;
}

export type Call = <T = unknown>(method: string, params?: Params) => Promise<BitrixResponse<T>>;

export interface BitrixLimiter {
  call: Call;
  /**
   * A task action (move, complete) as the signed-in person, with their OAuth token. Same queue
   * and rate limit as every other call.
   */
  userCall: <T = unknown>(
    method: string,
    params: Params,
    token: string,
  ) => Promise<BitrixResponse<T>>;
  /**
   * A people or department change (SRS 17) by an admin, with their own OAuth token: only the
   * methods and fields in methods.ts PEOPLE_FIELDS.
   */
  peopleCall: <T = unknown>(
    method: string,
    params: Params,
    token: string,
  ) => Promise<BitrixResponse<T>>;
  /** Number of calls this process has completed (for diagnostics). */
  readonly callCount: number;
  close(): Promise<void>;
}

export interface LimiterOptions {
  redisUrl: string;
  /** Required when this process runs the worker that executes calls. */
  rawCall?: RawCall;
  /** Executes task actions (portal REST with a user token); without it they fail. */
  userRawCall?: RawCall;
  /** Set false in producer-only processes; another process must run the worker. */
  worker?: boolean;
  attempts?: number;
  backoffMs?: number;
  callTimeoutMs?: number;
}

// Error details cross Redis as a plain message, so the code is encoded in it and parsed back.
const ERROR_RE = /^(\S+): \[([^\]]+)\] ?([\s\S]*)$/;

export function createBitrixLimiter({
  redisUrl,
  rawCall,
  userRawCall,
  worker: runWorker = true,
  attempts = 5,
  backoffMs = 1000,
  callTimeoutMs = 120_000,
}: LimiterOptions): BitrixLimiter {
  const connections: Redis[] = [];
  const connect = () => {
    const c = new Redis(redisUrl, { maxRetriesPerRequest: null });
    connections.push(c);
    return c;
  };

  const queue = new Queue<CallJob, BitrixResponse>(QUEUE_NAME, {
    connection: connect(),
    defaultJobOptions: {
      attempts,
      backoff: { type: 'exponential', delay: backoffMs },
      removeOnComplete: { age: 60, count: 1000 },
      removeOnFail: { age: 3600, count: 1000 },
    },
  });
  const events = new QueueEvents(QUEUE_NAME, { connection: connect() });

  let worker: Worker<CallJob, BitrixResponse> | undefined;
  if (runWorker) {
    if (!rawCall) throw new Error('createBitrixLimiter: rawCall is required when worker is on');
    worker = new Worker<CallJob, BitrixResponse>(
      QUEUE_NAME,
      async (job) => {
        try {
          if (job.data.user) {
            if (!userRawCall) throw new UnrecoverableError('task actions are not configured');
            return await userRawCall(job.data.method, job.data.params);
          }
          return await rawCall(job.data.method, job.data.params);
        } catch (err) {
          // Retryable errors (QUERY_LIMIT_EXCEEDED, 5xx, network) are retried with backoff.
          if (err instanceof BitrixError && !err.retryable) {
            throw new UnrecoverableError(err.message);
          }
          throw err;
        }
      },
      {
        connection: connect(),
        concurrency: CALLS_PER_SECOND * 2,
        limiter: { max: CALLS_PER_SECOND, duration: 1000 },
      },
    );
    // Without a listener, worker errors surface as unhandled 'error' events.
    worker.on('error', () => {});
  }

  let callCount = 0;
  const ready = events.waitUntilReady();

  async function call<T>(method: string, params: Params = {}): Promise<BitrixResponse<T>> {
    assertReadOnly(method);
    return run<T>({ method, params });
  }

  async function userCall<T>(method: string, params: Params, token: string) {
    assertUserAction(method);
    // The token must not outlive the call in Redis, failed or not.
    return run<T>({ method, params: { ...params, auth: token }, user: true }, true);
  }

  async function peopleCall<T>(method: string, params: Params, token: string) {
    assertPeopleAction(method, params);
    return run<T>({ method, params: { ...params, auth: token }, user: true }, true);
  }

  async function run<T>(data: CallJob, forget = false): Promise<BitrixResponse<T>> {
    await ready;
    const job = await queue.add(
      data.method,
      data,
      forget ? { removeOnComplete: true, removeOnFail: true } : undefined,
    );
    try {
      const out = (await job.waitUntilFinished(events, callTimeoutMs)) as BitrixResponse<T>;
      callCount++;
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const m = ERROR_RE.exec(msg);
      if (m) throw new BitrixError(m[1]!, m[2]!, m[3] ?? '', false);
      throw err;
    }
  }

  return {
    call,
    userCall,
    peopleCall,
    get callCount() {
      return callCount;
    },
    async close() {
      await worker?.close();
      await events.close();
      await queue.close();
      await Promise.all(connections.map((c) => c.quit().catch(() => c.disconnect())));
    },
  };
}
