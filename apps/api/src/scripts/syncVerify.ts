// pnpm sync:verify [148,154]: compares task counts per Kanban stage in Postgres with Bitrix24.
// No argument = every development workgroup. Exits 1 on any mismatch.
import { DEFAULT_STAGE_ID } from '@nural/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { batch, closeBitrix, getBitrix, type Command } from '../bitrix';
import { closeDb, db, schema } from '../db/client';

async function main() {
  const { call } = getBitrix();
  const arg = process.argv[2];
  const wanted = arg
    ? arg
        .split(',')
        .map((s) => Number(s.trim()))
        .filter(Boolean)
    : [];

  const groups = await db
    .select()
    .from(schema.workgroups)
    .where(
      wanted.length
        ? inArray(schema.workgroups.id, wanted)
        : eq(schema.workgroups.isDevProject, true),
    )
    .orderBy(schema.workgroups.id);
  const missing = wanted.filter((id) => !groups.some((g) => g.id === id));
  if (missing.length)
    throw new Error(`Groups not in Postgres: ${missing.join(', ')} (run sync:initial)`);

  const stageRows = await db
    .select()
    .from(schema.stages)
    .where(
      inArray(
        schema.stages.groupId,
        groups.map((g) => g.id),
      ),
    )
    .orderBy(schema.stages.groupId, schema.stages.sort);

  // Bitrix24 side: one count per (group, stage) plus the "0" (never moved) bucket.
  const buckets = groups.flatMap((g) => [
    { groupId: g.id, stageId: DEFAULT_STAGE_ID, title: '(stage 0, never moved)' },
    ...stageRows
      .filter((s) => s.groupId === g.id)
      .map((s) => ({ groupId: g.id, stageId: String(s.id), title: s.title })),
  ]);
  const commands: Record<string, Command> = {};
  for (const b of buckets) {
    commands[`g${b.groupId}s${b.stageId}`] = {
      method: 'tasks.task.list',
      params: { filter: { GROUP_ID: b.groupId, STAGE_ID: Number(b.stageId) }, select: ['ID'] },
    };
  }
  const res = await batch(call, commands);

  const local = await db
    .select({
      groupId: schema.tasks.groupId,
      stageId: schema.tasks.stageId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.deleted, false),
        inArray(
          schema.tasks.groupId,
          groups.map((g) => g.id),
        ),
      ),
    )
    .groupBy(schema.tasks.groupId, schema.tasks.stageId);
  const localCount = new Map(local.map((r) => [`${r.groupId}:${r.stageId}`, r.n]));

  let mismatches = 0;
  for (const g of groups) {
    const rows = buckets.filter((b) => b.groupId === g.id);
    let remoteTotal = 0;
    let localTotal = 0;
    const lines: string[] = [];
    for (const b of rows) {
      const remote = res.total[`g${b.groupId}s${b.stageId}`] ?? 0;
      const mine = localCount.get(`${b.groupId}:${b.stageId}`) ?? 0;
      localCount.delete(`${b.groupId}:${b.stageId}`);
      remoteTotal += remote;
      localTotal += mine;
      const ok = remote === mine;
      if (!ok) mismatches++;
      if (remote || mine)
        lines.push(
          `  ${ok ? '✓' : '✗'} ${b.title.padEnd(26)} Bitrix24 ${String(remote).padStart(5)}   Postgres ${String(mine).padStart(5)}`,
        );
    }
    // Tasks in Postgres whose stage ID is no longer on the board.
    for (const [key, n] of localCount) {
      if (!key.startsWith(`${g.id}:`)) continue;
      mismatches++;
      localTotal += n;
      lines.push(
        `  ✗ unknown stage id ${key.split(':')[1]!.padEnd(15)} Bitrix24     -   Postgres ${String(n).padStart(5)}`,
      );
    }
    const ok = remoteTotal === localTotal;
    console.log(
      `${ok ? '✓' : '✗'} ${g.id} ${g.name}: Bitrix24 ${remoteTotal}, Postgres ${localTotal}`,
    );
    for (const l of lines) console.log(l);
  }

  console.log(mismatches ? `\n${mismatches} mismatched bucket(s).` : '\nAll stage counts match.');
  if (mismatches) process.exitCode = 1;
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
