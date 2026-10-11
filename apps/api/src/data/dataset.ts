// Loads everything the metrics need from Postgres into memory (about 9k tasks), cached
// briefly so every filter change is computed in-process (NFR-2: under 500 ms).
import {
  canonicalStage,
  indexTasks,
  type Dept,
  type IssueType,
  type StageTitle,
  type MetricTask,
  type StageEvent,
} from '@nural/shared';
import { and, asc, eq, gte } from 'drizzle-orm';
import { config } from '../config';
import { db, schema } from '../db/client';
import { kpiConfig } from './kpiConfig';

export type DeptGroup = 'Development' | 'Testing' | 'Other';

export interface UserInfo {
  id: number;
  name: string;
  workPosition: string | null;
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
  projects: Map<number, { id: number; name: string }>;
  /** Each board's columns in order (task actions: the stage dropdown). */
  boards?: Map<
    number,
    { id: number; title: string; stage: StageTitle | null; color: string | null }[]
  >;
  /** KPI tab (SRS 13): department per user, project owner per workgroup, recent comments. */
  kpiDept?: Map<number, Dept>;
  owners?: Map<number, number>;
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

export async function loadDataset(): Promise<Dataset> {
  const commentsSince = new Date(Date.now() - 15 * 86_400_000);
  const [taskRows, eventRows, relationRows, userRows, deptRows, groupRows, stageRows, commentRows] =
    await Promise.all([
      db.select().from(schema.tasks).where(eq(schema.tasks.deleted, false)),
      db
        .select()
        .from(schema.taskStageEvents)
        .orderBy(asc(schema.taskStageEvents.taskId), asc(schema.taskStageEvents.movedAt)),
      db.select().from(schema.taskRelations).where(eq(schema.taskRelations.kind, 'related')),
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

  // Several Bitrix24 columns can share one dashboard stage (e.g. Figma Review and To Do).
  const stageIds = new Map<number, Map<StageTitle, number[]>>();
  for (const st of stageRows) {
    const title = canonicalStage(st.canonical);
    if (!title) continue;
    const byTitle = stageIds.get(st.groupId) ?? new Map<StageTitle, number[]>();
    byTitle.set(title, [...(byTitle.get(title) ?? []), st.id]);
    stageIds.set(st.groupId, byTitle);
  }

  // Boards with a QA Backlog column follow the QA flow; others complete by closing (SRS 5).
  const qaFlowGroups = new Set(
    stageRows.filter((s) => canonicalStage(s.canonical) === 'QA Backlog').map((s) => s.groupId),
  );

  const events = new Map<number, StageEvent[]>();
  for (const e of eventRows) {
    const list = events.get(e.taskId) ?? [];
    list.push({
      from: canonicalStage(e.fromCanonical ?? e.fromStage),
      to: canonicalStage(e.toCanonical ?? e.toStage),
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

  const tasks: MetricTask[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    groupId: t.groupId,
    stage: canonicalStage(t.stage),
    stageTitle: t.stageTitle,
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
  }));

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
    projects: new Map(groupRows.map((g) => [g.id, { id: g.id, name: g.name }])),
    boards: boardsOf(stageRows),
    kpiDept: kpiDepartments(userRows, deptRows),
    supportLead: supportLead(deptRows),
    departments: deptRows.map((d) => ({
      id: d.id,
      name: d.name.trim(),
      parentId: d.parentId,
      headId: d.headId,
    })),
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
    list.push({ id: r.id, title: r.title, stage: canonicalStage(r.canonical), color: r.color });
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
  const names = kpiConfig().departments;
  // Exact department names (case and spaces ignored); departmentTree adds sub-departments.
  const exact = (list: string[]) => {
    const wanted = new Set(list.map((n) => n.trim().toLowerCase()));
    return (name: string) => wanted.has(name.trim().toLowerCase());
  };
  const trees = (['dev', 'qa', 'support'] as const).map(
    (d) => [d, departmentTree(depts, exact(names[d]))] as const,
  );
  const out = new Map<number, Dept>();
  for (const u of users) {
    const hit = trees.find(([, ids]) => u.departmentIds.some((id) => ids.has(id)));
    out.set(u.id, hit?.[0] ?? 'other');
  }
  return out;
}

export type DatasetProvider = () => Promise<Dataset>;

/** Caches the dataset for `ttlMs`; concurrent callers share one load. */
export function cachedDataset(load: DatasetProvider = loadDataset, ttlMs = 30_000) {
  let current: { at: number; value: Promise<Dataset> } | undefined;
  const get: DatasetProvider = () => {
    if (!current || Date.now() - current.at > ttlMs) {
      const value = load();
      current = { at: Date.now(), value };
      value.catch(() => {
        if (current?.value === value) current = undefined;
      });
    }
    return current.value;
  };
  /** Milestone 5: called when a live update changes a task. */
  const invalidate = () => {
    current = undefined;
  };
  return { get, invalidate };
}
