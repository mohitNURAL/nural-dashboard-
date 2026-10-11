// Task actions (SRS 7): move a task to another column of its board, or change its Bitrix24
// status. Both run as the signed-in person in Bitrix24; the dashboard updates when the change
// syncs back (a few seconds). Shown in every task grid row and in the task view.
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useContext, useState } from 'react';
import { toast } from 'sonner';
import { API_KEY, useApi } from '../../api/queries';
import { apiPost } from '../../api/client';
import type { BitrixStatus, BoardStage, TaskRow } from '../../api/types';
import { BoardsContext } from './boards';

const STATUS_OPTIONS: { value: BitrixStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'inProgress', label: 'In progress' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'completed', label: 'Completed' },
];
/** Shown when Bitrix24 has the task in a status the dropdown cannot set. */
const READ_ONLY_STATUS: Partial<Record<BitrixStatus, string>> = {
  supposedlyCompleted: 'Awaiting approval',
  declined: 'Declined',
};

/** Whether the signed-in person can make changes (sign-in with Bitrix24 is on). */
function useCanAct() {
  const { data } = useApi<{ auth: 'off' | 'bitrix' }>('/api/auth/me', {});
  return data?.auth === 'bitrix';
}

function useAction(taskId: number) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (path: string, body: unknown, done: string) => {
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
  return { busy, run };
}

const selectClass = (compact: boolean) =>
  clsx(
    'rounded-control border border-border bg-surface text-text hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60',
    compact ? 'h-7 max-w-36 px-1 text-table' : 'h-9 w-full px-2 text-body',
  );

/** The task's board column; "never moved" (0) is the board's first To do column. */
function currentColumn(t: TaskRow, board: BoardStage[]): number {
  if (t.stageId) return t.stageId;
  return (board.find((s) => s.stage === 'To do') ?? board[0])?.id ?? 0;
}

export function StageSelect({
  task,
  board,
  compact = false,
}: {
  task: TaskRow;
  board?: BoardStage[];
  compact?: boolean;
}) {
  const boards = useContext(BoardsContext);
  const columns = board ?? (task.project ? boards[String(task.project.id)] : undefined) ?? [];
  const canAct = useCanAct();
  const { busy, run } = useAction(task.id);
  if (!columns.length) return <span className="text-text-muted">—</span>;
  const current = currentColumn(task, columns);
  return (
    <select
      aria-label={`Move task ${task.id} to column`}
      title={
        canAct ? 'Move to another column in Bitrix24' : 'Sign in with Bitrix24 to change tasks'
      }
      className={selectClass(compact)}
      value={current}
      disabled={!canAct || busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const to = columns.find((s) => s.id === Number(e.target.value));
        if (to) void run('stage', { stageId: to.id }, `Task ${task.id} moved to ${to.title}`);
      }}
    >
      {columns.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
    </select>
  );
}

export function StatusSelect({ task, compact = false }: { task: TaskRow; compact?: boolean }) {
  const canAct = useCanAct();
  const { busy, run } = useAction(task.id);
  const readOnly = READ_ONLY_STATUS[task.bitrixStatus];
  return (
    <select
      aria-label={`Bitrix24 status of task ${task.id}`}
      title={
        canAct ? 'Change the task status in Bitrix24' : 'Sign in with Bitrix24 to change tasks'
      }
      className={selectClass(compact)}
      value={task.bitrixStatus}
      disabled={!canAct || busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const to = STATUS_OPTIONS.find((o) => o.value === e.target.value);
        if (!to) return;
        if (to.value === 'completed' && !window.confirm(`Complete task ${task.id} in Bitrix24?`)) {
          return;
        }
        void run('status', { status: to.value }, `Task ${task.id}: ${to.label}`);
      }}
    >
      {readOnly && (
        <option value={task.bitrixStatus} disabled>
          {readOnly}
        </option>
      )}
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
