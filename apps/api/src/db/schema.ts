// Postgres data model (SRS section 7). Stage titles are stored raw and as the canonical stage.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  uniqueIndex,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
/** Raw bytes (attachments). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

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
  /** Work email from Bitrix24 (report mails, Slack lookup). */
  email: text('email'),
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
  /** Still listed in Bitrix24 (archived or deleted projects drop out; KPI Active projects). */
  active: boolean('active').notNull().default(true),
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

/**
 * Bitrix24 OAuth tokens of signed-in people, for task actions as themselves (SRS 7). Encrypted
 * with a key derived from SESSION_SECRET (AES-256-GCM); never logged, never sent to the browser.
 */
export const userTokens = pgTable('user_tokens', {
  userId: integer('user_id').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: tz('expires_at').notNull(),
  scope: text('scope'),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

/** Every task action from the dashboard: who, which task, what, and whether Bitrix24 took it. */
export const taskActions = pgTable(
  'task_actions',
  {
    id: serial('id').primaryKey(),
    at: tz('at').notNull().defaultNow(),
    userId: integer('user_id').notNull(),
    taskId: integer('task_id').notNull(),
    /** 'move' or 'status'. */
    action: text('action').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value').notNull(),
    ok: boolean('ok').notNull(),
    error: text('error'),
  },
  (t) => [index('task_actions_task_idx').on(t.taskId, t.at)],
);

/**
 * Feedback from the Support tab (support team and management), to shape the dashboard. Readable
 * only by admins; each person sees their own entries.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: serial('id').primaryKey(),
    at: tz('at').notNull().defaultNow(),
    userId: integer('user_id').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    dept: text('dept').notNull(),
    topic: text('topic').notNull(),
    needs: text('needs')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    frequency: text('frequency'),
    problem: text('problem').notNull(),
    manualReports: text('manual_reports'),
    decision: text('decision'),
    priority: text('priority').notNull(),
    rating: integer('rating'),
    details: text('details'),
    /** new | reviewed (set by an admin). */
    status: text('status').notNull().default('new'),
    adminNote: text('admin_note'),
  },
  (t) => [index('feedback_user_idx').on(t.userId, t.at)],
);

/**
 * Per-person dashboard settings (2026-10-11): sign-in count (the guided tour plays on the first
 * three), the order of tiles, cards and sections, and guided-tour state. Each person reads and
 * writes only their own row.
 */
export const userPrefs = pgTable('user_prefs', {
  userId: integer('user_id').primaryKey(),
  loginCount: integer('login_count').notNull().default(0),
  /** { "dev.tiles": ["total", "pending", ...], ... } */
  layout: jsonb('layout').notNull().default({}),
  /** { voice, shown: { tab: sign-in number }, seen: [what's-new IDs] } */
  tour: jsonb('tour').notNull().default({}),
  /** Activity for the People directory: last sign-in and last request (at most once a minute). */
  lastSignInAt: tz('last_sign_in_at'),
  /** First sign-in (2026-10-12; set on the next sign-in for earlier users): the feedback prompt. */
  firstSignInAt: tz('first_sign_in_at'),
  lastSeenAt: tz('last_seen_at'),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

/**
 * Access overrides set by admins (SRS 7, Access permissions): per person ('user') or per
 * department ('dept'); `rights` holds only the rights changed (auth/rights.ts).
 */
export const accessGrants = pgTable(
  'access_grants',
  {
    subjectType: text('subject_type').notNull(),
    subjectId: integer('subject_id').notNull(),
    rights: jsonb('rights').notNull().default({}),
    updatedBy: integer('updated_by').notNull(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.subjectType, t.subjectId] })],
);

/** Every access change: who, whose rights, before and after. */
export const accessAudit = pgTable('access_audit', {
  id: serial('id').primaryKey(),
  at: tz('at').notNull().defaultNow(),
  byUser: integer('by_user').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: integer('subject_id').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
});

/**
 * Scheduled performance reports by mail and Slack (SRS 19, Mailing). `definition` holds when,
 * who, what and how (reports/model.ts). New reports start in preview: sent only to admins.
 */
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  /** preview | live | paused */
  state: text('state').notNull().default('preview'),
  definition: jsonb('definition').notNull(),
  createdBy: integer('created_by').notNull(),
  createdAt: tz('created_at').notNull().defaultNow(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

/** Every send of a report: one row per period, recipient and channel (no duplicates). */
export const reportRuns = pgTable(
  'report_runs',
  {
    id: serial('id').primaryKey(),
    reportId: integer('report_id').notNull(),
    at: tz('at').notNull().defaultNow(),
    /** The period the run covers, e.g. 2026-10-12 or 2026-W42 (one run per period). */
    periodKey: text('period_key').notNull(),
    /** user:<id>, channel:<id> or mail:<address>. */
    recipient: text('recipient').notNull(),
    /** mail | slack | slack-channel */
    channel: text('channel').notNull(),
    /** sent | failed | skipped | test */
    status: text('status').notNull(),
    preview: boolean('preview').notNull().default(false),
    subject: text('subject'),
    error: text('error'),
  },
  (t) => [
    index('report_runs_report_idx').on(t.reportId, t.at),
    uniqueIndex('report_runs_once').on(t.reportId, t.periodKey, t.recipient, t.channel),
  ],
);

/**
 * Help > Feedback (2026-10-12, SRS 20): an issue or idea about the dashboard, a page, a project or
 * a person (or Finance, admins only), with up to 5 attachments. The writer sees their own; the
 * Feedback inbox (helpInbox right: admins, PM, team leads by default) sees all.
 */
export const helpFeedback = pgTable(
  'help_feedback',
  {
    id: serial('id').primaryKey(),
    at: tz('at').notNull().defaultNow(),
    userId: integer('user_id').notNull(),
    name: text('name').notNull(),
    /** dashboard | page | project | person | finance */
    aboutKind: text('about_kind').notNull(),
    aboutId: integer('about_id'),
    /** The page, project or person as named when sent. */
    aboutLabel: text('about_label'),
    title: text('title').notNull(),
    details: text('details').notNull(),
    /** low | medium | high */
    impact: text('impact').notNull(),
    /** new | reviewed */
    status: text('status').notNull().default('new'),
    adminNote: text('admin_note'),
  },
  (t) => [index('help_feedback_user_idx').on(t.userId, t.at)],
);

/** Attachments of Help feedback: images, PDF, Excel, Word; at most 8 MB each. */
export const helpFiles = pgTable(
  'help_files',
  {
    id: serial('id').primaryKey(),
    feedbackId: integer('feedback_id').notNull(),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
  },
  (t) => [index('help_files_feedback_idx').on(t.feedbackId)],
);

/**
 * Every people or department change sent to Bitrix24 from the People directory (2026-10-12,
 * SRS 17): who, which person or department, what, from, to, and whether Bitrix24 took it.
 */
export const peopleActions = pgTable(
  'people_actions',
  {
    id: serial('id').primaryKey(),
    at: tz('at').notNull().defaultNow(),
    userId: integer('user_id').notNull(),
    /** user | department */
    subjectType: text('subject_type').notNull(),
    subjectId: integer('subject_id'),
    /** departments | position | add | rename | parent | head */
    action: text('action').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value').notNull(),
    ok: boolean('ok').notNull(),
    error: text('error'),
  },
  (t) => [index('people_actions_at_idx').on(t.at)],
);

/**
 * The development workflow (2026-10-12, SRS 22): every saved version, the newest in force.
 * Edited by admins on Projects › Workflow; an empty table means the standard workflow.
 */
export const workflowVersions = pgTable('workflow_versions', {
  version: integer('version').primaryKey(),
  at: tz('at').notNull().defaultNow(),
  byUser: integer('by_user').notNull(),
  definition: jsonb('definition').notNull(),
});
