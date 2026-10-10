// Postgres data model (SRS section 7). Stage titles are stored raw and as the canonical stage.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const tasks = pgTable(
  'tasks',
  {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    /** 0 = task outside any workgroup (loaded only for the testing team). */
    groupId: integer('group_id').notNull(),
    stageId: text('stage_id').notNull(),
    /** Column title on the board, as Bitrix24 shows it. */
    stageTitle: text('stage_title'),
    /** Canonical stage (packages/shared/src/stages.ts), null when the title is unmapped. */
    stage: text('stage'),
    status: integer('status').notNull(),
    priority: integer('priority').notNull(),
    responsibleId: integer('responsible_id').notNull(),
    createdBy: integer('created_by').notNull(),
    createdAt: tz('created_at').notNull(),
    deadline: tz('deadline'),
    closedAt: tz('closed_at'),
    changedAt: tz('changed_at').notNull(),
    /** KPI tab (SRS 13.2): Bitrix24 planned start / end and first start. */
    startDatePlan: tz('start_date_plan'),
    endDatePlan: tz('end_date_plan'),
    dateStart: tz('date_start'),
    parentId: integer('parent_id'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isIssue: boolean('is_issue').notNull().default(false),
    issueType: text('issue_type'),
    deleted: boolean('deleted').notNull().default(false),
    raw: jsonb('raw').notNull(),
  },
  (t) => [
    index('tasks_group_idx').on(t.groupId),
    index('tasks_responsible_idx').on(t.responsibleId),
    index('tasks_stage_idx').on(t.stage),
    index('tasks_is_issue_idx').on(t.isIssue),
  ],
);

export const taskStageEvents = pgTable(
  'task_stage_events',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id').notNull(),
    fromStage: text('from_stage'),
    toStage: text('to_stage'),
    fromCanonical: text('from_canonical'),
    toCanonical: text('to_canonical'),
    movedAt: tz('moved_at').notNull(),
    movedBy: integer('moved_by'),
    /** 'history' (backfill from tasks.task.history.list) or 'webhook' (live, milestone 5). */
    source: text('source').notNull(),
    /** Bitrix24 history entry ID; unique so re-running the backfill adds nothing. */
    historyId: bigint('history_id', { mode: 'number' }).unique(),
  },
  (t) => [index('stage_events_task_idx').on(t.taskId, t.movedAt)],
);

export const taskRelations = pgTable(
  'task_relations',
  {
    taskId: integer('task_id').notNull(),
    relatedId: integer('related_id').notNull(),
    /** 'parent' (task_id's parent is related_id) or 'related'. */
    kind: text('kind').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.relatedId, t.kind] }),
    index('task_relations_related_idx').on(t.relatedId),
  ],
);

export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  workPosition: text('work_position'),
  departmentIds: integer('department_ids')
    .array()
    .notNull()
    .default(sql`'{}'::integer[]`),
  active: boolean('active').notNull(),
});

export const departments = pgTable('departments', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  parentId: integer('parent_id'),
  headId: integer('head_id'),
});

export const workgroups = pgTable('workgroups', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  isDevProject: boolean('is_dev_project').notNull(),
  /** Bitrix24 group owner, the KPI tab's project owner fallback (SRS 13.3, KPI-02). */
  ownerId: integer('owner_id'),
});

export const stages = pgTable(
  'stages',
  {
    id: integer('id').primaryKey(),
    groupId: integer('group_id').notNull(),
    title: text('title').notNull(),
    canonical: text('canonical'),
    sort: integer('sort').notNull(),
    color: text('color'),
  },
  (t) => [index('stages_group_idx').on(t.groupId)],
);

export const syncState = pgTable('sync_state', {
  key: text('key').primaryKey(),
  lastRun: tz('last_run'),
  cursor: jsonb('cursor'),
});

/** Outbound webhook calls, kept 30 days for debugging (NFR-10). The auth part is never stored. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: serial('id').primaryKey(),
    receivedAt: tz('received_at').notNull().defaultNow(),
    event: text('event').notNull(),
    taskId: integer('task_id'),
    payload: jsonb('payload').notNull(),
  },
  (t) => [index('webhook_events_received_idx').on(t.receivedAt)],
);
