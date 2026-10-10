// Task table columns (DEV-06..08): Bitrix ID, Title, Assignee, Project, Stage, Tags, Priority,
// Deadline, Ageing; "All tasks" adds Creator and Created.
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import type { TaskRow } from '../../api/types';
import { PriorityBadge, StageChip, TagChips } from '../../components/chips';
import type { Columns } from '../../components/DataTable';
import { ageingText, fmtDate } from '../dev/format';

const col = createColumnHelper<TaskRow>();

/** Column ids that map to an /api/tasks sort key. */
export const SORTABLE: Record<string, 'deadline' | 'created' | 'id'> = {
  id: 'id',
  deadline: 'deadline',
  createdAt: 'created',
};

export function taskColumns({ withCreator = false } = {}): Columns<TaskRow> {
  const cols = [
    col.accessor('id', {
      header: 'ID',
      cell: (c) => (
        <a
          href={c.row.original.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-bold text-primary hover:underline"
        >
          {c.getValue()}
        </a>
      ),
    }),
    col.accessor('title', {
      header: 'Title',
      enableSorting: false,
      cell: (c) => (
        <span className="line-clamp-2 min-w-[14rem] max-w-[28rem]" title={c.getValue()}>
          {c.getValue()}
        </span>
      ),
    }),
    col.accessor((r) => r.assignee.name, {
      id: 'assignee',
      header: 'Assignee',
      enableSorting: false,
    }),
    ...(withCreator
      ? [
          col.accessor((r) => r.creator.name, {
            id: 'creator',
            header: 'Creator',
            enableSorting: false,
          }),
        ]
      : []),
    col.accessor((r) => r.project?.name ?? '—', {
      id: 'project',
      header: 'Project',
      enableSorting: false,
    }),
    col.accessor('stage', {
      header: 'Stage',
      enableSorting: false,
      cell: (c) => <StageChip title={c.getValue()} color={c.row.original.stageColor} />,
    }),
    col.accessor('tags', {
      header: 'Tags',
      enableSorting: false,
      cell: (c) => <TagChips tags={c.getValue()} max={2} />,
    }),
    col.accessor('priority', {
      header: 'Priority',
      enableSorting: false,
      cell: (c) => <PriorityBadge priority={c.getValue()} />,
    }),
    ...(withCreator
      ? [
          col.accessor('createdAt', {
            header: 'Created',
            cell: (c) => <span className="whitespace-nowrap">{fmtDate(c.getValue())}</span>,
          }),
        ]
      : []),
    col.accessor('deadline', {
      header: 'Deadline',
      cell: (c) => (
        <span className={clsx('whitespace-nowrap', c.row.original.overdue && 'text-bad')}>
          {fmtDate(c.getValue())}
        </span>
      ),
    }),
    col.accessor('ageingDays', {
      header: 'Ageing',
      enableSorting: false,
      cell: (c) => (
        <span
          className={clsx(
            'whitespace-nowrap',
            c.row.original.overdue ? 'font-bold text-bad' : 'text-text-muted',
          )}
        >
          {ageingText(c.getValue())}
        </span>
      ),
    }),
  ];
  return cols as Columns<TaskRow>;
}
