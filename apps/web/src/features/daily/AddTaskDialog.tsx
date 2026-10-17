// Add task (2026-10-17, SRS 23): a new Bitrix24 task from the Daily update, morning or evening,
// laid out like the task view: summary, description, project, tags, priority and deadline. It is
// assigned to the person and created with their own Bitrix24 login (bitrix/methods.ts
// CREATE_FIELDS); in the wrap-up it can be reported Done at once (completed in Bitrix24).
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
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

const input =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-body text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
const label = 'mb-1 block font-heading text-label font-bold uppercase tracking-wide text-primary';

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [deadline, setDeadline] = useState('');
  const [done, setDone] = useState(forWrap);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setTags([]);
    setTagDraft('');
    setPriority('normal');
    setDeadline('');
    setDone(forWrap);
  }, [open, forWrap]);
  useEffect(() => {
    if (!groupId && projects?.projects[0]) setGroupId(projects.projects[0].id);
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTag = () => {
    const t = tagDraft.trim().replace(/,$/, '');
    if (t && !tags.includes(t) && tags.length < 10) setTags((xs) => [...xs, t]);
    setTagDraft('');
  };

  const save = async () => {
    if (title.trim().length < 3) {
      toast.error('Give the task a summary (3 letters or more).');
      return;
    }
    setBusy(true);
    try {
      const r = await apiPost<CreatedTask & { failures: { title: string; message: string }[] }>(
        '/api/daily/task',
        {
          title: title.trim(),
          description,
          groupId,
          tags: tagDraft.trim() ? [...tags, tagDraft.trim()] : tags,
          priority,
          deadline: deadline || null,
          done: forWrap && done,
        },
      );
      for (const f of r.failures ?? [])
        toast.error(`Created, not completed: ${f.title}`, { description: f.message });
      toast.success(`Task #${r.taskId} created in Bitrix24`);
      onCreated(r);
      onClose();
      void qc.invalidateQueries({ queryKey: [API_KEY] });
    } catch (e) {
      toast.error('Could not create the task', {
        description: e instanceof Error ? e.message : '',
      });
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[62] bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[62] flex max-h-[90vh] w-[min(640px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop"
        >
          <div className="h-1.5 shrink-0 bg-gradient-to-r from-primary to-accent" />
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <Dialog.Title className="flex-1 font-heading text-h2 text-primary-dark">
              Add a task
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <div>
              <label className={label} htmlFor="add-title">
                Summary
              </label>
              <input
                id="add-title"
                autoFocus
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is the task?"
                className={input}
              />
            </div>
            <div>
              <label className={label} htmlFor="add-desc">
                Description
              </label>
              <textarea
                id="add-desc"
                value={description}
                maxLength={5000}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details, steps, links… (optional)"
                className={input}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className={label}>Project</span>
                <Select
                  aria-label="Project"
                  className="w-full"
                  value={groupId}
                  onChange={(e) => setGroupId(Number(e.target.value))}
                >
                  {(projects?.projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value={0}>No project</option>
                </Select>
              </div>
              <div>
                <span className={label}>Priority</span>
                <Select
                  aria-label="Priority"
                  className="w-full"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </Select>
              </div>
              <div>
                <label className={label} htmlFor="add-deadline">
                  Deadline
                </label>
                <input
                  id="add-deadline"
                  type="date"
                  min={today}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={input}
                />
                <p className="mt-0.5 text-[12px] text-text">Due at the end of that working day.</p>
              </div>
              {forWrap && (
                <div>
                  <span className={label}>Report as</span>
                  <Select
                    aria-label="Report as"
                    className="w-full"
                    value={done ? 'done' : 'wip'}
                    onChange={(e) => setDone(e.target.value === 'done')}
                  >
                    <option value="done">Done (completed in Bitrix24)</option>
                    <option value="wip">WIP</option>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <label className={label} htmlFor="add-tags">
                Tags
              </label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-border px-2 py-1.5 focus-within:border-primary">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary"
                  >
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove tag ${t}`}
                      onClick={() => setTags((xs) => xs.filter((x) => x !== t))}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="add-tags"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder={tags.length ? '' : 'bug, feedback, docs… (Enter to add)'}
                  className="h-7 min-w-[8rem] flex-1 bg-transparent text-table text-text outline-none"
                />
              </div>
            </div>
            <p className="text-table text-text">
              Assigned to you and created in Bitrix24 with your own login.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-control border border-border px-4 font-heading text-button text-text hover:border-primary hover:text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className={clsx(
                'h-10 rounded-control bg-gradient-to-r from-primary to-accent px-4 font-heading text-button text-white shadow-sm hover:brightness-110 disabled:opacity-50',
              )}
            >
              {busy ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
