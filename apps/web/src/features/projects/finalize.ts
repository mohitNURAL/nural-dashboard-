// Preparing an edited workflow for saving (Projects › Workflow editor, SRS 22): renames followed
// through every arrow, the rework rule and the project types, the old name kept as a column name,
// removed stages dropped from every reference.
import type { Workflow, WorkflowStage } from '@nural/shared';

export interface Item {
  id: string;
  /** The title it had when the editor opened (null for a new stage). */
  orig: string | null;
  stage: WorkflowStage;
}

/** The workflow to save: renames followed through everywhere, removed stages dropped. */
export function finalize(original: Workflow, items: Item[], rework: Workflow['rework']): Workflow {
  const renamed = new Map(
    items.filter((i) => i.orig && i.orig !== i.stage.title).map((i) => [i.orig!, i.stage.title]),
  );
  const alive = new Set(items.map((i) => i.stage.title));
  const map = (t: string) => renamed.get(t) ?? t;
  const keep = (list: string[]) => [...new Set(list.map(map).filter((t) => alive.has(t)))];
  return {
    ...original,
    stages: items.map(({ orig, stage }) => ({
      ...stage,
      title: stage.title.trim(),
      // The old name stays a column name, so boards still using it map here.
      aliases: [
        ...new Set([
          ...stage.aliases.map((a) => a.trim()).filter(Boolean),
          ...(orig && orig !== stage.title ? [orig] : []),
        ]),
      ].filter((a) => a !== stage.title),
      next: keep(stage.next),
    })),
    rework: { from: keep(rework.from), to: keep(rework.to) },
    projectTypes: original.projectTypes.map((t) => ({
      ...t,
      requires: keep(t.requires),
      forbids: keep(t.forbids),
    })),
  };
}
