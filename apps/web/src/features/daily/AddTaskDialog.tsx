// Add task (2026-10-17, SRS 23): new Bitrix24 tasks from the Daily update, morning or evening.
// Quick entry in rows (2026-10-23): one task per row (title, tags, project, priority, deadline),
// its description opened by clicking the task; a new row appears as the last one is typed in, so
// several are added in one go. Each is assigned to the person and created with their own Bitrix24
// login (bitrix/methods.ts CREATE_FIELDS); in the wrap-up it can be reported Done at once.
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { API_KEY } from '../../api/queries';
import { IconClose } from '../../components/ui/icons';
import { Select } from '../../components/ui/Select';
import { useMyProjects, type DailyState } from './api';

export interface CreatedTask {
  taskId: number;
  title: string;
  project: string;
  state: DailyState;
}

type Priority = 'low' | 'normal' | 'high';

interface Draft {
  key: number;
  title: string;
  /** Comma separated, as typed. */
  tags: string;
  groupId: number;
  priority: Priority;
  deadline: string;
  description: string;
  done: boolean;
  /** Why Bitrix24 refused it (the row stays to fix and try again). */
  error?: string;
}

const cellInput =
  'h-8 w-full rounded-control border border-border bg-surface px-2 text-table text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

let nextKey = 1;
const blank = (groupId: number, forWrap: boolean): Draft => ({
  key: nextKey++,
  title: '',
  tags: '',
  groupId,
  priority: 'normal',
  deadline: '',
  description: '',
  done: forWrap,
});
const tagsOf = (s: string) => [
  ...new Set(
    s
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];
const filled = (d: Draft) => d.title.trim() !== '';

export function AddTaskDialog({
  open,
  forWrap,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** Evening: offer Done (completed at once) or WIP. */
  forWrap: boolean;
  onClose: () => void;
  onCreated: (t: CreatedTask) => void;
}) {
  const qc = useQueryClient();
  const { data: projects } = useMyProjects(open);
  const firstProject = projects?.projects[0]?.id ?? 0;
  const [rows, setRows] = useState<Draft[]>([]);
  const [openKey, setOpenKey] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const titles = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    if (!open) return;
    setRows([blank(firstProject, forWrap)]);
    setOpenKey(null);
  }, [open, forWrap]); // eslint-disable-line react-hooks/exhaustive-deps
  // Projects arrive after opening: rows still on "No project" get the first one.
  useEffect(() => {
    if (firstProject)
      setRows((xs) =>
        xs.map((r) => (r.groupId || filled(r) ? r : { ...r, groupId: firstProject })),
      );
  }, [firstProject]);

  /** Changes a row; typing in the last one adds a blank row under it (same project). */
  const edit = (key: number, patch: Partial<Draft>) =>
    setRows((xs) => {
      const next = xs.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r));
      const last = next[next.length - 1]!;
      return last.key === key && filled(last) && next.length < 20
        ? [...next, blank(last.groupId, forWrap)]
        : next;
    });
  const remove = (key: number) =>
    setRows((xs) => {
      const left = xs.filter((r) => r.key !== key);
      return left.length ? left : [blank(firstProject, forWrap)];
    });
  const focusTitle = (i: number) => {
    const r = rows[i];
    if (r) setTimeout(() => titles.current.get(r.key)?.focus(), 0);
  };

  const ready = rows.filter(filled);
  const save = async () => {
    const short = ready.find((r) => r.title.trim().length < 3);
    if (short) {
      toast.error('Give each task a title (3 letters or more).');
      return;
    }
    setBusy(true);
    let made = 0;
    const failed = new Map<number, string>();
    // One at a time: each is a Bitrix24 call with the person's own login.
    for (const r of ready) {
      try {
        const t = await apiPost<CreatedTask & { failures: { title: string; message: string }[] }>(
          '/api/daily/task',
          {
            title: r.title.trim(),
            description: r.description,
            groupId: r.groupId,
            tags: tagsOf(r.tags).slice(0, 10),
            priority: r.priority,
            deadline: r.deadline || null,
            done: forWrap && r.done,
          },
        );
        for (const f of t.failures ?? [])
          toast.error(`Created, not completed: ${f.title}`, { description: f.message });
        made++;
        onCreated(t);
      } catch (e) {
        failed.set(r.key, e instanceof Error ? e.message : 'Not created.');
      }
    }
    setBusy(false);
    if (made) {
      toast.success(made === 1 ? 'Task created in Bitrix24' : `${made} tasks created in Bitrix24`);
      void qc.invalidateQueries({ queryKey: [API_KEY] });
    }
    if (!failed.size) return onClose();
    // The ones Bitrix24 refused stay, with the reason, to fix and create again.
    setRows((xs) => [
      ...xs.filter((r) => failed.has(r.key)).map((r) => ({ ...r, error: failed.get(r.key) })),
      blank(firstProject, forWrap),
    ]);
    toast.error(
      failed.size === 1 ? 'One task was not created' : `${failed.size} tasks were not created`,
    );
  };

  const today = new Date().toISOString().slice(0, 10);
  const th =
    'px-1.5 pb-1.5 text-left font-heading text-label font-bold uppercase tracking-wide text-primary';
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[62] bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[62] flex max-h-[90vh] w-[min(1120px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop"
        >
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <div className="flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                Add tasks
              </Dialog.Title>
              <p className="text-table text-text-muted">
                One task per row; a new row appears as you type. Click a task’s number to add its
                description. Enter goes to the next row.
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
            <table className="w-full min-w-[820px] border-separate border-spacing-y-1">
              <thead>
                <tr>
                  <th className={clsx(th, 'w-10')}>#</th>
                  <th className={th}>Title</th>
                  <th className={clsx(th, 'w-[15%]')}>Tags</th>
                  <th className={clsx(th, 'w-[19%]')}>Project</th>
                  <th className={clsx(th, 'w-[9rem]')}>Priority</th>
                  <th className={clsx(th, 'w-[10rem]')}>Deadline</th>
                  {forWrap && <th className={clsx(th, 'w-[7.5rem]')}>Report as</th>}
                  <th className="w-8" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isOpen = openKey === r.key;
                  const spare = i === rows.length - 1 && !filled(r);
                  return (
                    <Fragment key={r.key}>
                      <tr className={clsx(spare && 'opacity-70 focus-within:opacity-100')}>
                        <td className="px-1.5 align-top">
                          <button
                            type="button"
                            onClick={() => setOpenKey(isOpen ? null : r.key)}
                            title={isOpen ? 'Hide the description' : 'Add a description'}
                            aria-expanded={isOpen}
                            aria-label={`Description of task ${i + 1}`}
                            className={clsx(
                              'grid h-8 w-8 place-items-center rounded-control border font-heading text-label font-bold',
                              isOpen || r.description
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-text-muted hover:border-primary hover:text-primary',
                            )}
                          >
                            {i + 1}
                            {r.description && !isOpen ? '·' : ''}
                          </button>
                        </td>
                        <td className="px-1.5 align-top">
                          <input
                            ref={(el) => {
                              if (el) titles.current.set(r.key, el);
                              else titles.current.delete(r.key);
                            }}
                            autoFocus={i === 0}
                            value={r.title}
                            maxLength={200}
                            onChange={(e) => edit(r.key, { title: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                focusTitle(i + 1);
                              }
                            }}
                            placeholder={spare ? 'Add a task…' : 'What is the task?'}
                            aria-label={`Title of task ${i + 1}`}
                            className={clsx(cellInput, r.error && 'border-bad')}
                          />
                          {r.error && <p className="mt-0.5 text-[12px] text-bad">{r.error}</p>}
                        </td>
                        <td className="px-1.5 align-top">
                          <input
                            value={r.tags}
                            onChange={(e) => edit(r.key, { tags: e.target.value })}
                            placeholder="bug, docs"
                            aria-label={`Tags of task ${i + 1} (comma separated)`}
                            className={cellInput}
                          />
                        </td>
                        <td className="px-1.5 align-top">
                          <Select
                            size="sm"
                            aria-label={`Project of task ${i + 1}`}
                            className="w-full"
                            value={r.groupId}
                            onChange={(e) => edit(r.key, { groupId: Number(e.target.value) })}
                          >
                            {(projects?.projects ?? []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                            <option value={0}>No project</option>
                          </Select>
                        </td>
                        <td className="px-1.5 align-top">
                          <Select
                            size="sm"
                            aria-label={`Priority of task ${i + 1}`}
                            className="w-full"
                            value={r.priority}
                            onChange={(e) => edit(r.key, { priority: e.target.value as Priority })}
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                          </Select>
                        </td>
                        <td className="px-1.5 align-top">
                          <input
                            type="date"
                            min={today}
                            value={r.deadline}
                            onChange={(e) => edit(r.key, { deadline: e.target.value })}
                            aria-label={`Deadline of task ${i + 1}`}
                            title="Due at the end of that working day"
                            className={cellInput}
                          />
                        </td>
                        {forWrap && (
                          <td className="px-1.5 align-top">
                            <Select
                              size="sm"
                              aria-label={`Report task ${i + 1} as`}
                              className="w-full"
                              value={r.done ? 'done' : 'wip'}
                              onChange={(e) => edit(r.key, { done: e.target.value === 'done' })}
                            >
                              <option value="done">Done</option>
                              <option value="wip">WIP</option>
                            </Select>
                          </td>
                        )}
                        <td className="align-top">
                          {!spare && (
                            <button
                              type="button"
                              aria-label={`Remove task ${i + 1}`}
                              onClick={() => remove(r.key)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-bad/10 hover:text-bad"
                            >
                              <IconClose size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td />
                          <td colSpan={forWrap ? 6 : 5} className="px-1.5 pb-2">
                            <textarea
                              autoFocus
                              value={r.description}
                              maxLength={5000}
                              rows={4}
                              onChange={(e) => edit(r.key, { description: e.target.value })}
                              placeholder="Description: details, steps, links… (optional)"
                              aria-label={`Description of task ${i + 1}`}
                              className="w-full rounded-control border border-primary/40 bg-surface px-3 py-2 text-body text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                            />
                          </td>
                          <td />
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-table text-text">
              Assigned to you and created in Bitrix24 with your own login. A deadline is due at the
              end of that working day.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <span className="mr-auto text-table font-medium text-text">
              {ready.length} {ready.length === 1 ? 'task' : 'tasks'} to create
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn btn-stroke h-10 px-4"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !ready.length}
              onClick={() => void save()}
              className="btn btn-page h-10 px-4 disabled:opacity-50"
            >
              {busy
                ? 'Creating…'
                : ready.length > 1
                  ? `Create ${ready.length} tasks`
                  : 'Create task'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
