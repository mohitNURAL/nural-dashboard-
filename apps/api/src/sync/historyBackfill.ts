// Rebuilds stage moves made before go-live from tasks.task.history.list (SRS 8.4).
// Bitrix24 records STAGE changes with the column titles, so they map by title like tasks do.
// Resumable: progress is kept in sync_state, and history IDs are unique in task_stage_events.
import { canonicalStage } from '@nural/shared';
import { and, asc, eq, gt } from 'drizzle-orm';
import { batch, type Call, type Command } from '../bitrix';
import { db, schema } from '../db/client';
import { chunk } from '../db/upsert';
import { mapLimit } from './initialLoad';

const STATE_KEY = 'history_backfill';
const TASKS_PER_STEP = 100; // two batches of 50 in flight

interface HistoryEntry {
  id: number | string;
  createdDate: string;
  field: string;
  value?: { from?: string | null; to?: string | null } | null;
  user?: { id?: number | string } | null;
}

export type StageEventRow = typeof schema.taskStageEvents.$inferInsert;

export function stageEventsFrom(taskId: number, list: HistoryEntry[]): StageEventRow[] {
  return list
    .filter((e) => e.field === 'STAGE')
    .map((e) => {
      const from = e.value?.from?.trim() || null;
      const to = e.value?.to?.trim() || null;
      return {
        taskId,
        fromStage: from,
        toStage: to,
        fromCanonical: canonicalStage(from),
        toCanonical: canonicalStage(to),
        movedAt: new Date(e.createdDate),
        movedBy: Number(e.user?.id) || null,
        source: 'history',
        historyId: Number(e.id),
      };
    })
    .filter((r) => !Number.isNaN(r.movedAt.getTime()));
}

async function readCursor(): Promise<number> {
  const [row] = await db.select().from(schema.syncState).where(eq(schema.syncState.key, STATE_KEY));
  // Tasks loaded after a finished run have higher IDs, so they are still picked up.
  return (row?.cursor as { lastTaskId?: number } | null | undefined)?.lastTaskId ?? 0;
}

async function writeCursor(cursor: { lastTaskId: number; done: boolean }): Promise<void> {
  await db
    .insert(schema.syncState)
    .values({ key: STATE_KEY, lastRun: new Date(), cursor })
    .onConflictDoUpdate({ target: schema.syncState.key, set: { lastRun: new Date(), cursor } });
}

export interface BackfillSummary {
  tasksScanned: number;
  eventsInserted: number;
  failedTasks: number;
  resumedFrom: number;
}

export async function historyBackfill(
  call: Call,
  { restart = false, log = () => {} }: { restart?: boolean; log?: (msg: string) => void } = {},
): Promise<BackfillSummary> {
  const resumedFrom = restart ? 0 : await readCursor();
  const pending = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.deleted, false), gt(schema.tasks.id, resumedFrom)))
    .orderBy(asc(schema.tasks.id));
  if (resumedFrom > 0)
    log(`  history: resuming after task ${resumedFrom}, ${pending.length} to scan`);

  let eventsInserted = 0;
  let failedTasks = 0;
  const ids = pending.map((p) => p.id);
  const started = Date.now();

  for (const [step, stepIds] of chunk(ids, TASKS_PER_STEP).entries()) {
    const results = await mapLimit(chunk(stepIds, 50), 2, async (part) => {
      const commands: Record<string, Command> = {};
      for (const id of part) {
        commands[`h${id}`] = {
          method: 'tasks.task.history.list',
          params: { taskId: id, filter: { FIELD: 'STAGE' } },
        };
      }
      return {
        part,
        res: await batch<{ list?: HistoryEntry[] }>(call, commands, { allowErrors: true }),
      };
    });

    const rows: StageEventRow[] = [];
    for (const { part, res } of results) {
      for (const id of part) {
        if (res.errors[`h${id}`]) failedTasks++;
        rows.push(...stageEventsFrom(id, res.result[`h${id}`]?.list ?? []));
      }
    }
    for (const part of chunk(rows, 1000)) {
      const inserted = await db
        .insert(schema.taskStageEvents)
        .values(part)
        .onConflictDoNothing({ target: schema.taskStageEvents.historyId })
        .returning({ id: schema.taskStageEvents.id });
      eventsInserted += inserted.length;
    }
    await writeCursor({ lastTaskId: stepIds[stepIds.length - 1]!, done: false });

    const scanned = Math.min((step + 1) * TASKS_PER_STEP, ids.length);
    if (step % 10 === 9 || scanned === ids.length) {
      const secs = Math.round((Date.now() - started) / 1000);
      log(`  history: ${scanned}/${ids.length} tasks, ${eventsInserted} stage moves (${secs}s)`);
    }
  }
  if (ids.length) await writeCursor({ lastTaskId: ids[ids.length - 1]!, done: true });

  return { tasksScanned: ids.length, eventsInserted, failedTasks, resumedFrom };
}
