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

export function assertReadOnly(method: string): void {
  if (!READ_METHODS.has(method)) {
    throw new Error(`Bitrix24 method "${method}" is not on the read-only allowlist`);
  }
}
