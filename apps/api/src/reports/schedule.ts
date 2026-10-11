// One timed job per report (BullMQ job scheduler, cron in IST), kept in step with the reports:
// added or changed on save, removed when paused or deleted. Runs only where the sync worker runs
// (the production server), so a laptop copy never sends reports.
import { Queue, Worker } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { Redis } from 'ioredis';
import { cronOf, type Report } from './model';

const QUEUE = 'reports';
const jobId = (id: number) => `report-${id}`;

export interface ReportScheduler {
  sync(report: Report): Promise<void>;
  remove(id: number): Promise<void>;
  close(): Promise<void>;
}

export function startReportScheduler(opts: {
  redisUrl: string;
  tz: string;
  run: (reportId: number) => Promise<unknown>;
  log: Pick<FastifyBaseLogger, 'info' | 'error'>;
}): ReportScheduler {
  const connect = () => new Redis(opts.redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE, { connection: connect() });
  const worker = new Worker(
    QUEUE,
    async (job) => {
      const id = Number((job.data as { id: number }).id);
      const started = Date.now();
      const summary = await opts.run(id);
      opts.log.info({ report: id, ms: Date.now() - started, summary }, 'report run');
    },
    { connection: connect(), concurrency: 1 },
  );
  worker.on('failed', (job, err) =>
    opts.log.error({ report: job?.data, err: err.message }, 'report run failed'),
  );
  return {
    async sync(report) {
      if (report.state === 'paused') {
        await queue.removeJobScheduler(jobId(report.id));
        return;
      }
      await queue.upsertJobScheduler(
        jobId(report.id),
        { pattern: cronOf(report.definition), tz: opts.tz },
        {
          name: 'report',
          data: { id: report.id },
          opts: { removeOnComplete: 50, removeOnFail: 50 },
        },
      );
    },
    async remove(id) {
      await queue.removeJobScheduler(jobId(id));
    },
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
