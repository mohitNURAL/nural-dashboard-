// The Daily update dialog (2026-10-14, SRS 23). Plan: what is carried over from the last plan
// (still pending or WIP), the person's overdue and due-today tasks, upcoming ones to take on
// early and those with no deadline (posting sets it to today, 2026-10-21); kept, removed or added
// to, with a note, posted to the Slack daily work update group.
// Wrap-up: the plan with each task's state (Pending, WIP, Done, On hold; Done completes it in
// Bitrix24), tasks finished ahead, and work done outside the plan. Every task row is edited in
// place like the task lists (2026-10-17). Opens from the dock icon, the Daily update page or before
// signing out, never by itself. Tables and dropdowns are the shared ones.
import * as Dialog from '@radix-ui/react-dialog';
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DailyState } from '@nural/shared';
import type { TaskRow } from '../../api/types';
import { DataTable } from '../../components/DataTable';
import { SearchCombobox } from '../../components/SearchCombobox';
import { IconClose, IconDaily } from '../../components/ui/icons';
import { Select } from '../../components/ui/Select';
import {
  useDailyPost,
  useDailyToday,
  useMyOpenTasks,
  type DailyItem,
  type DailyToday,
  type WrapItem,
} from './api';
import { AddTaskDialog } from './AddTaskDialog';
import { useDailyDialog } from './store';
import { LateChip, StateChip, TaskField, TaskTitle } from './taskColumns';
import { BoardsContext } from '../tasks/boards';

const WHY: Record<DailyItem['why'], { label: string; cls: string }> = {
  carried: { label: 'Carried over', cls: 'bg-accent/15 text-accent-dark' },
  overdue: { label: 'Overdue', cls: 'bg-bad/15 text-bad' },
  today: { label: 'Due today', cls: 'bg-warn/15 text-warn' },
  upcoming: { label: 'Taken early', cls: 'bg-primary/10 text-primary' },
  noDeadline: { label: 'No deadline → today', cls: 'bg-warn/15 text-warn' },
  added: { label: 'Added', cls: 'bg-primary/10 text-primary' },
};

const btn =
  'h-10 rounded-control border border-border px-4 font-heading text-button text-text-muted hover:border-primary hover:text-primary disabled:opacity-50';
const mainBtn =
  'h-10 rounded-control bg-gradient-to-r from-primary to-accent px-4 font-heading text-button text-white shadow-sm hover:brightness-110 disabled:opacity-50';

export function DailyDialog() {
  const { mode, after, close } = useDailyDialog();
  const { data: today } = useDailyToday(!!mode);
  const later = () => {
    const then = after;
    close();
    then?.();
  };
  return (
    <Dialog.Root open={!!mode} onOpenChange={(o) => !o && later()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[58] bg-black/45 backdrop-blur-sm"
          style={{ animation: 'fade-in 160ms ease-out' }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[58] flex max-h-[92vh] w-[min(1240px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop"
          style={{ animation: 'tour-in 200ms cubic-bezier(0.2,0,0,1)' }}
        >
          <div className="h-1.5 shrink-0 bg-gradient-to-r from-primary via-accent to-primary" />
          <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white">
              <IconDaily size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                {mode === 'wrap'
                  ? 'Wrap up your day'
                  : today?.plan
                    ? 'Your plan for today'
                    : 'Plan your day'}
                {today && <span className="text-text-muted"> · {today.dayLabel}</span>}
              </Dialog.Title>
              <p className="mt-0.5 text-table text-text-muted">
                {mode === 'wrap'
                  ? 'Mark what is done, add anything else you did, then post it to the team.'
                  : today?.plan
                    ? 'What you posted to the team this morning. Add more tasks as the day goes, change the plan, or wrap up.'
                    : 'What carries over, what is overdue or due today, upcoming tasks to take on early and tasks with no deadline (planned, they are due today). Edit any task in place, keep, remove or add, then post it to the team.'}
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          {!today ? (
            <div className="h-40 animate-pulse bg-primary-soft-100/40" />
          ) : (
            // The stage editor needs each project's Kanban columns.
            <BoardsContext.Provider value={today.boards ?? {}}>
              {mode === 'wrap' ? (
                <WrapView today={today} onLater={later} />
              ) : (
                <PlanView
                  key={today.day}
                  today={today}
                  onLater={later}
                  startAdding={mode === 'add'}
                />
              )}
            </BoardsContext.Provider>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Where it goes, or why it will only be saved. */
function Destination({ today }: { today: DailyToday }) {
  const text = !today.slack
    ? 'Slack is not connected yet: it is saved here only.'
    : !today.channel
      ? 'No daily work update channel is set yet (Integration › Connections): it is saved here only.'
      : `Posted to the daily work update group, with your name.`;
  return (
    <p
      className={clsx('text-table', today.slack && today.channel ? 'text-text-muted' : 'text-warn')}
    >
      {text}
    </p>
  );
}

function useAfterPost() {
  const { after, close } = useDailyDialog();
  return (
    r: { posted: boolean; reason?: string; failures?: { title: string; message: string }[] },
    what: string,
  ) => {
    if (r.posted) toast.success(`${what} posted to the team`);
    else toast.warning(`${what} saved, not posted`, { description: r.reason });
    for (const f of r.failures ?? []) {
      toast.error(`Not saved in Bitrix24: ${f.title}`, {
        description: f.message,
        duration: 10_000,
      });
    }
    close();
    after?.();
  };
}

type PlanRow = DailyItem & { keep: boolean; row?: TaskRow; state?: DailyState };
const planCol = createColumnHelper<PlanRow>();

/** The task's fields as columns, edited in place (shared by the plan and upcoming tables). */
function fieldColumns<
  T extends { title: string; project: string; taskId: number; row?: TaskRow; state?: DailyState },
>(col: ReturnType<typeof createColumnHelper<T>>) {
  return [
    col.accessor((r) => r.title, {
      id: 'task',
      header: 'Task',
      cell: (c) => (
        <TaskTitle
          id={c.row.original.taskId}
          title={c.row.original.row?.title ?? c.row.original.title}
          url={c.row.original.row?.url}
        />
      ),
    }),
    col.accessor((r) => r.project, {
      id: 'project',
      header: 'Project',
      cell: (c) => <TaskField kind="project" row={c.row.original.row} fallback={c.getValue()} />,
    }),
    col.display({
      id: 'stage',
      header: 'Stage',
      cell: (c) => <TaskField kind="stage" row={c.row.original.row} />,
    }),
    col.display({
      id: 'status',
      header: 'Status',
      cell: (c) => <TaskField kind="status" row={c.row.original.row} />,
    }),
    col.display({
      id: 'priority',
      header: 'Priority',
      cell: (c) => <TaskField kind="priority" row={c.row.original.row} />,
    }),
    col.display({
      id: 'tags',
      header: 'Tags',
      cell: (c) => <TaskField kind="tags" row={c.row.original.row} />,
    }),
    col.display({
      id: 'deadline',
      header: 'Deadline',
      cell: (c) => <TaskField kind="deadline" row={c.row.original.row} />,
    }),
    col.accessor((r) => r.state ?? '', {
      id: 'state',
      header: 'Now',
      cell: (c) => <StateChip state={c.row.original.state} />,
    }),
  ];
}

const whyChip = (why: DailyItem['why'], days?: number) => {
  const w = WHY[why];
  return (
    <span
      className={clsx(
        'whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold',
        w.cls,
      )}
    >
      {w.label}
      {why === 'overdue' && days ? ` ${days}d` : ''}
    </span>
  );
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/**
 * Once posted, the plan opens as what was posted (2026-10-22), not the planner: the tasks with
 * their state now, Add more tasks for the rest of the day, Edit plan for the full planner.
 */
function PlanView({
  today,
  onLater,
  startAdding,
}: {
  today: DailyToday;
  onLater: () => void;
  startAdding: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (today.plan && !editing)
    return (
      <PostedPlan
        today={today}
        onLater={onLater}
        onEdit={() => setEditing(true)}
        startAdding={startAdding}
      />
    );
  return <PlanEditor today={today} onLater={onLater} />;
}

function PostedPlan({
  today,
  onLater,
  onEdit,
  startAdding,
}: {
  today: DailyToday;
  onLater: () => void;
  onEdit: () => void;
  startAdding: boolean;
}) {
  const postDaily = useDailyPost();
  const { open } = useDailyDialog();
  const [adding, setAdding] = useState(startAdding);
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<DailyItem[]>([]);
  const [busy, setBusy] = useState(false);
  const { data: mine } = useMyOpenTasks('', adding);
  const plan = today.plan!;
  const onPlan = new Set(plan.items.map((i) => i.taskId));

  const columns = useMemo(
    () => [
      ...fieldColumns(planCol),
      planCol.accessor('why', {
        header: 'Why',
        cell: (c) => (
          <span className="flex flex-wrap gap-1">
            {whyChip(c.getValue(), c.row.original.daysOverdue)}
            {c.row.original.addedAt && (
              <span className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold text-primary">
                Added {timeOf(c.row.original.addedAt)}
              </span>
            )}
          </span>
        ),
      }),
    ],
    [],
  );
  const rows: PlanRow[] = plan.items.map((i) => ({
    ...i,
    keep: true,
    row: today.rows?.[i.taskId],
    state: today.states?.[i.taskId],
  }));

  // Any of their open tasks not on the plan yet: upcoming, no deadline, or found by search.
  const choices = new Map<number, DailyItem>();
  for (const u of [...(today.upcoming ?? []), ...(today.noDeadline ?? [])])
    choices.set(u.taskId, u);
  for (const t of mine?.tasks ?? [])
    if (!choices.has(t.id))
      choices.set(t.id, {
        taskId: t.id,
        title: t.title,
        project: t.project,
        why: t.deadline ? 'added' : 'noDeadline',
      });
  const pick = (item: DailyItem) =>
    setPicked((xs) => (xs.some((x) => x.taskId === item.taskId) ? xs : [...xs, item]));

  const addToPlan = async () => {
    setBusy(true);
    try {
      const r = await postDaily('add', { taskIds: picked.map((p) => p.taskId) });
      if (r.posted) toast.success('Added to your plan and posted to the team');
      else toast.warning('Added to your plan, not posted', { description: r.reason });
      for (const f of r.failures ?? [])
        toast.error(`Not saved in Bitrix24: ${f.title}`, {
          description: f.message,
          duration: 10_000,
        });
      setPicked([]);
      setAdding(false);
    } catch (e) {
      toast.error('Could not add to your plan', {
        description: e instanceof Error ? e.message : '',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
        <p className="flex flex-wrap items-center gap-2 rounded-control bg-good/10 px-3 py-2 text-table font-medium text-good">
          Posted{today.plannedAt ? ` at ${timeOf(today.plannedAt)}` : ''} · {plan.items.length}{' '}
          {plan.items.length === 1 ? 'task' : 'tasks'}
          {today.late && <LateChip by={today.planBy} />}
        </p>
        <DataTable
          tableId="daily-posted"
          columns={columns}
          data={rows}
          rowKey={(r) => r.taskId}
          dense
          maxHeight={360}
          emptyText="No tasks on your plan. Add the tasks you will work on."
        />
        {plan.note && (
          <p className="rounded-control border border-border px-3 py-2 text-body text-text">
            {plan.note}
          </p>
        )}
        {adding && (
          <div className="space-y-2 rounded-xl border border-primary/40 p-3">
            <p className="font-heading text-label font-bold uppercase tracking-wide text-primary">
              Add more tasks
              <span className="ml-2 font-body text-[12px] font-normal normal-case tracking-normal text-text-muted">
                Added to today’s plan and posted in its thread; a task with no deadline gets
                today’s.
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SearchCombobox
                label="Add one of my tasks"
                single
                className="min-w-[16rem] flex-1"
                loading={!mine}
                options={[...choices.values()]
                  .filter(
                    (c) => !onPlan.has(c.taskId) && !picked.some((p) => p.taskId === c.taskId),
                  )
                  .map((c) => ({
                    value: String(c.taskId),
                    label: `#${c.taskId} ${c.title} · ${c.project}`,
                  }))}
                selected={[]}
                onChange={(v) => {
                  const c = v[0] ? choices.get(Number(v[0])) : undefined;
                  if (c) pick(c);
                }}
              />
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={!today.canWrite}
                title={today.canWrite ? undefined : 'Sign in again with Bitrix24 to create tasks'}
                className="h-9 rounded-control bg-primary px-3 font-heading text-button text-white hover:brightness-110 disabled:opacity-50"
              >
                + Add task
              </button>
            </div>
            {picked.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {picked.map((p) => (
                  <li
                    key={p.taskId}
                    className="flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-table text-primary"
                  >
                    #{p.taskId} {p.title}
                    <button
                      type="button"
                      aria-label={`Remove ${p.title}`}
                      onClick={() => setPicked((xs) => xs.filter((x) => x.taskId !== p.taskId))}
                      className="grid h-5 w-5 place-items-center rounded-full hover:bg-primary/20"
                    >
                      <IconClose size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AddTaskDialog
              open={creating}
              forWrap={false}
              onClose={() => setCreating(false)}
              onCreated={(t) =>
                pick({ taskId: t.taskId, title: t.title, project: t.project, why: 'added' })
              }
            />
          </div>
        )}
        <Destination today={today} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" className={clsx(btn, 'mr-auto')} onClick={onEdit}>
          Edit plan
        </button>
        <button type="button" className={btn} onClick={onLater}>
          Close
        </button>
        <button type="button" className={btn} onClick={() => open('wrap')}>
          Wrap up now
        </button>
        {adding ? (
          <button
            type="button"
            className={mainBtn}
            disabled={busy || !picked.length}
            onClick={() => void addToPlan()}
          >
            {busy ? 'Adding…' : `Add to my plan${picked.length ? ` (${picked.length})` : ''}`}
          </button>
        ) : (
          <button type="button" className={mainBtn} onClick={() => setAdding(true)}>
            + Add more tasks
          </button>
        )}
      </div>
    </>
  );
}

function PlanEditor({ today, onLater }: { today: DailyToday; onLater: () => void }) {
  const postDaily = useDailyPost();
  const done = useAfterPost();
  const { open } = useDailyDialog();
  const [items, setItems] = useState<DailyItem[]>([]);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data: mine } = useMyOpenTasks('');

  // The saved plan when posted earlier today, else the suggestions.
  useEffect(() => {
    const saved = today.plan?.items ?? [];
    const rows = [
      ...saved,
      ...today.suggestions.filter((s) => !saved.some((p) => p.taskId === s.taskId)),
    ];
    setItems(rows);
    setKeep(new Set((today.plan ? saved : today.suggestions).map((i) => i.taskId)));
    setNote(today.plan?.note ?? '');
  }, [today.day, !!today.plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem = (item: DailyItem) => {
    if (!items.some((i) => i.taskId === item.taskId)) setItems((xs) => [...xs, item]);
    setKeep((k) => new Set(k).add(item.taskId));
  };
  const add = (id: number) => {
    const up = [...today.upcoming, ...(today.noDeadline ?? [])].find((u) => u.taskId === id);
    if (up) return addItem(up);
    const t = mine?.tasks.find((x) => x.id === id);
    if (t)
      addItem({
        taskId: t.id,
        title: t.title,
        project: t.project,
        why: t.deadline ? 'added' : 'noDeadline',
      });
  };
  const toggle = (id: number) =>
    setKeep((k) => {
      const n = new Set(k);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const columns = useMemo(
    () => [
      planCol.accessor('keep', {
        header: 'Plan',
        enableSorting: false,
        cell: (c) => (
          <input
            type="checkbox"
            aria-label={`Keep ${c.row.original.title} on the plan`}
            checked={c.getValue()}
            onChange={() => toggle(c.row.original.taskId)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
        ),
      }),
      ...fieldColumns(planCol),
      planCol.accessor('why', {
        header: 'Why',
        cell: (c) => whyChip(c.getValue(), c.row.original.daysOverdue),
      }),
    ],
    [],
  );

  const live = (i: DailyItem) => ({
    row: today.rows?.[i.taskId],
    state: today.states?.[i.taskId],
  });
  const rows: PlanRow[] = items.map((i) => ({ ...i, keep: keep.has(i.taskId), ...live(i) }));
  const upcoming: PlanRow[] = (today.upcoming ?? [])
    .filter((u) => !keep.has(u.taskId))
    .map((u) => ({ ...u, keep: false, ...live(u) }));
  const noDeadline: PlanRow[] = (today.noDeadline ?? [])
    .filter((u) => !keep.has(u.taskId))
    .map((u) => ({ ...u, keep: false, ...live(u) }));
  const undatedPlanned = items.filter(
    (i) => keep.has(i.taskId) && today.rows?.[i.taskId] && !today.rows[i.taskId]!.deadline,
  ).length;
  const upCols = useMemo(
    () => [
      ...fieldColumns(planCol),
      planCol.display({
        id: 'add',
        header: '',
        cell: (c) => (
          <button
            type="button"
            onClick={() => addItem(c.row.original)}
            className="whitespace-nowrap rounded-control border border-primary px-2.5 py-1 font-heading text-button text-primary hover:bg-primary/10"
          >
            Add to plan
          </button>
        ),
      }),
    ],
    [items], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const post = async () => {
    setBusy(true);
    try {
      const r = await postDaily('plan', {
        taskIds: items.filter((i) => keep.has(i.taskId)).map((i) => i.taskId),
        note,
      });
      done(r, 'Your plan');
    } catch (e) {
      toast.error('Could not post your plan', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
        {today.plan && (
          <p className="rounded-control bg-good/10 px-3 py-2 text-table font-medium text-good">
            Your plan for today was posted
            {today.plannedAt
              ? ` at ${new Date(today.plannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
            . Change anything below and post the change, or wrap up when you are done.
          </p>
        )}
        <DataTable
          tableId="daily-plan"
          columns={columns}
          data={rows}
          rowKey={(r) => r.taskId}
          dense
          maxHeight={360}
          emptyText="Nothing carried over, overdue or due today. Add the tasks you will work on."
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchCombobox
            label="Add one of my tasks"
            single
            className="min-w-[16rem] flex-1"
            loading={!mine}
            options={(mine?.tasks ?? [])
              .filter((t) => !keep.has(t.id))
              .map((t) => ({ value: String(t.id), label: `#${t.id} ${t.title} · ${t.project}` }))}
            selected={[]}
            onChange={(v) => v[0] && add(Number(v[0]))}
          />
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={!today.canWrite}
            title={today.canWrite ? undefined : 'Sign in again with Bitrix24 to create tasks'}
            className="h-9 rounded-control bg-primary px-3 font-heading text-button text-white hover:brightness-110 disabled:opacity-50"
          >
            + Add task
          </button>
        </div>
        <AddTaskDialog
          open={adding}
          forWrap={false}
          onClose={() => setAdding(false)}
          onCreated={(t) =>
            addItem({ taskId: t.taskId, title: t.title, project: t.project, why: 'added' })
          }
        />
        {upcoming.length > 0 && (
          <div className="rounded-xl border border-border p-3">
            <p className="pb-2 font-heading text-label font-bold uppercase tracking-wide text-primary">
              Upcoming · due after today ({upcoming.length})
            </p>
            <DataTable
              tableId="daily-upcoming"
              columns={upCols}
              data={upcoming}
              rowKey={(r) => r.taskId}
              dense
              maxHeight={240}
            />
          </div>
        )}
        {noDeadline.length > 0 && (
          <div className="rounded-xl border border-border p-3">
            <p className="pb-2 font-heading text-label font-bold uppercase tracking-wide text-primary">
              No deadline ({noDeadline.length})
              <span className="ml-2 font-body text-[12px] font-normal normal-case tracking-normal text-text-muted">
                Added to the plan, its deadline is set to today when you post.
              </span>
            </p>
            <DataTable
              tableId="daily-no-deadline"
              columns={upCols}
              data={noDeadline}
              rowKey={(r) => r.taskId}
              dense
              maxHeight={240}
            />
          </div>
        )}
        {undatedPlanned > 0 && (
          <p className="text-table text-warn">
            {undatedPlanned === 1
              ? '1 planned task has no deadline: '
              : `${undatedPlanned} planned tasks have no deadline: `}
            posting sets it to today (
            {today.canWrite ? 'in Bitrix24, as you' : 'once you sign in again with Bitrix24'}).
          </p>
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="A note for the team (optional): meetings, leave, blockers…"
          className="w-full rounded-control border border-border bg-surface px-3 py-2 text-body text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <Destination today={today} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
        <span className="mr-auto text-table font-medium text-text">{keep.size} planned</span>
        <button type="button" className={btn} onClick={onLater}>
          Close
        </button>
        {today.plan && (
          <button type="button" className={btn} onClick={() => open('wrap')}>
            Wrap up now
          </button>
        )}
        <button type="button" className={mainBtn} disabled={busy} onClick={() => void post()}>
          {busy ? 'Posting…' : today.plan ? 'Post the change' : 'Post my plan'}
        </button>
      </div>
    </>
  );
}

type WrapRow = WrapItem & { row?: TaskRow; now?: DailyState };
const wrapCol = createColumnHelper<WrapRow>();

function WrapView({ today, onLater }: { today: DailyToday; onLater: () => void }) {
  const { after } = useDailyDialog();
  const postDaily = useDailyPost();
  const finish = useAfterPost();
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState<Map<number, boolean>>(new Map());
  // Tasks added in the evening: finished ahead (upcoming) or any other of their open tasks.
  const [added, setAdded] = useState<WrapItem[]>([]);
  const { data: mine } = useMyOpenTasks('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const planned = [
    ...(today.wrap ? today.wrap.items.filter((i) => !i.extra) : today.wrapItems),
    ...added,
  ];
  useEffect(() => {
    setDone(new Map(planned.map((i) => [i.taskId, i.state === 'done'])));
    setNote(today.wrap?.note ?? '');
  }, [today.day, !!today.wrap]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo(
    () => [
      ...fieldColumns(wrapCol).filter((c) => c.id !== 'state'),
      wrapCol.accessor((r) => r.now ?? r.state, {
        id: 'now',
        header: 'Now',
        cell: (c) => <StateChip state={c.row.original.now ?? c.row.original.state} />,
      }),
      wrapCol.accessor('state', {
        header: 'Report as',
        enableSorting: false,
        cell: (c) => {
          const id = c.row.original.taskId;
          const now = c.row.original.now ?? c.row.original.state;
          return (
            <Select
              size="sm"
              aria-label={`Report ${c.row.original.title} as`}
              value={done.get(id) ? 'done' : 'now'}
              onChange={(e) => setDone((m) => new Map(m).set(id, e.target.value === 'done'))}
            >
              <option value="done">Done</option>
              {now !== 'done' && (
                <option value="now">
                  {now === 'pending' ? 'Pending' : now === 'hold' ? 'On hold' : 'WIP'} (as now)
                </option>
              )}
              {now === 'done' && <option value="now">WIP</option>}
            </Select>
          );
        },
      }),
    ],
    [done],
  );
  const wrapRows: WrapRow[] = planned.map((i) => ({
    ...i,
    row: today.rows?.[i.taskId],
    now: today.states?.[i.taskId],
  }));
  const addDone = (id: number) => {
    if (planned.some((i) => i.taskId === id)) return;
    const up = today.upcoming.find((u) => u.taskId === id);
    const t = mine?.tasks.find((x) => x.id === id);
    const title = up?.title ?? t?.title;
    if (!title) return;
    setAdded((xs) => [
      ...xs,
      { taskId: id, title, project: up?.project ?? t?.project ?? '', state: 'done' },
    ]);
    setDone((m) => new Map(m).set(id, true));
  };

  const post = async () => {
    setBusy(true);
    try {
      const r = await postDaily('wrap', {
        items: planned
          .filter((i) => i.taskId > 0)
          .map((i) => ({ taskId: i.taskId, done: !!done.get(i.taskId) })),
        extra: [],
        note,
      });
      finish(r, 'Your wrap-up');
    } catch (e) {
      toast.error('Could not post your wrap-up', {
        description: e instanceof Error ? e.message : '',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
        <DataTable
          tableId="daily-wrap"
          columns={columns}
          data={wrapRows}
          rowKey={(r) => r.taskId}
          dense
          maxHeight={280}
          emptyText="No plan was posted this morning. Add what you did below."
        />
        <SearchCombobox
          label="Add a task I finished ahead (upcoming or any of my tasks)"
          single
          className="w-full"
          loading={!mine}
          options={[
            ...(today.upcoming ?? []).map((u) => ({
              value: String(u.taskId),
              label: `#${u.taskId} ${u.title} · ${u.project} · upcoming`,
            })),
            ...(mine?.tasks ?? [])
              .filter((t) => !(today.upcoming ?? []).some((u) => u.taskId === t.id))
              .map((t) => ({ value: String(t.id), label: `#${t.id} ${t.title} · ${t.project}` })),
          ].filter((o) => !planned.some((i) => String(i.taskId) === o.value))}
          selected={[]}
          onChange={(v) => v[0] && addDone(Number(v[0]))}
        />
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
          <span className="mr-auto text-table font-medium text-text">
            Did something outside the plan? Add it as a task
            {today.canWrite ? '' : ' once you sign in again with Bitrix24'}.
          </span>
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={!today.canWrite}
            className="h-9 rounded-control bg-primary px-3 font-heading text-button text-white hover:brightness-110 disabled:opacity-50"
          >
            + Add task
          </button>
        </div>
        <AddTaskDialog
          open={adding}
          forWrap
          onClose={() => setAdding(false)}
          onCreated={(t) => {
            setAdded((xs) => [
              ...xs,
              {
                taskId: t.taskId,
                title: t.title,
                project: t.project,
                state: t.state,
                extra: false,
              },
            ]);
            setDone((m) => new Map(m).set(t.taskId, t.state === 'done'));
          }}
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="A note for the team (optional): blockers, plan for tomorrow…"
          className="w-full rounded-control border border-border bg-surface px-3 py-2 text-body text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        {!today.canWrite && (
          <p className="text-table text-warn">
            Sign in again with Bitrix24 to save Done and new tasks in Bitrix24. The post still goes
            to the team.
          </p>
        )}
        <Destination today={today} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" className={btn} onClick={onLater}>
          {after ? 'Sign out without posting' : 'Close'}
        </button>
        <button type="button" className={mainBtn} disabled={busy} onClick={() => void post()}>
          {busy ? 'Posting…' : after ? 'Post and sign out' : 'Post my wrap-up'}
        </button>
      </div>
    </>
  );
}
