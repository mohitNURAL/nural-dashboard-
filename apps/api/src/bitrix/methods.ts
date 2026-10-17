// The dashboard is read-only (CLAUDE.md): only these Bitrix24 methods may be called.
export const READ_METHODS = new Set([
  'profile',
  'batch',
  'tasks.task.list',
  'tasks.task.get',
  'tasks.task.history.list',
  'task.stages.get',
  'user.get',
  'department.get',
  'sonet_group.get',
]);

/**
 * The only writes, and only with the signed-in person's own OAuth token (never the webhook):
 * moving a task to another Kanban column, and Bitrix24's own status actions (Complete, Defer,
 * Start, Pause, Renew) behind the status dropdown (SRS 7, Task actions).
 */
export const USER_ACTION_METHODS = new Set([
  'task.stages.movetask',
  'tasks.task.complete',
  'tasks.task.defer',
  'tasks.task.start',
  'tasks.task.pause',
  'tasks.task.renew',
  // Field edits; the route sends only EDITABLE_FIELDS (project, assignee, tags, priority, deadline).
  'tasks.task.update',
  // The one task creation (2026-10-14, SRS 23): a task the person adds in the Daily update (plan or
  // wrap-up), assigned to themselves; only CREATE_FIELDS. Never a delete.
  'tasks.task.add',
]);

/**
 * The only fields tasks.task.add may send: a title, the person themselves, their project, and
 * (approved 2026-10-17) a description, tags, priority and deadline.
 */
export const CREATE_FIELDS = new Set([
  'TITLE',
  'RESPONSIBLE_ID',
  'GROUP_ID',
  'DESCRIPTION',
  'TAGS',
  'PRIORITY',
  'DEADLINE',
]);

/** Throws unless the new task has a title and an assignee and only CREATE_FIELDS. */
export function assertCreateFields(fields: Record<string, unknown> | undefined): void {
  const keys = Object.keys(fields ?? {});
  if (!fields?.TITLE || !fields.RESPONSIBLE_ID || keys.some((k) => !CREATE_FIELDS.has(k))) {
    throw new Error('tasks.task.add with fields outside the allowed set');
  }
}

/** The only task fields the dashboard may change with tasks.task.update. */
export const EDITABLE_FIELDS = new Set([
  'GROUP_ID',
  'RESPONSIBLE_ID',
  'TAGS',
  'PRIORITY',
  'DEADLINE',
]);

/**
 * People and departments (2026-10-12, SRS 17): the one exception besides task edits. Only an
 * admin, with their own OAuth token, may add a department, change a department (name, parent,
 * head), or change a person's departments and designation. Never a delete, never a new user.
 */
export const PEOPLE_ACTION_METHODS = new Set([
  'department.add',
  'department.update',
  'user.update',
]);

/** The only fields each people method may send. */
export const PEOPLE_FIELDS: Record<string, Set<string>> = {
  'department.add': new Set(['NAME', 'PARENT', 'UF_HEAD']),
  'department.update': new Set(['ID', 'NAME', 'PARENT', 'UF_HEAD']),
  'user.update': new Set(['ID', 'UF_DEPARTMENT', 'WORK_POSITION']),
};

/** Throws unless it is an allowed people method with only its allowed fields (and `auth`). */
export function assertPeopleAction(method: string, params: Record<string, unknown>): void {
  const allowed = PEOPLE_FIELDS[method];
  if (!PEOPLE_ACTION_METHODS.has(method) || !allowed) {
    throw new Error(`Bitrix24 method "${method}" is not an allowed people action`);
  }
  const extra = Object.keys(params).filter((k) => k !== 'auth' && !allowed.has(k));
  if (extra.length)
    throw new Error(`${method} with fields outside the allowed set: ${extra.join(', ')}`);
}

export function assertUserAction(method: string): void {
  if (!USER_ACTION_METHODS.has(method)) {
    throw new Error(`Bitrix24 method "${method}" is not an allowed task action`);
  }
}

export function assertReadOnly(method: string): void {
  if (!READ_METHODS.has(method)) {
    throw new Error(`Bitrix24 method "${method}" is not on the read-only allowlist`);
  }
}
