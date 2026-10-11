// Applies freshly fetched tasks to Postgres and announces what changed (SRS 8.3 steps 4-5).
// Shared by the webhook worker, the 10-minute reconciler and the nightly resync.
import { canonicalStage, stageGroupOf } from '@nural/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { batch, type Call, type Command } from '../bitrix';
import { config } from '../config';
import { db, schema } from '../db/client';
import { chunk, excludedSet } from '../db/upsert';
import type { EventBus, TaskChanged } from '../events/bus';
import { syncGroupStages } from './directory';
import { diffTask, type StoredTask } from './diff';
import { stageEventsFrom, type HistoryEntry } from './historyBackfill';
import { loadStageMap, testingTeamIds } from './initialLoad';
import { mapTask, type BitrixTask, type TaskRow } from './mapTask';

export type ChangeSource = TaskChanged['source'];

interface ApplyOptions {
  source: ChangeSource;
  bus?: EventBus;
}

async function inScopeChecker() {
  const [groups, testers] = await Promise.all([
    db
      .select({ id: schema.workgroups.id, dev: schema.workgroups.isDevProject })
      .from(schema.workgroups),
    testingTeamIds(),
  ]);
  const known = new Map(groups.map((g) => [g.id, g.dev]));
  const scoped = config.DEV_GROUP_IDS.length > 0;
  const testerSet = new Set(testers);
  return (row: TaskRow) => {
    if (row.groupId === 0) return testerSet.has(row.responsibleId);
    // A workgroup created since the last directory sync counts when every group is in scope.
    return known.get(row.groupId) ?? !scoped;
  };
}

const relatedIdsOf = (t: BitrixTask): number[] | null => {
  if (t.relatedTasks === undefined) return null; // not fetched (tasks.task.list)
  const list = Array.isArray(t.relatedTasks) ? t.relatedTasks : Object.keys(t.relatedTasks ?? {});
  return list.map(Number).filter((n) => n > 0);
};

async function writeRelations(rows: TaskRow[], sources: Map<number, BitrixTask>) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return;
  await db
    .delete(schema.taskRelations)
    .where(and(eq(schema.taskRelations.kind, 'parent'), inArray(schema.taskRelations.taskId, ids)));
  const parents = rows
    .filter((r) => r.parentId)
    .map((r) => ({ taskId: r.id, relatedId: r.parentId!, kind: 'parent' }));
  if (parents.length) await db.insert(schema.taskRelations).values(parents).onConflictDoNothing();

  const withRelated = rows.filter((r) => relatedIdsOf(sources.get(r.id)!) !== null);
  if (!withRelated.length) return;
  await db.delete(schema.taskRelations).where(
    and(
      eq(schema.taskRelations.kind, 'related'),
      inArray(
        schema.taskRelations.taskId,
        withRelated.map((r) => r.id),
      ),
    ),
  );
  const related = withRelated.flatMap((r) =>
    relatedIdsOf(sources.get(r.id)!)!
      .filter((rid) => rid !== r.id)
      .map((relatedId) => ({ taskId: r.id, relatedId, kind: 'related' })),
  );
  if (related.length) await db.insert(schema.taskRelations).values(related).onConflictDoNothing();
}

/** Pulls the STAGE history of moved tasks; real history IDs keep it free of duplicates. */
async function recordStageMoves(call: Call, taskIds: number[], source: ChangeSource) {
  let inserted = 0;
  for (const ids of chunk(taskIds, 50)) {
    const commands: Record<string, Command> = {};
    for (const id of ids) {
      commands[`h${id}`] = {
        method: 'tasks.task.history.list',
        params: { taskId: id, filter: { FIELD: 'STAGE' } },
      };
    }
    const res = await batch<{ list?: HistoryEntry[] }>(call, commands, { allowErrors: true });
    const rows = ids.flatMap((id) =>
      stageEventsFrom(
        id,
        res.result[`h${id}`]?.list ?? [],
        source === 'nightly' ? 'reconcile' : source,
      ),
    );
    if (rows.length) {
      const out = await db
        .insert(schema.taskStageEvents)
        .values(rows)
        .onConflictDoNothing({ target: schema.taskStageEvents.historyId })
        .returning({ id: schema.taskStageEvents.id });
      inserted += out.length;
    }
  }
  return inserted;
}

export interface ApplyResult {
  changes: TaskChanged[];
  stageEvents: number;
}

export async function applyTasks(
  call: Call,
  tasks: BitrixTask[],
  { source, bus }: ApplyOptions,
): Promise<ApplyResult> {
  if (!tasks.length) return { changes: [], stageEvents: 0 };

  // A column added to a board since the last directory sync: read that board first.
  let stageMap = await loadStageMap();
  const unknownGroups = new Set(
    tasks
      .filter(
        (t) =>
          Number(t.groupId) > 0 &&
          t.stageId &&
          t.stageId !== '0' &&
          !stageMap.byId.has(String(t.stageId)),
      )
      .map((t) => Number(t.groupId)),
  );
  if (unknownGroups.size) {
    await syncGroupStages(call, [...unknownGroups]);
    stageMap = await loadStageMap();
  }

  const rows = tasks.map((t) => mapTask(t, stageMap));
  const sources = new Map(tasks.map((t) => [Number(t.id), t]));
  const ids = rows.map((r) => r.id);
  const stored = new Map<number, StoredTask>(
    (
      await db
        .select({
          id: schema.tasks.id,
          stageId: schema.tasks.stageId,
          stage: schema.tasks.stage,
          groupId: schema.tasks.groupId,
          deleted: schema.tasks.deleted,
          changedAt: schema.tasks.changedAt,
          responsibleId: schema.tasks.responsibleId,
        })
        .from(schema.tasks)
        .where(inArray(schema.tasks.id, ids))
    ).map((r) => [r.id, r]),
  );

  const inScope = await inScopeChecker();
  const keep = rows.filter(inScope);
  const dropped = rows.filter((r) => !inScope(r) && stored.has(r.id) && !stored.get(r.id)!.deleted);

  for (const part of chunk(keep, 500)) {
    await db
      .insert(schema.tasks)
      .values(part)
      .onConflictDoUpdate({ target: schema.tasks.id, set: excludedSet(schema.tasks, ['id']) });
  }
  await writeRelations(keep, sources);
  const changes: TaskChanged[] = [];
  const moved: number[] = [];
  const at = new Date().toISOString();

  for (const row of keep) {
    const d = diffTask(stored.get(row.id), {
      id: row.id,
      stageId: row.stageId,
      stage: canonicalStage(row.stage),
      groupId: row.groupId,
      changedAt: row.changedAt,
    });
    if (d.stageChanged || d.isNew) moved.push(row.id);
    if (!d.changed) continue;
    changes.push({
      type: 'task.changed',
      taskId: row.id,
      title: row.title,
      projectId: row.groupId,
      stage: d.toStage,
      fromStage: d.fromStage,
      stageGroup: d.toStage ? stageGroupOf(d.toStage) : null,
      isIssue: row.isIssue ?? false,
      isNew: d.isNew,
      reopened: d.reopened,
      deleted: false,
      source,
      at,
      people: [
        ...new Set(
          [row.responsibleId, row.createdBy, stored.get(row.id)?.responsibleId].filter(
            (id): id is number => !!id,
          ),
        ),
      ],
    });
  }

  if (dropped.length)
    changes.push(
      ...(await markDeleted(
        dropped.map((r) => r.id),
        source,
      )),
    );
  const stageEvents = moved.length ? await recordStageMoves(call, moved, source) : 0;

  if (bus) for (const c of changes) await bus.publish(c);
  return { changes, stageEvents };
}

/** Deleted in Bitrix24 (or moved out of scope): kept as a row, hidden from every metric. */
export async function markDeleted(ids: number[], source: ChangeSource, bus?: EventBus) {
  if (!ids.length) return [];
  const rows = await db
    .update(schema.tasks)
    .set({ deleted: true })
    .where(and(inArray(schema.tasks.id, ids), eq(schema.tasks.deleted, false)))
    .returning({
      id: schema.tasks.id,
      title: schema.tasks.title,
      groupId: schema.tasks.groupId,
      stage: schema.tasks.stage,
      isIssue: schema.tasks.isIssue,
      responsibleId: schema.tasks.responsibleId,
      createdBy: schema.tasks.createdBy,
    });
  const at = new Date().toISOString();
  const changes: TaskChanged[] = rows.map((r) => ({
    type: 'task.changed',
    taskId: r.id,
    title: r.title,
    projectId: r.groupId,
    stage: null,
    fromStage: (r.stage ?? null) as TaskChanged['fromStage'],
    stageGroup: null,
    isIssue: r.isIssue,
    isNew: false,
    reopened: false,
    deleted: true,
    source,
    at,
    people: [...new Set([r.responsibleId, r.createdBy])],
  }));
  if (bus) for (const c of changes) await bus.publish(c);
  return changes;
}
