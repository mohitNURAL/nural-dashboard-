// Initial load (SRS 10.5 #3): every task in the in-scope workgroups, plus the testing team's
// tasks outside any workgroup. Re-runnable: rows are upserted and missing tasks marked deleted.
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { batch, listAll, type Call, type Command } from '../bitrix';
import { db, schema } from '../db/client';
import { chunk, excludedSet } from '../db/upsert';
import { mapTask, TASK_SELECT, type BitrixTask, type TaskRow } from './mapTask';
import { buildStageMap, type StageMap } from './stageMap';

export async function loadStageMap(): Promise<StageMap> {
  return buildStageMap(await db.select().from(schema.stages));
}

/** QA Testing department and its sub-departments (SRS 5, "Testing team"). */
export async function testingTeamIds(): Promise<number[]> {
  const depts = await db.select().from(schema.departments);
  const roots = depts.filter((d) => /\bqa\b|testing/i.test(d.name)).map((d) => d.id);
  const ids = new Set(roots);
  for (let grew = true; grew;) {
    grew = false;
    for (const d of depts) {
      if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) {
        ids.add(d.id);
        grew = true;
      }
    }
  }
  if (!ids.size) return [];
  const members = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`${schema.users.departmentIds} && ${sql.raw(`ARRAY[${[...ids].join(',')}]::int[]`)}`);
  return members.map((m) => m.id);
}

const pickTasks = (r: unknown) =>
  ((r as { tasks?: BitrixTask[] } | null)?.tasks ?? []) as BitrixTask[];

async function fetchTasks(call: Call, filter: Record<string, unknown>): Promise<BitrixTask[]> {
  return listAll(
    call,
    'tasks.task.list',
    { filter, select: TASK_SELECT, order: { ID: 'asc' } },
    pickTasks,
  );
}

async function upsertTasks(rows: TaskRow[]): Promise<void> {
  for (const part of chunk(rows, 500)) {
    await db
      .insert(schema.tasks)
      .values(part)
      .onConflictDoUpdate({ target: schema.tasks.id, set: excludedSet(schema.tasks, ['id']) });
  }
}

/** Runs fn over items with at most `limit` in flight (the limiter still caps calls at 2/s). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function writeParentRelations(rows: TaskRow[]): Promise<number> {
  const ids = rows.map((r) => r.id);
  for (const part of chunk(ids, 1000)) {
    await db
      .delete(schema.taskRelations)
      .where(
        and(eq(schema.taskRelations.kind, 'parent'), inArray(schema.taskRelations.taskId, part)),
      );
  }
  const rels = rows
    .filter((r) => r.parentId)
    .map((r) => ({ taskId: r.id, relatedId: r.parentId!, kind: 'parent' }));
  for (const part of chunk(rels, 1000)) {
    await db.insert(schema.taskRelations).values(part).onConflictDoNothing();
  }
  return rels.length;
}

interface RelatedResult {
  task?: { id: string; relatedTasks?: (string | number)[] | Record<string, unknown> | null };
}

/** Related tasks are only on tasks.task.get; issues need them to find the task they belong to. */
async function writeRelatedForIssues(call: Call, issueIds: number[]): Promise<number> {
  let count = 0;
  for (const ids of chunk(issueIds, 500)) {
    const commands: Record<string, Command> = {};
    for (const id of ids) {
      commands[`t${id}`] = {
        method: 'tasks.task.get',
        params: { taskId: id, select: ['ID', 'RELATED_TASKS'] },
      };
    }
    const res = await batch<RelatedResult>(call, commands, { allowErrors: true });
    const rels: { taskId: number; relatedId: number; kind: string }[] = [];
    for (const id of ids) {
      const related = res.result[`t${id}`]?.task?.relatedTasks;
      const list = Array.isArray(related) ? related : related ? Object.keys(related) : [];
      for (const r of list) {
        const relatedId = Number(r);
        if (relatedId && relatedId !== id) rels.push({ taskId: id, relatedId, kind: 'related' });
      }
    }
    await db
      .delete(schema.taskRelations)
      .where(
        and(eq(schema.taskRelations.kind, 'related'), inArray(schema.taskRelations.taskId, ids)),
      );
    if (rels.length) await db.insert(schema.taskRelations).values(rels).onConflictDoNothing();
    count += rels.length;
  }
  return count;
}

export interface LoadSummary {
  perGroup: { groupId: number; name: string; tasks: number }[];
  testingOutsideGroups: number;
  tasks: number;
  issues: number;
  unmappedStageTasks: number;
  deletedMarked: number;
  parentLinks: number;
  relatedLinks: number;
}

export async function initialLoad(
  call: Call,
  log: (msg: string) => void = () => {},
): Promise<LoadSummary> {
  const stageMap = await loadStageMap();
  const groups = await db
    .select()
    .from(schema.workgroups)
    .where(eq(schema.workgroups.isDevProject, true))
    .orderBy(schema.workgroups.id);

  const allRows: TaskRow[] = [];
  let deletedMarked = 0;
  const perGroup = await mapLimit(groups, 4, async (g) => {
    const rows = (await fetchTasks(call, { GROUP_ID: g.id })).map((t) => mapTask(t, stageMap));
    await upsertTasks(rows);
    // Tasks no longer returned for this group were deleted or moved out of it.
    const seen = rows.map((r) => r.id);
    const gone = await db
      .update(schema.tasks)
      .set({ deleted: true })
      .where(
        and(
          eq(schema.tasks.groupId, g.id),
          eq(schema.tasks.deleted, false),
          seen.length ? notInArray(schema.tasks.id, seen) : sql`true`,
        ),
      )
      .returning({ id: schema.tasks.id });
    deletedMarked += gone.length;
    allRows.push(...rows);
    log(`  group ${g.id} ${g.name}: ${rows.length} tasks`);
    return { groupId: g.id, name: g.name, tasks: rows.length };
  });

  // Testing work assigned to the QA Testing department outside any workgroup (QA-06).
  const testers = await testingTeamIds();
  let testingOutsideGroups = 0;
  if (testers.length) {
    const rows = (await fetchTasks(call, { GROUP_ID: 0, RESPONSIBLE_ID: testers })).map((t) =>
      mapTask(t, stageMap),
    );
    await upsertTasks(rows);
    allRows.push(...rows);
    testingOutsideGroups = rows.length;
    log(`  testing team tasks outside workgroups: ${rows.length}`);
  }

  const parentLinks = await writeParentRelations(allRows);
  const issueIds = allRows.filter((r) => r.isIssue).map((r) => r.id);
  log(`  fetching related tasks for ${issueIds.length} issues`);
  const relatedLinks = await writeRelatedForIssues(call, issueIds);

  return {
    perGroup,
    testingOutsideGroups,
    tasks: allRows.length,
    issues: issueIds.length,
    unmappedStageTasks: allRows.filter((r) => r.stage === null).length,
    deletedMarked,
    parentLinks,
    relatedLinks,
  };
}
