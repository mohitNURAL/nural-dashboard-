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
]);

/** The only task fields the dashboard may change with tasks.task.update. */
export const EDITABLE_FIELDS = new Set([
  'GROUP_ID',
  'RESPONSIBLE_ID',
  'TAGS',
  'PRIORITY',
  'DEADLINE',
]);

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
