// Loads everything the metrics need from Postgres into memory (about 9k tasks), cached so every
// filter change is computed in-process (NFR-2: under 500 ms). A changed task is patched in by
// re-reading only its rows (2026-10-30); everything is reloaded every 10 minutes.
import {
  canonicalStage,
  indexTasks,
  type Dept,
  type IssueType,
  type StageTitle,
  type MetricTask,
  type StageEvent,
  hasRole,
  DEFAULT_STAGE_ID,
  stageWithRole,
} from '@nural/shared';
import { and, asc, eq, getTableColumns, gte, inArray, or, sql } from 'drizzle-orm';
import { config } from '../config';
import { db, schema } from '../db/client';
import { kpiConfig } from './kpiConfig';

export type DeptGroup = 'Development' | 'Testing' | 'Other';

export interface UserInfo {
  id: number;
  name: string;
  workPosition: string | null;
  /** Work email (report mails); absent in fixtures. */
  email?: string | null;
  deptGroup: DeptGroup;
  active: boolean;
  /** Bitrix24 departments (company tree, access per department). */
  departmentIds?: number[];
}

export interface Dataset {
  tasks: MetricTask[];
  byId: Map<number, MetricTask>;
  testers: Set<number>;
  /** Development department members (Development tab scope); absent in older fixtures. */
  developers?: Set<number>;
  /** Head of the QA Testing department, named on alerts for work waiting in QA. */
  qaLead?: number | null;
  /** Bitrix24 stage IDs per workgroup and dashboard stage (for filtered Bitrix24 links). */
  stageIds?: Map<number, Map<StageTitle, number[]>>;
  users: Map<number, UserInfo>;
  projects: Map<number, { id: number; name: string; active?: boolean }>;
  /** Set on a person's scoped copy (only their tasks), see auth/roles.ts scopeDataset. */
  scoped?: boolean;
  /** Each board's columns in order (task actions: the stage dropdown). */
  boards?: Map<
    number,
    { id: number; title: string; stage: StageTitle | null; color: string | null }[]
  >;
  /** KPI tab (SRS 13): department per user, project owner per workgroup, recent comments. */
  kpiDept?: Map<number, Dept>;
  owners?: Map<number, number>;
  /** Members of each project in Bitrix24 (Daily update Add task; never shown as a list). */
  members?: Map<number, Set<number>>;
  /** The company structure: departments with parent and head (Employee module, access). */
  departments?: { id: number; name: string; parentId: number | null; headId: number | null }[];
  /** Head of the top Tech Support department (reads the Support tab feedback inbox). */
  supportLead?: number | null;
  comments?: { taskId: number; at: Date }[];
  /** Board colours etc. are fixed; this is just the portal origin for "Open in Bitrix24". */
  portalOrigin: string;
  loadedAt: Date;
}

interface Department {
  id: number;
  name: string;
  parentId: number | null;
}

/** IDs of the departments matching `pattern` and all their sub-departments. */
export function departmentTree(
  depts: Department[],
  pattern: RegExp | ((name: string) => boolean),
): Set<number> {
  const match = typeof pattern === 'function' ? pattern : (n: string) => pattern.test(n);
  const ids = new Set(depts.filter((d) => match(d.name)).map((d) => d.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const d of depts) {
      if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) {
        ids.add(d.id);
        grew = true;
      }
    }
  }
  return ids;
}

export const TESTING_DEPT = /\bqa\b|testing/i;
export const DEVELOPMENT_DEPT = /software development/i;

// Task rows without the stored Bitrix24 copy (`raw`) except its project ({ group }), the only part
// the dataset reads (projectsOf): most of the bytes of a full load.
const { raw, ...taskColumns } = getTableColumns(schema.tasks);
const taskSelect = {
  ...taskColumns,
  raw: sql<unknown>`jsonb_build_object('group', ${raw}->'group')`,
};
const selectTasks = () => db.select(taskSelect).from(schema.tasks);
const selectEvents = () =>
  db
    .select()
    .from(schema.taskStageEvents)
    .orderBy(asc(schema.taskStageEvents.taskId), asc(schema.taskStageEvents.movedAt));
const relatedOnly = () => eq(schema.taskRelations.kind, 'related');

/** Everything the dataset is built from, as read from Postgres. */
export interface DatasetRows {
  taskRows: Awaited<ReturnType<typeof selectTasks>>;
  eventRows: (typeof schema.taskStageEvents.$inferSelect)[];
  relationRows: (typeof schema.taskRelations.$inferSelect)[];
  userRows: (typeof schema.users.$inferSelect)[];
  deptRows: (typeof schema.departments.$inferSelect)[];
  groupRows: (typeof schema.workgroups.$inferSelect)[];
  stageRows: (typeof schema.stages.$inferSelect)[];
  commentRows: { taskId: number | null; at: Date }[];
}

/**
 * The rows with these tasks read again (row, stage history, related links); a deleted task drops
 * out. People, projects, boards and comments stay until the next full load.
 */
export async function patchRows(rows: DatasetRows, ids: readonly number[]): Promise<DatasetRows> {
  const list = [...new Set(ids)];
  const [tasks, events, relations] = await Promise.all([
    selectTasks().where(inArray(schema.tasks.id, list)),
    selectEvents().where(inArray(schema.taskStageEvents.taskId, list)),
    db
      .select()
      .from(schema.taskRelations)
      .where(
        and(
          relatedOnly(),
          or(
            inArray(schema.taskRelations.taskId, list),
            inArray(schema.taskRelations.relatedId, list),
          ),
        ),
      ),
  ]);
  return mergeRows(rows, list, { tasks, events, relations });
}

/** The pure part of patchRows: the given tasks' rows swapped for fresh ones, order kept. */
export function mergeRows<R extends Pick<DatasetRows, 'taskRows' | 'eventRows' | 'relationRows'>>(
  rows: R,
  ids: readonly number[],
  fresh: {
    tasks: R['taskRows'];
    events: R['eventRows'];
    relations: R['relationRows'];
  },
): R {
  const set = new Set(ids);
  const byId = new Map(fresh.tasks.filter((t) => !t.deleted).map((t) => [t.id, t]));
  const taskRows = rows.taskRows.flatMap((t) => {
    if (!set.has(t.id)) return [t];
    const next = byId.get(t.id);
    byId.delete(t.id);
    return next ? [next] : [];
  });
  // New tasks go at the end.
  taskRows.push(...byId.values());
  return {
    ...rows,
    taskRows,
    eventRows: [...rows.eventRows.filter((e) => !set.has(e.taskId)), ...fresh.events],
    relationRows: [
      ...rows.relationRows.filter((r) => !set.has(r.taskId) && !set.has(r.relatedId)),
      ...fresh.relations,
    ],
  };
}

export async function loadDataset(): Promise<Dataset> {
  return buildDataset(await loadRows());
}

export async function loadRows(): Promise<DatasetRows> {
  const commentsSince = new Date(Date.now() - 15 * 86_400_000);
  const [taskRows, eventRows, relationRows, userRows, deptRows, groupRows, stageRows, commentRows] =
    await Promise.all([
      selectTasks().where(eq(schema.tasks.deleted, false)),
      selectEvents(),
      db.select().from(schema.taskRelations).where(relatedOnly()),
      db.select().from(schema.users),
      db.select().from(schema.departments),
      db.select().from(schema.workgroups),
      db.select().from(schema.stages),
      db
        .select({ taskId: schema.webhookEvents.taskId, at: schema.webhookEvents.receivedAt })
        .from(schema.webhookEvents)
        .where(
          and(
            eq(schema.webhookEvents.event, 'ONTASKCOMMENTADD'),
            gte(schema.webhookEvents.receivedAt, commentsSince),
          ),
        ),
    ]);
  return {
    taskRows,
    eventRows,
    relationRows,
    userRows,
    deptRows,
    groupRows,
    stageRows,
    commentRows,
  };
}

/** The dataset from its rows: pure, so patched rows rebuild without going back to Postgres. */
export function buildDataset(rows: DatasetRows): Dataset {
  const {
    taskRows,
    eventRows,
    relationRows,
    userRows,
    deptRows,
    groupRows,
    stageRows,
    commentRows,
  } = rows;

  // Several Bitrix24 columns can share one dashboard stage (e.g. Figma Review and To Do).
  const stageIds = new Map<number, Map<StageTitle, number[]>>();
  for (const st of stageRows) {
    // From the column's own name, so the workflow's current mapping applies (SRS 22).
    const title = canonicalStage(st.title) ?? canonicalStage(st.canonical);
    if (!title) continue;
    const byTitle = stageIds.get(st.groupId) ?? new Map<StageTitle, number[]>();
    byTitle.set(title, [...(byTitle.get(title) ?? []), st.id]);
    stageIds.set(st.groupId, byTitle);
  }

  // Boards with a QA Backlog column follow the QA flow; others complete by closing (SRS 5).
  const qaFlowGroups = new Set(
    stageRows
      .filter((s) => hasRole(canonicalStage(s.title) ?? canonicalStage(s.canonical), 'qaEntry'))
      .map((s) => s.groupId),
  );

  const events = new Map<number, StageEvent[]>();
  for (const e of eventRows) {
    const list = events.get(e.taskId) ?? [];
    list.push({
      from: canonicalStage(e.fromStage) ?? canonicalStage(e.fromCanonical),
      to: canonicalStage(e.toStage) ?? canonicalStage(e.toCanonical),
      at: e.movedAt,
      by: e.movedBy,
    });
    events.set(e.taskId, list);
  }

  // Related links are stored on one side; metrics need them on both.
  const related = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    const s = related.get(a) ?? new Set<number>();
    s.add(b);
    related.set(a, s);
  };
  for (const r of relationRows) {
    link(r.taskId, r.relatedId);
    link(r.relatedId, r.taskId);
  }

  // A column read after its tasks were synced (e.g. a private project's board, 2026-10-21): its
  // title comes from the stored board, by the task's column id.
  const columnTitle = new Map(stageRows.map((st) => [String(st.id), st.title]));
  const tasks: MetricTask[] = taskRows.map((t) => {
    const stageTitle = t.stageTitle ?? columnTitle.get(t.stageId) ?? null;
    return {
      id: t.id,
      title: t.title,
      groupId: t.groupId,
      // Never moved on its board: the start stage; else its column under the current workflow;
      // tasks outside any board keep the stage worked out from their status at sync.
      stage:
        t.groupId && t.stageId === DEFAULT_STAGE_ID
          ? stageWithRole('start')
          : (canonicalStage(stageTitle) ?? canonicalStage(t.stage)),
      stageTitle,
      status: t.status,
      priority: t.priority,
      responsibleId: t.responsibleId,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      changedAt: t.changedAt,
      deadline: t.deadline,
      closedAt: t.closedAt,
      parentId: t.parentId,
      relatedIds: [...(related.get(t.id) ?? [])],
      tags: t.tags,
      isIssue: t.isIssue,
      issueType: t.issueType as IssueType | null,
      events: events.get(t.id) ?? [],
      startDatePlan: t.startDatePlan,
      dateStart: t.dateStart,
      stageId: t.stageId,
      ...(t.groupId > 0 && { qaFlow: qaFlowGroups.has(t.groupId) }),
    };
  });

  const testingDepts = departmentTree(deptRows, TESTING_DEPT);
  // The top QA Testing department's head in the company structure.
  const qaLead =
    deptRows.find((d) => TESTING_DEPT.test(d.name) && !testingDepts.has(d.parentId ?? -1))
      ?.headId ?? null;
  const devDepts = departmentTree(deptRows, DEVELOPMENT_DEPT);
  const users = new Map<number, UserInfo>();
  const testers = new Set<number>();
  const developers = new Set<number>();
  for (const u of userRows) {
    // People in two departments use the testing or development one (SRS 1).
    const deptGroup: DeptGroup = u.departmentIds.some((d) => testingDepts.has(d))
      ? 'Testing'
      : u.departmentIds.some((d) => devDepts.has(d))
        ? 'Development'
        : 'Other';
    if (deptGroup === 'Testing') testers.add(u.id);
    if (deptGroup === 'Development') developers.add(u.id);
    users.set(u.id, {
      id: u.id,
      name: u.name,
      workPosition: u.workPosition,
      email: u.email,
      deptGroup,
      active: u.active,
      departmentIds: u.departmentIds,
    });
  }

  return {
    tasks,
    byId: indexTasks(tasks),
    testers,
    developers,
    qaLead,
    stageIds,
    users,
    projects: projectsOf(groupRows, taskRows),
    boards: boardsOf(stageRows),
    kpiDept: kpiDepartments(userRows, deptRows),
    supportLead: supportLead(deptRows),
    departments: deptRows.map((d) => ({
      id: d.id,
      name: d.name.trim(),
      parentId: d.parentId,
      headId: d.headId,
    })),
    members: new Map(groupRows.map((g) => [g.id, new Set(g.memberIds ?? [])])),
    owners: new Map(
      groupRows.flatMap((g) => {
        const owner = kpiConfig().owners.get(g.id) ?? g.ownerId;
        return owner ? [[g.id, owner] as const] : [];
      }),
    ),
    comments: commentRows.flatMap((c) => (c.taskId ? [{ taskId: c.taskId, at: c.at }] : [])),
    portalOrigin: new URL(config.BITRIX_INBOUND_URL).origin,
    loadedAt: new Date(),
  };
}

/**
 * The projects by id (2026-10-21): the workgroups the webhook lists, then any project only its
 * tasks name. A private project the webhook user is not in (e.g. 168, 170) is never returned by
 * sonet_group.get, but every task carries its project as `group: { id, name }`. Those count as
 * active (they have tasks) unless DEV_GROUP_IDS narrows the scope.
 */
export function projectsOf(
  groupRows: readonly { id: number; name: string; active: boolean; isDevProject: boolean }[],
  taskRows: readonly { groupId: number; raw?: unknown }[],
): Dataset['projects'] {
  const projects: Dataset['projects'] = new Map(
    groupRows.map((g) => [g.id, { id: g.id, name: g.name, active: g.active && g.isDevProject }]),
  );
  const scope = new Set(config.DEV_GROUP_IDS);
  for (const t of taskRows) {
    if (!t.groupId || projects.has(t.groupId)) continue;
    const name = (t.raw as { group?: { name?: unknown } } | null)?.group?.name;
    if (typeof name !== 'string' || !name.trim()) continue;
    projects.set(t.groupId, {
      id: t.groupId,
      name: name.trim(),
      active: scope.size === 0 || scope.has(t.groupId),
    });
  }
  return projects;
}

/** Each workgroup's columns, in board order. */
function boardsOf(
  rows: {
    id: number;
    groupId: number;
    title: string;
    canonical: string | null;
    sort: number;
    color: string | null;
  }[],
) {
  const out = new Map<
    number,
    { id: number; title: string; stage: StageTitle | null; color: string | null }[]
  >();
  for (const r of [...rows].sort((a, b) => a.sort - b.sort || a.id - b.id)) {
    const list = out.get(r.groupId) ?? [];
    // The column's own name under the current workflow (SRS 22).
    const stage = canonicalStage(r.title) ?? canonicalStage(r.canonical);
    list.push({ id: r.id, title: r.title, stage, color: r.color });
    out.set(r.groupId, list);
  }
  return out;
}

/** Head of the top support department (config/departments.json "support"). */
function supportLead(depts: (Department & { headId: number | null })[]): number | null {
  const wanted = new Set(kpiConfig().departments.support.map((n) => n.trim().toLowerCase()));
  const tree = departmentTree(depts, (name) => wanted.has(name.trim().toLowerCase()));
  return depts.find((d) => tree.has(d.id) && !tree.has(d.parentId ?? -1))?.headId ?? null;
}

/** KPI department of each user from config/departments.json (sub-departments included). */
function kpiDepartments(
  users: { id: number; departmentIds: number[] }[],
  depts: Department[],
): Map<number, Dept> {
  const { departments: names, people } = kpiConfig();
  // Exact department names (case and spaces ignored); departmentTree adds sub-departments.
  const exact = (list: string[]) => {
    const wanted = new Set(list.map((n) => n.trim().toLowerCase()));
    return (name: string) => wanted.has(name.trim().toLowerCase());
  };
  const trees = (['dev', 'qa', 'support', 'ba'] as const).map(
    (d) => [d, departmentTree(depts, exact(names[d]))] as const,
  );
  const out = new Map<number, Dept>();
  for (const u of users) {
    const hit = trees.find(([, ids]) => u.departmentIds.some((id) => ids.has(id)));
    // A person named in "people" (e.g. Yajur → ba) wins over their Bitrix24 department.
    out.set(u.id, people.get(u.id) ?? hit?.[0] ?? 'other');
  }
  return out;
}

export type DatasetProvider = () => Promise<Dataset>;

/** Most tasks patched in one go; a bigger burst (a reconcile catch-up) reloads everything. */
export const PATCH_MAX = 300;
/** Full reload, which also picks up people, projects, boards and comments (2026-10-30). */
export const FULL_RELOAD_MS = 10 * 60_000;

export interface RowSource<R> {
  load: () => Promise<R>;
  patch: (rows: R, ids: readonly number[]) => Promise<R>;
  build: (rows: R) => Dataset;
}

const dbSource: RowSource<DatasetRows> = { load: loadRows, patch: patchRows, build: buildDataset };

/**
 * The dataset in memory (2026-10-30). A changed task is marked, and the next read patches only the
 * marked tasks in (their rows from Postgres, then an in-memory rebuild) instead of reloading all 9k
 * tasks every time, which held up every request on the one-CPU server. Everything is reloaded
 * every `ttlMs`, after `invalidate()`, after a bigger burst, or when a patch fails. Concurrent
 * callers share one load.
 */
export function cachedDataset<R = DatasetRows>(
  source: RowSource<R> = dbSource as unknown as RowSource<R>,
  ttlMs = FULL_RELOAD_MS,
  log?: (o: { kind: 'full' | 'patch'; tasks: number; ms: number }) => void,
) {
  let rows: Promise<R> | undefined;
  let value: Promise<Dataset> | undefined;
  let loadedAt = 0;
  const dirty = new Set<number>();

  const timed = <T>(kind: 'full' | 'patch', tasks: number, p: Promise<T>) => {
    const started = Date.now();
    return p.then((out) => {
      log?.({ kind, tasks, ms: Date.now() - started });
      return out;
    });
  };

  const get: DatasetProvider = () => {
    if (!rows || Date.now() - loadedAt > ttlMs || dirty.size > PATCH_MAX) {
      dirty.clear();
      loadedAt = Date.now();
      rows = timed('full', 0, source.load());
    } else if (dirty.size) {
      const ids = [...dirty];
      dirty.clear();
      rows = timed(
        'patch',
        ids.length,
        rows.then((r) => source.patch(r, ids)),
      ).catch(() => {
        // Never serve a half-patched set: start again from Postgres.
        loadedAt = Date.now();
        return source.load();
      });
    } else if (value) return value;
    const current = rows;
    const built = current.then((r) => source.build(r));
    value = built;
    built.catch(() => {
      if (rows === current) {
        rows = undefined;
        value = undefined;
      }
    });
    return built;
  };

  return {
    get,
    /** These tasks changed: the next read patches them in. */
    changed(ids: readonly number[]) {
      for (const id of ids) if (id > 0) dirty.add(id);
    },
    /** Everything is reloaded on the next read (workflow change, people, projects). */
    invalidate() {
      rows = undefined;
      value = undefined;
      dirty.clear();
    },
  };
}
