// Edit several fields at once in the task view (2026-10-21): stage, status and tags for everyone
// who may edit; project, assignee, priority and deadline for full access (as the inline cells).
// Saved together (POST /api/tasks/:id/edit): checked first, nothing changes if one is refused,
// then run in Bitrix24 as the signed-in person. A new project has another board, so its column
// is picked after saving it.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { API_KEY } from '../../api/queries';
import type { BitrixStatus, BoardStage, Priority, TaskRow } from '../../api/types';
import { confirm } from '../../components/ui/ConfirmDialog';
import { Select } from '../../components/ui/Select';
import {
  currentColumn,
  firstAllowedDay,
  istDate,
  PRIORITIES,
  STATUS_CHOICES,
  STATUS_LABEL,
  useCanEdit,
  useEditOptions,
} from './TaskActions';

type Edit =
  | { kind: 'stage'; stageId: number }
  | { kind: 'status'; status: BitrixStatus }
  | {
      kind: 'field';
      field: 'project' | 'assignee' | 'priority' | 'deadline' | 'tags';
      value: string | number;
    };

const inputClass =
  'h-8 w-full rounded-control border border-border bg-surface px-2 text-table text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

export function TaskEditForm({
  task,
  board,
  onDone,
}: {
  task: TaskRow;
  board: BoardStage[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const full = useCanEdit('project');
  const { data: options } = useEditOptions(full);
  const startColumn = currentColumn(task, board);
  const startDay = task.deadline ? istDate(new Date(task.deadline)) : '';
  const startTags = task.tags.join(', ');
  const [stageId, setStageId] = useState(startColumn);
  const [status, setStatus] = useState<BitrixStatus>(task.bitrixStatus);
  const [tags, setTags] = useState(startTags);
  const [project, setProject] = useState(task.project?.id ?? 0);
  const [assignee, setAssignee] = useState(task.assignee.id);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [day, setDay] = useState(startDay);
  const [busy, setBusy] = useState(false);

  const projectChanged = project !== (task.project?.id ?? 0);
  const columnName = (id: number) => board.find((s) => s.id === id)?.title ?? '';
  // What will change, in the order it runs, with a line for the confirmation.
  const changes: { edit: Edit; line: [string, string] }[] = [];
  const field = (
    f: Extract<Edit, { kind: 'field' }>['field'],
    value: string | number,
    line: [string, string],
  ) => changes.push({ edit: { kind: 'field', field: f, value }, line });
  if (full && projectChanged)
    field('project', project, [
      'Project',
      `${task.project?.name ?? '—'} → ${options?.projects.find((p) => p.id === project)?.name ?? project}`,
    ]);
  if (full && assignee !== task.assignee.id)
    field('assignee', assignee, [
      'Assignee',
      `${task.assignee.name} → ${options?.people.find((p) => p.id === assignee)?.name ?? assignee}`,
    ]);
  if (full && priority !== task.priority)
    field('priority', priority, ['Priority', `${task.priority} → ${priority}`]);
  if (full && day && day !== startDay)
    field('deadline', `${day}T18:30:00+05:30`, ['Deadline', `${startDay || '—'} → ${day}`]);
  if (tags.trim() !== startTags.trim()) field('tags', tags, ['Tags', tags.trim() || '(none)']);
  if (!projectChanged && board.length && stageId !== startColumn)
    changes.push({
      edit: { kind: 'stage', stageId },
      line: ['Stage', `${columnName(startColumn)} → ${columnName(stageId)}`],
    });
  if (status !== task.bitrixStatus)
    changes.push({
      edit: { kind: 'status', status },
      line: ['Status', `${STATUS_LABEL[task.bitrixStatus]} → ${STATUS_LABEL[status]}`],
    });

  const save = async () => {
    if (!changes.length) return onDone();
    if (
      !(await confirm({
        title: `Save ${changes.length} change${changes.length === 1 ? '' : 's'}?`,
        message: 'They are made in Bitrix24, in your name, one after another.',
        details: [
          { label: 'Task', value: `${task.id} · ${task.title}` },
          ...changes.map((c) => ({ label: c.line[0], value: c.line[1] })),
        ],
        confirmLabel: 'Save changes',
        tone: status === 'completed' && status !== task.bitrixStatus ? 'good' : undefined,
      }))
    )
      return;
    setBusy(true);
    try {
      await apiPost(`/api/tasks/${task.id}/edit`, { edits: changes.map((c) => c.edit) });
      toast.success(
        `Task ${task.id}: ${changes.length} change${changes.length === 1 ? '' : 's'} saved`,
        {
          description: 'Bitrix24 updated. The dashboard refreshes in a few seconds.',
        },
      );
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: [API_KEY] }), 3500);
      onDone();
    } catch (err) {
      toast.error(`Task ${task.id}: not saved`, {
        description: err instanceof Error ? err.message : 'Bitrix24 refused the change.',
      });
    } finally {
      setBusy(false);
    }
  };

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div className="contents">
      <dt className="pt-1.5 font-heading text-label uppercase text-text-muted">{label}</dt>
      <dd className="min-w-0">
        {control}
        {hint && <p className="mt-1 text-[12px] text-text-muted">{hint}</p>}
      </dd>
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-primary-soft-300 bg-primary-soft-100/40 p-3">
      <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2.5">
        {row(
          'Stage',
          <Select
            size="sm"
            className="w-full"
            aria-label="Stage"
            value={stageId}
            disabled={busy || projectChanged || !board.length}
            onChange={(e) => setStageId(Number(e.target.value))}
          >
            {board.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>,
          projectChanged
            ? 'The new project has its own columns: pick one after saving.'
            : !board.length
              ? 'Not on a Kanban board (no project).'
              : undefined,
        )}
        {row(
          'Status',
          <Select
            size="sm"
            className="w-full"
            aria-label="Status"
            value={status}
            disabled={busy}
            onChange={(e) => setStatus(e.target.value as BitrixStatus)}
          >
            {!STATUS_CHOICES.includes(task.bitrixStatus) && (
              <option value={task.bitrixStatus} disabled>
                {STATUS_LABEL[task.bitrixStatus]}
              </option>
            )}
            {STATUS_CHOICES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>,
        )}
        {full &&
          row(
            'Project',
            <Select
              size="sm"
              className="w-full"
              aria-label="Project"
              value={project}
              disabled={busy || !options}
              onChange={(e) => setProject(Number(e.target.value))}
            >
              {!task.project && <option value={0}>—</option>}
              {task.project && !options && (
                <option value={task.project.id}>{task.project.name}</option>
              )}
              {(options?.projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>,
          )}
        {full &&
          row(
            'Assignee',
            <Select
              size="sm"
              className="w-full"
              aria-label="Assignee"
              value={assignee}
              disabled={busy || !options}
              onChange={(e) => setAssignee(Number(e.target.value))}
            >
              {(options?.people ?? [{ id: task.assignee.id, name: task.assignee.name }]).map(
                (p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ),
              )}
            </Select>,
          )}
        {full &&
          row(
            'Priority',
            <Select
              size="sm"
              className="w-full"
              aria-label="Priority"
              value={priority}
              disabled={busy}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0]!.toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>,
          )}
        {full &&
          row(
            'Deadline',
            <input
              type="date"
              aria-label="Deadline"
              className={inputClass}
              min={firstAllowedDay()}
              value={day}
              disabled={busy}
              onChange={(e) => setDay(e.target.value)}
            />,
            'Due at the end of that working day (18:30).',
          )}
        {row(
          'Tags',
          <input
            aria-label="Tags, comma-separated"
            placeholder="bug, Backend App"
            className={inputClass}
            value={tags}
            disabled={busy}
            onChange={(e) => setTags(e.target.value)}
          />,
          'Comma-separated; replaces the list.',
        )}
      </dl>
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-table text-text-muted">
          {changes.length
            ? `${changes.length} change${changes.length === 1 ? '' : 's'}`
            : 'No changes yet'}
        </span>
        <button type="button" onClick={onDone} disabled={busy} className="btn btn-stroke h-8 px-3">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={
            busy || !changes.length || (!!day && day < firstAllowedDay() && day !== startDay)
          }
          className="btn btn-card h-8 px-3 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
