// pnpm sync:deadlines [--restart]: reads every task's deadline changes from Bitrix24 history into
// task_deadline_events (Tasks in hand planner, SRS 25). Read-only, resumable; safe to re-run.
import { closeBitrix, getBitrix } from '../bitrix';
import { closeDb } from '../db/client';
import { runMigrations } from '../db/migrate';
import { deadlineBackfill } from '../sync/historyBackfill';

const log = (msg: string) => console.log(msg);

async function main() {
  const started = Date.now();
  await runMigrations();
  const d = await deadlineBackfill(getBitrix().call, {
    restart: process.argv.includes('--restart'),
    log,
  });
  log(
    `Done in ${Math.round((Date.now() - started) / 1000)}s: scanned ${d.tasksScanned} tasks, ` +
      `${d.eventsInserted} new deadline changes` +
      (d.failedTasks ? `, ${d.failedTasks} tasks failed (re-run to retry)` : ''),
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBitrix();
    await closeDb();
  });
