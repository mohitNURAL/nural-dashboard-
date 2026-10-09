// pnpm sync:initial [--skip-history] [--restart-history]
// Migrates, syncs the directory, loads all tasks, then backfills stage moves from history.
import { sql } from 'drizzle-orm';
import { closeBitrix, getBitrix } from '../bitrix';
import { closeDb, db, schema } from '../db/client';
import { runMigrations } from '../db/migrate';
import { syncDirectory } from '../sync/directory';
import { historyBackfill } from '../sync/historyBackfill';
import { initialLoad } from '../sync/initialLoad';

const args = new Set(process.argv.slice(2));
const log = (msg: string) => console.log(msg);

async function main() {
  const started = Date.now();
  const { call } = getBitrix();

  log('1/4 Migrating database');
  await runMigrations();

  log('2/4 Directory: users, departments, workgroups, stages');
  const dir = await syncDirectory(call);
  log(
    `  ${dir.users} users, ${dir.departments} departments, ${dir.groups} groups, ${dir.stages} stages`,
  );
  for (const s of dir.unmappedStages) log(`  unmapped stage: "${s.title}" in group ${s.groupId}`);

  log('3/4 Tasks');
  const load = await initialLoad(call, log);
  log(
    `  ${load.tasks} tasks (${load.issues} bug/feedback issues), ${load.parentLinks} parent links, ` +
      `${load.relatedLinks} related links, ${load.unmappedStageTasks} in unmapped stages, ` +
      `${load.deletedMarked} marked deleted`,
  );

  if (args.has('--skip-history')) {
    log('4/4 History backfill skipped (--skip-history)');
  } else {
    log('4/4 Stage history backfill');
    const h = await historyBackfill(call, { restart: args.has('--restart-history'), log });
    log(
      `  scanned ${h.tasksScanned} tasks, ${h.eventsInserted} new stage moves` +
        (h.failedTasks ? `, ${h.failedTasks} tasks failed (re-run to retry)` : ''),
    );
  }

  const [counts] = await db
    .select({
      tasks: sql<number>`(select count(*) from ${schema.tasks} where not deleted)::int`,
      events: sql<number>`(select count(*) from ${schema.taskStageEvents})::int`,
    })
    .from(sql`(select 1) as one`);
  log(
    `Done in ${Math.round((Date.now() - started) / 1000)}s: ${counts?.tasks} tasks and ` +
      `${counts?.events} stage events in Postgres.`,
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
