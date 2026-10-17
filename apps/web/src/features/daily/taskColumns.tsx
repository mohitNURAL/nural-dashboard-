// The Daily update's task rows (2026-10-17): every field as the task lists show it, edited in
// place with the same editors and rights (stage, status, project, priority, tags, deadline; a
// member changes only stage, status and tags), plus the task's Daily state (Pending, WIP, Done,
// On hold) by the Slack status rules (packages/shared daily.ts dailyState).
import type { DailyState } from '@nural/shared';
import clsx from 'clsx';
import type { TaskRow } from '../../api/types';
import {
  DeadlineCell,
  PriorityCell,
  ProjectCell,
  StageCell,
  StatusCell,
  TagsCell,
} from '../tasks/TaskActions';

const STATE_STYLE: Record<DailyState, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-warn/15 text-warn' },
  wip: { label: 'WIP', cls: 'bg-primary/10 text-primary' },
  done: { label: 'Done', cls: 'bg-good/15 text-good' },
  hold: { label: 'On hold', cls: 'bg-primary-soft-100 text-text' },
};

export function StateChip({ state }: { state: DailyState | undefined }) {
  if (!state) return <span className="text-text-muted">—</span>;
  const s = STATE_STYLE[state];
  return (
    <span
      className={clsx('whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold', s.cls)}
    >
      {s.label}
    </span>
  );
}

/** One editable field of a task; plain text when the task is not in the person's data. */
export function TaskField({
  kind,
  row,
  fallback = '—',
}: {
  kind: 'project' | 'stage' | 'status' | 'priority' | 'tags' | 'deadline';
  row: TaskRow | undefined;
  fallback?: string;
}) {
  if (!row) return <span className="text-text">{fallback}</span>;
  switch (kind) {
    case 'project':
      return <ProjectCell task={row} />;
    case 'stage':
      return <StageCell task={row} />;
    case 'status':
      return <StatusCell task={row} />;
    case 'priority':
      return <PriorityCell task={row} />;
    case 'tags':
      return <TagsCell task={row} />;
    case 'deadline':
      return <DeadlineCell task={row} />;
  }
}

/** "#123 Title", the ID linking to the task in Bitrix24. */
export function TaskTitle({ id, title, url }: { id: number; title: string; url?: string }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      {id > 0 &&
        (url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 font-heading text-[12px] font-bold text-primary hover:underline"
          >
            #{id}
          </a>
        ) : (
          <span className="shrink-0 text-[12px] text-text-muted">#{id}</span>
        ))}
      <span className="font-semibold text-text">{title}</span>
    </span>
  );
}
