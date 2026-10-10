// Loads everything the metrics need from Postgres into memory (about 9k tasks), cached
// briefly so every filter change is computed in-process (NFR-2: under 500 ms).
import {
  canonicalStage,
  indexTasks,
  type IssueType,
  type MetricTask,
  type StageEvent,
} from '@nural/shared';
import { asc, eq } from 'drizzle-orm';
import { config } from '../config';
import { db, schema } from '../db/client';

export type DeptGroup = 'Development' | 'Testing' | 'Other';

export interface UserInfo {
  id: number;
  name: string;
  workPosition: string | null;
  deptGroup: DeptGroup;
  active: boolean;
}

export interface Dataset {
  tasks: MetricTask[];
  byId: Map<number, MetricTask>;
  testers: Set<number>;
  /** Development department members (Development tab scope); absent in older fixtures. */
  developers?: Set<number>;
  /** Head of the QA Testing department, named on alerts for work waiting in QA. */
  qaLead?: number | null;
  users: Map<number, UserInfo>;
  projects: Map<number, { id: number; name: string }>;
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
export function departmentTree(depts: Department[], pattern: RegExp): Set<number> {
  const ids = new Set(depts.filter((d) => pattern.test(d.name)).map((d) => d.id));
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
  const [taskRows, eventRows, relationRows, userRows, deptRows, groupRows] = await Promise.all([
    db.select().from(schema.tasks).where(eq(schema.tasks.deleted, false)),
    db
      .select()
      .from(schema.taskStageEvents)
      .orderBy(asc(schema.taskStageEvents.taskId), asc(schema.taskStageEvents.movedAt)),
    db.select().from(schema.taskRelations).where(eq(schema.taskRelations.kind, 'related')),
    db.select().from(schema.users),
    db.select().from(schema.departments),
    db.select().from(schema.workgroups),
  ]);

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
    });
  }

  return {
    tasks,
    byId: indexTasks(tasks),
    testers,
    developers,
    qaLead,
    users,
    projects: new Map(groupRows.map((g) => [g.id, { id: g.id, name: g.name }])),
    portalOrigin: new URL(config.BITRIX_INBOUND_URL).origin,
    loadedAt: new Date(),
  };
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
