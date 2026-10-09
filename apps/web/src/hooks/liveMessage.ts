// Toast text for a live task change (SRS 6: "Task 41580 moved to In QA").
import type { TaskChanged } from '@nural/shared';

export function liveMessage(c: TaskChanged): string {
  const task = `Task ${c.taskId}`;
  if (c.deleted) return `${task} deleted`;
  if (c.isNew) return c.stage ? `${task} created in ${c.stage}` : `${task} created`;
  if (c.reopened && c.stage) return `${task} reopened, back to ${c.stage}`;
  if (c.stage && c.fromStage !== c.stage) return `${task} moved to ${c.stage}`;
  return `${task} updated`;
}
