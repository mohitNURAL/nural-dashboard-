// Inline task editing (SRS 7, Task actions). Each cell shows a label; clicking an editable cell
// turns it into a dropdown, text box or date picker, and it turns back into a label after a
// change or a click elsewhere. Changes run in Bitrix24 as the signed-in person and show here
// when they sync back. Full access may change every field; members only stage, status and tags.
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { useMe } from '../../api/me';
import { API_KEY, useApi } from '../../api/queries';
import type { BitrixStatus, BoardStage, Priority, TaskRow } from '../../api/types';
import { PriorityBadge, StageChip, StatusChip, TagChips } from '../../components/chips';
import { confirm } from '../../components/ui/ConfirmDialog';
import { fmtDate } from '../dev/format';
import { BoardsContext } from './boards';

export type EditField =
  'stage' | 'status' | 'project' | 'assignee' | 'tags' | 'priority' | 'deadline';
/** What a member may change (NFR-4); full access may change everything. */
const MEMBER_EDITS: readonly EditField[] = ['stage', 'status', 'tags'];

/** Whether the signed-in person may change this field (sign-in on, and their role allows it). */
function useCanEdit(field: EditField): boolean {
  const { data: me } = useMe();
  if (!me || me.auth !== 'bitrix') return false;
  return (me.editAll ?? me.full) || MEMBER_EDITS.includes(field);
}

const STATUS_LABEL: Record<BitrixStatus, string> = {
  pending: 'Pending',
  inProgress: 'In progress',
  deferred: 'Deferred',
  completed: 'Completed',
  supposedlyCompleted: 'Awaiting approval',
  declined: 'Declined',
};
const STATUS_CHOICES: BitrixStatus[] = ['pending', 'inProgress', 'deferred', 'completed'];
const PRIORITIES: Priority[] = ['low', 'normal', 'high'];

function useSave(taskId: number) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    try {
      await apiPost(`/api/tasks/${taskId}/${path}`, body);
      toast.success(done, {
        description: 'Bitrix24 updated. The dashboard refreshes in a few seconds.',
      });
      // The change syncs back through Bitrix24; refresh when it has (live updates also do).
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: [API_KEY] }), 3500);
    } catch (err) {
      toast.error(`Task ${taskId}: not changed`, {
        description: err instanceof Error ? err.message : 'Bitrix24 refused the change.',
      });
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

/**
 * A label that becomes an editor when clicked (if allowed) and a label again after a change or a
 * click elsewhere. Clicks never reach the row (which opens the task view).
 */
function InlineEdit({
  label,
  canEdit,
  editor,
  title,
}: {
  label: ReactNode;
  canEdit: boolean;
  /** The editor; call `close` once it has saved or been left. */
  editor: (close: () => void) => ReactNode;
  title: string;
}) {
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  // A click anywhere outside the editor turns it back into a label (as well as blur).
  useEffect(() => {
    if (!editing) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [editing]);
  if (editing && canEdit) {
    return (
      <span ref={box} onClick={(e) => e.stopPropagation()} className="inline-block">
        {editor(() => setEditing(false))}
      </span>
    );
  }
  if (!canEdit) return <>{label}</>;
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="-mx-1 rounded px-1 text-left hover:bg-primary-soft-100 hover:outline hover:outline-1 hover:outline-primary-soft-300"
    >
      {label}
    </button>
  );
}

const fieldClass =
  'h-7 rounded-control border border-primary bg-surface px-1 text-table text-text focus:outline focus:outline-2 focus:outline-primary';

/** A dropdown that saves on change and closes on change or blur. */
function SelectEditor<V extends string | number>({
  value,
  options,
  onPick,
  close,
  busy,
  label,
}: {
  value: V;
  options: { value: V; label: string; disabled?: boolean }[];
  onPick: (v: V) => void | Promise<void>;
  close: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <select
      autoFocus
      aria-label={label}
      className={clsx(fieldClass, 'max-w-48')}
      value={value}
      disabled={busy}
      onBlur={close}
      onChange={async (e) => {
        const picked = options.find((o) => String(o.value) === e.target.value);
        close();
        if (picked && picked.value !== value) await onPick(picked.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------- cells

/** The task's board column; "never moved" (0) is the board's first To do column. */
function currentColumn(t: TaskRow, board: BoardStage[]): number {
  if (t.stageId) return t.stageId;
  return (board.find((s) => s.stage === 'To do') ?? board[0])?.id ?? 0;
}

export function StageCell({ task, board }: { task: TaskRow; board?: BoardStage[] }) {
  const boards = useContext(BoardsContext);
  const columns = board ?? (task.project ? boards[String(task.project.id)] : undefined) ?? [];
  const canEdit = useCanEdit('stage') && columns.length > 0;
  const { busy, save } = useSave(task.id);
  return (
    <InlineEdit
      title="Click to move to another column"
      canEdit={canEdit}
      label={
        <span className="inline-flex flex-col items-start gap-0.5">
          <StageChip title={task.stageTitle ?? task.stage} color={task.stageColor} />
          {/* The dashboard's own status follows the column (SRS 5). */}
          <StatusChip status={task.status} />
        </span>
      }
      editor={(close) => (
        <SelectEditor
          label={`Move task ${task.id} to column`}
          value={currentColumn(task, columns)}
          options={columns.map((s) => ({ value: s.id, label: s.title }))}
          busy={busy}
          close={close}
          onPick={(id) =>
            save(
              'stage',
              { stageId: id },
              `Task ${task.id} moved to ${columns.find((s) => s.id === id)?.title}`,
            )
          }
        />
      )}
    />
  );
}

export function StatusCell({ task }: { task: TaskRow }) {
  const canEdit = useCanEdit('status');
  const { busy, save } = useSave(task.id);
  const label = (
    <span className="whitespace-nowrap rounded bg-primary-soft-100 px-1.5 py-0.5 text-table text-primary-dark">
      {STATUS_LABEL[task.bitrixStatus]}
    </span>
  );
  return (
    <InlineEdit
      title="Click to change the status"
      canEdit={canEdit}
      label={label}
      editor={(close) => (
        <SelectEditor
          label={`Status of task ${task.id}`}
          value={task.bitrixStatus}
          options={[
            ...(STATUS_CHOICES.includes(task.bitrixStatus)
              ? []
              : [
                  {
                    value: task.bitrixStatus,
                    label: STATUS_LABEL[task.bitrixStatus],
                    disabled: true,
                  },
                ]),
            ...STATUS_CHOICES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          ]}
          busy={busy}
          close={close}
          onPick={async (s) => {
            if (
              s === 'completed' &&
              !(await confirm({
                title: 'Complete this task?',
                message: 'It is completed in Bitrix24, in your name.',
                details: [
                  { label: 'Task', value: `${task.id} · ${task.title}` },
                  {
                    label: 'Status',
                    value: `${STATUS_LABEL[task.bitrixStatus]} → ${STATUS_LABEL[s]}`,
                  },
                ],
                confirmLabel: 'Complete task',
                tone: 'good',
              }))
            )
              return;
            return save('status', { status: s }, `Task ${task.id}: ${STATUS_LABEL[s]}`);
          }}
        />
      )}
    />
  );
}

interface EditOptions {
  projects: { id: number; name: string }[];
  people: { id: number; name: string; deptGroup: string }[];
}

/** Project and people choices, loaded only for full access (members cannot change them). */
function useEditOptions(enabled: boolean) {
  return useApi<EditOptions>('/api/tasks/edit-options', {}, { enabled });
}

export function ProjectCell({ task }: { task: TaskRow }) {
  const canEdit = useCanEdit('project');
  const { data } = useEditOptions(canEdit);
  const { busy, save } = useSave(task.id);
  return (
    <InlineEdit
      title="Click to move to another project"
      canEdit={canEdit}
      label={task.project?.name ?? '—'}
      editor={(close) => (
        <SelectEditor
          label={`Project of task ${task.id}`}
          value={task.project?.id ?? 0}
          options={[
            ...(task.project ? [] : [{ value: 0, label: '—', disabled: true }]),
            ...(data?.projects ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
          busy={busy}
          close={close}
          onPick={(id) =>
            save(
              'field',
              { field: 'project', value: id },
              `Task ${task.id} moved to ${data?.projects.find((p) => p.id === id)?.name}`,
            )
          }
        />
      )}
    />
  );
}

export function AssigneeCell({ task }: { task: TaskRow }) {
  const canEdit = useCanEdit('assignee');
  const { data } = useEditOptions(canEdit);
  const { busy, save } = useSave(task.id);
  return (
    <InlineEdit
      title="Click to assign to someone else"
      canEdit={canEdit}
      label={task.assignee.name}
      editor={(close) => (
        <SelectEditor
          label={`Assignee of task ${task.id}`}
          value={task.assignee.id}
          options={(data?.people ?? [{ id: task.assignee.id, name: task.assignee.name }]).map(
            (p) => ({
              value: p.id,
              label: p.name,
            }),
          )}
          busy={busy}
          close={close}
          onPick={(id) =>
            save(
              'field',
              { field: 'assignee', value: id },
              `Task ${task.id} assigned to ${data?.people.find((p) => p.id === id)?.name}`,
            )
          }
        />
      )}
    />
  );
}

export function PriorityCell({ task }: { task: TaskRow }) {
  const canEdit = useCanEdit('priority');
  const { busy, save } = useSave(task.id);
  return (
    <InlineEdit
      title="Click to change the priority"
      canEdit={canEdit}
      label={<PriorityBadge priority={task.priority} />}
      editor={(close) => (
        <SelectEditor
          label={`Priority of task ${task.id}`}
          value={task.priority}
          options={PRIORITIES.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))}
          busy={busy}
          close={close}
          onPick={(p) =>
            save('field', { field: 'priority', value: p }, `Task ${task.id}: priority ${p}`)
          }
        />
      )}
    />
  );
}

/** Several tags, comma-separated; saving replaces the list (new tags are created by Bitrix24). */
export function TagsCell({ task, max = 2 }: { task: TaskRow; max?: number }) {
  const canEdit = useCanEdit('tags');
  const { busy, save } = useSave(task.id);
  return (
    <InlineEdit
      title="Click to edit the tags (comma-separated)"
      canEdit={canEdit}
      label={
        task.tags.length ? (
          <TagChips tags={task.tags} max={max} />
        ) : (
          <span className="text-text-muted">Add tags</span>
        )
      }
      editor={(close) => (
        <TagsEditor
          initial={task.tags.join(', ')}
          busy={busy}
          close={close}
          onSave={(text) =>
            save('field', { field: 'tags', value: text }, `Task ${task.id}: tags saved`)
          }
        />
      )}
    />
  );
}

function TagsEditor({
  initial,
  busy,
  close,
  onSave,
}: {
  initial: string;
  busy: boolean;
  close: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(initial);
  const commit = () => {
    close();
    if (text.trim() !== initial.trim()) void onSave(text);
  };
  return (
    <input
      autoFocus
      aria-label="Tags, comma-separated"
      placeholder="bug, Backend App"
      className={clsx(fieldClass, 'w-56')}
      value={text}
      disabled={busy}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') close();
      }}
    />
  );
}

/** Deadline: a future date only; the time is the end of the working day (18:30 IST). */
export function DeadlineCell({ task }: { task: TaskRow }) {
  const canEdit = useCanEdit('deadline');
  const { busy, save } = useSave(task.id);
  const label = (
    <span className={clsx('whitespace-nowrap', task.overdue && 'text-bad')}>
      {fmtDate(task.deadline)}
    </span>
  );
  return (
    <InlineEdit
      title="Click to change the deadline (future dates only)"
      canEdit={canEdit}
      label={label}
      editor={(close) => (
        <input
          type="date"
          autoFocus
          aria-label={`Deadline of task ${task.id}`}
          className={fieldClass}
          min={firstAllowedDay()}
          defaultValue={task.deadline ? istDate(new Date(task.deadline)) : undefined}
          disabled={busy}
          onBlur={close}
          onChange={(e) => {
            const day = e.target.value;
            if (!day || day < firstAllowedDay()) return;
            close();
            void save(
              'field',
              { field: 'deadline', value: `${day}T18:30:00+05:30` },
              `Task ${task.id}: deadline ${fmtDate(`${day}T18:30:00+05:30`)}`,
            );
          }}
          onKeyDown={(e) => e.key === 'Escape' && close()}
        />
      )}
    />
  );
}

/** YYYY-MM-DD in IST. */
const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Today, while 18:30 IST is still ahead; otherwise tomorrow. */
function firstAllowedDay(): string {
  const now = new Date();
  const today = istDate(now);
  return new Date(`${today}T18:30:00+05:30`) > now
    ? today
    : istDate(new Date(now.getTime() + 86_400_000));
}
