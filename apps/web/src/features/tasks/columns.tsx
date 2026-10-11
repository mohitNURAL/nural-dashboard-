// Task table columns. DEV-06..08: Bitrix ID, Title, Assignee, Project, Stage, Status, Tags,
// Priority, Deadline, Ageing ("All tasks" adds Creator and Created). QA-08..09: see issueColumns.
// Stage, Status, Project, Assignee, Tags, Priority and Deadline are edited in place (click a cell;
// TaskActions.tsx), within what the signed-in person may change.
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import type { TaskRow } from '../../api/types';
import type { Columns } from '../../components/DataTable';
import { ageingText, fmtDate } from '../dev/format';
import { LinkedTask } from './LinkedTask';
import {
  AssigneeCell,
  DeadlineCell,
  PriorityCell,
  ProjectCell,
  StageCell,
  StatusCell,
  TagsCell,
} from './TaskActions';

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
      cell: (c) => <AssigneeCell task={c.row.original} />,
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
      cell: (c) => <ProjectCell task={c.row.original} />,
    }),
    col.accessor('stage', {
      header: 'Stage',
      enableSorting: false,
      meta: {
        info: 'Kanban column; under it the dashboard status (Completed: QA Backlog, In QA, Done or LIVE; On hold; Pending). Click to move.',
      },
      cell: (c) => <StageCell task={c.row.original} />,
    }),
    col.accessor('bitrixStatus', {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      meta: {
        info: 'Bitrix24 status: Pending, In progress, Deferred, Completed. Click to change.',
      },
      cell: (c) => <StatusCell task={c.row.original} />,
    }),
    col.accessor('tags', {
      header: 'Tags',
      enableSorting: false,
      meta: { info: 'Click to edit: several tags, comma-separated.' },
      cell: (c) => <TagsCell task={c.row.original} />,
    }),
    col.accessor('priority', {
      header: 'Priority',
      enableSorting: false,
      cell: (c) => <PriorityCell task={c.row.original} />,
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
      cell: (c) => <DeadlineCell task={c.row.original} />,
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

const TYPE_STYLE = {
  bug: 'bg-bad-soft text-bad-dark',
  feedback: 'bg-primary-soft text-primary-dark',
} as const;

/**
 * QA-08: ID, Title, Type, Assignee, Creator, Project, Priority, Stage, Linked task, Created,
 * Deadline.
 * QA-09 (`full`) adds Rework and Age.
 */
export function issueColumns({ full = false } = {}): Columns<TaskRow> {
  const base = taskColumns();
  const pick = (id: string) =>
    base.find((c) => c.id === id || ('accessorKey' in c && c.accessorKey === id))!;
  const cols = [
    pick('id'),
    pick('title'),
    col.accessor('issueType', {
      header: 'Type',
      enableSorting: false,
      cell: (c) => {
        const t = c.getValue();
        return t ? (
          <span
            className={clsx(
              'rounded px-1.5 py-0.5 font-heading text-label font-bold uppercase',
              TYPE_STYLE[t],
            )}
          >
            {t}
          </span>
        ) : null;
      },
    }),
    pick('assignee'),
    col.accessor((r) => r.creator.name, { id: 'creator', header: 'Creator', enableSorting: false }),
    pick('project'),
    pick('priority'),
    pick('stage'),
    pick('status'),
    pick('tags'),
    col.accessor('linkedTaskId', {
      header: 'Linked task',
      enableSorting: false,
      cell: (c) => <LinkedTask id={c.getValue()} />,
    }),
    col.accessor('createdAt', {
      header: 'Created',
      cell: (c) => <span className="whitespace-nowrap">{fmtDate(c.getValue())}</span>,
    }),
    pick('deadline'),
    ...(full
      ? [
          col.accessor('rework', {
            header: 'Rework',
            enableSorting: false,
            meta: { align: 'right' },
            cell: (c) =>
              c.getValue() ? (
                <span className="font-bold text-bad">{c.getValue()}</span>
              ) : (
                <span className="text-text-muted">0</span>
              ),
          }),
          col.accessor('ageDays', {
            header: 'Age',
            enableSorting: false,
            meta: { align: 'right' },
            cell: (c) => {
              const d = c.getValue();
              return d === null || d === undefined ? (
                <span className="text-text-muted">closed</span>
              ) : (
                <span className="whitespace-nowrap">{d} d</span>
              );
            },
          }),
        ]
      : []),
  ];
  return cols as Columns<TaskRow>;
}
