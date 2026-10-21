// Directory sync (SRS 7, module 4): users, departments, workgroups and each workgroup's stages.
import { canonicalStage } from '@nural/shared';
import { and, inArray, notInArray } from 'drizzle-orm';
import { batch, listAll, type Call, type Command } from '../bitrix';
import { config } from '../config';
import { db, schema } from '../db/client';
import { chunk, excludedSet } from '../db/upsert';

interface BitrixUser {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  WORK_POSITION?: string;
  EMAIL?: string;
  UF_DEPARTMENT?: number[] | number | null;
  ACTIVE: boolean | string;
}

interface BitrixDepartment {
  ID: string;
  NAME: string;
  PARENT?: string;
  UF_HEAD?: string;
}

interface BitrixGroup {
  ID: string;
  NAME: string;
  OWNER_ID?: string;
}

interface BitrixStage {
  ID: string;
  TITLE: string;
  SORT: string | number;
  COLOR?: string;
}

const int = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface DirectorySummary {
  users: number;
  departments: number;
  groups: number;
  stages: number;
  unmappedStages: { groupId: number; title: string }[];
}

export async function syncDirectory(call: Call): Promise<DirectorySummary> {
  // user.get returns only active users unless asked; old tasks reference inactive ones too.
  const [active, inactive] = await Promise.all([
    listAll<BitrixUser>(call, 'user.get', { FILTER: { ACTIVE: true } }),
    listAll<BitrixUser>(call, 'user.get', { FILTER: { ACTIVE: false } }),
  ]);
  const userRows = [...active, ...inactive].map((u) => ({
    id: Number(u.ID),
    name: [u.NAME, u.LAST_NAME].filter((s) => s?.trim()).join(' ') || `User ${u.ID}`,
    workPosition: u.WORK_POSITION?.trim() || null,
    email: u.EMAIL?.trim().toLowerCase() || null,
    departmentIds: [u.UF_DEPARTMENT ?? []].flat().map(Number).filter(Boolean),
    active: u.ACTIVE === true || u.ACTIVE === 'Y' || u.ACTIVE === 'true',
  }));
  for (const rows of chunk(userRows, 500)) {
    await db
      .insert(schema.users)
      .values(rows)
      .onConflictDoUpdate({ target: schema.users.id, set: excludedSet(schema.users, ['id']) });
  }

  const depts = await listAll<BitrixDepartment>(call, 'department.get');
  if (depts.length) {
    await db
      .insert(schema.departments)
      .values(
        depts.map((d) => ({
          id: Number(d.ID),
          name: d.NAME,
          parentId: int(d.PARENT),
          headId: int(d.UF_HEAD),
        })),
      )
      .onConflictDoUpdate({
        target: schema.departments.id,
        set: excludedSet(schema.departments, ['id']),
      });
  }

  const groups = await listAll<BitrixGroup>(call, 'sonet_group.get', { ORDER: { NAME: 'ASC' } });
  const scope = new Set(config.DEV_GROUP_IDS);
  if (groups.length) {
    await db
      .insert(schema.workgroups)
      .values(
        groups.map((g) => ({
          id: Number(g.ID),
          name: g.NAME,
          // Empty DEV_GROUP_IDS = every workgroup is a development project.
          isDevProject: scope.size === 0 || scope.has(Number(g.ID)),
          ownerId: Number(g.OWNER_ID) || null,
          active: true,
        })),
      )
      .onConflictDoUpdate({
        target: schema.workgroups.id,
        set: excludedSet(schema.workgroups, ['id']),
      });
    // A project no longer listed (archived or deleted in Bitrix24) is kept for its tasks but
    // stops counting as active.
    await db
      .update(schema.workgroups)
      .set({ active: false })
      .where(
        notInArray(
          schema.workgroups.id,
          groups.map((g) => Number(g.ID)),
        ),
      );
  }

  // Boards of the listed projects, and of projects known only from their tasks (private ones the
  // webhook user is not in, e.g. 168, 170).
  const listed = new Set(groups.map((g) => Number(g.ID)));
  const taskOnly = (await db.selectDistinct({ id: schema.tasks.groupId }).from(schema.tasks))
    .map((r) => r.id)
    .filter((id) => id > 0 && !listed.has(id));
  const stageRows = await syncGroupStages(call, [...listed, ...taskOnly]);

  return {
    users: userRows.length,
    departments: depts.length,
    groups: groups.length,
    stages: stageRows.length,
    unmappedStages: stageRows
      .filter((s) => s.canonical === null)
      .map((s) => ({ groupId: s.groupId, title: s.title })),
  };
}

type Board = Record<string, BitrixStage> | BitrixStage[];

/**
 * Reads the Kanban columns of the given workgroups: the boards read and the ids read. A private
 * project the webhook user is not in (e.g. 170 Nural BA) answers ACCESS_DENIED: its board is read
 * again as an admin (isAdmin, still a read; works when the webhook user is a portal admin,
 * 2026-10-21). A board still refused is left out.
 */
export async function readBoards(call: Call, groupIds: number[]) {
  const ask = (ids: number[], isAdmin: boolean) => {
    const commands: Record<string, Command> = {};
    for (const id of ids) {
      commands[`g${id}`] = {
        method: 'task.stages.get',
        params: isAdmin ? { entityId: id, isAdmin: true } : { entityId: id },
      };
    }
    return batch<Board>(call, commands, { allowErrors: true });
  };
  const boards = new Map<number, Board>();
  if (!groupIds.length) return boards;
  const first = await ask(groupIds, false);
  const denied: number[] = [];
  for (const id of groupIds) {
    if (first.errors[`g${id}`]) denied.push(id);
    else boards.set(id, first.result[`g${id}`] ?? {});
  }
  if (denied.length) {
    const again = await ask(denied, true);
    for (const id of denied)
      if (!again.errors[`g${id}`]) boards.set(id, again.result[`g${id}`] ?? {});
  }
  return boards;
}

/** Reads the Kanban columns of the given workgroups and stores them (matched by title later). */
export async function syncGroupStages(call: Call, groupIds: number[]) {
  if (!groupIds.length) return [];
  // A board still refused is skipped and keeps the stages stored for it.
  const boards = await readBoards(call, groupIds);
  const readIds = [...boards.keys()];
  const stageRows = readIds.flatMap((groupId) =>
    Object.values(boards.get(groupId) ?? {}).map((s) => ({
      id: Number(s.ID),
      groupId,
      title: s.TITLE.trim(),
      canonical: canonicalStage(s.TITLE),
      sort: Number(s.SORT) || 0,
      color: s.COLOR ? `#${s.COLOR.replace(/^#/, '').toUpperCase()}` : null,
    })),
  );
  if (stageRows.length) {
    await db
      .insert(schema.stages)
      .values(stageRows)
      .onConflictDoUpdate({ target: schema.stages.id, set: excludedSet(schema.stages, ['id']) });
    // Columns removed from a board in Bitrix24 disappear here too: only within the groups
    // just read, keeping every stage just seen.
    await db.delete(schema.stages).where(
      and(
        inArray(schema.stages.groupId, readIds),
        notInArray(
          schema.stages.id,
          stageRows.map((s) => s.id),
        ),
      ),
    );
  }
  return stageRows;
}
