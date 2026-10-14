// The Daily update dialog (2026-10-14, SRS 23). Plan: the person's overdue and due-today tasks,
// to keep, remove or add to, with a note, posted to the Slack daily work update group. Wrap-up:
// the plan with each task Done or WIP (from Bitrix24; Done completes it there), plus work done
// outside the plan, created in Bitrix24 as their own task. Opens from the dock icon, by itself
// (DailyPrompt) or before signing out. Tables and dropdowns are the shared ones.
import * as Dialog from '@radix-ui/react-dialog';
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePrefs, useSavePrefs } from '../../api/prefs';
import { DataTable } from '../../components/DataTable';
import { SearchCombobox } from '../../components/SearchCombobox';
import { IconClose, IconDaily } from '../../components/ui/icons';
import { Select } from '../../components/ui/Select';
import {
  useDailyPost,
  useDailyToday,
  useMyOpenTasks,
  useMyProjects,
  type DailyItem,
  type DailyToday,
  type WrapItem,
} from './api';
import { useDailyDialog } from './store';
import { snooze } from './when';

const WHY: Record<DailyItem['why'], { label: string; cls: string }> = {
  overdue: { label: 'Overdue', cls: 'bg-bad/15 text-bad' },
  today: { label: 'Due today', cls: 'bg-warn/15 text-warn' },
  added: { label: 'Added', cls: 'bg-primary/10 text-primary' },
};

const btn =
  'h-10 rounded-control border border-border px-4 font-heading text-button text-text-muted hover:border-primary hover:text-primary disabled:opacity-50';
const mainBtn =
  'h-10 rounded-control bg-gradient-to-r from-primary to-accent px-4 font-heading text-button text-white shadow-sm hover:brightness-110 disabled:opacity-50';

export function DailyDialog() {
  const { mode, after, close } = useDailyDialog();
  const { data: today } = useDailyToday(!!mode);
  const { data: prefs } = usePrefs();
  const savePrefs = useSavePrefs();
  const later = () => {
    if (prefs) savePrefs((p) => ({ tour: snooze(p.tour, Date.now()) }));
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
          className="fixed left-1/2 top-1/2 z-[58] flex max-h-[90vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop"
          style={{ animation: 'tour-in 200ms cubic-bezier(0.2,0,0,1)' }}
        >
          <div className="h-1.5 shrink-0 bg-gradient-to-r from-primary via-accent to-primary" />
          <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white">
              <IconDaily size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                {mode === 'wrap' ? 'Wrap up your day' : 'Plan your day'}
                {today && <span className="text-text-muted"> · {today.dayLabel}</span>}
              </Dialog.Title>
              <p className="mt-0.5 text-table text-text-muted">
                {mode === 'wrap'
                  ? 'Mark what is done, add anything else you did, then post it to the team.'
                  : 'Your overdue and due-today tasks. Keep, remove or add, then post it to the team.'}
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
          ) : mode === 'wrap' ? (
            <WrapView today={today} onLater={later} />
          ) : (
            <PlanView today={today} onLater={later} />
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

const planCol = createColumnHelper<DailyItem & { keep: boolean }>();

function PlanView({ today, onLater }: { today: DailyToday; onLater: () => void }) {
  const postDaily = useDailyPost();
  const done = useAfterPost();
  const [items, setItems] = useState<DailyItem[]>([]);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
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

  const add = (id: number) => {
    const t = mine?.tasks.find((x) => x.id === id);
    if (!t) return;
    if (!items.some((i) => i.taskId === id))
      setItems((xs) => [...xs, { taskId: t.id, title: t.title, project: t.project, why: 'added' }]);
    setKeep((k) => new Set(k).add(id));
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
      planCol.accessor('title', {
        header: 'Task',
        cell: (c) => <span className="font-semibold text-text">{c.getValue()}</span>,
      }),
      planCol.accessor('project', { header: 'Project' }),
      planCol.accessor('why', {
        header: 'Why',
        cell: (c) => {
          const w = WHY[c.getValue()];
          const d = c.row.original.daysOverdue;
          return (
            <span className={clsx('rounded-full px-2 py-0.5 text-[12px] font-semibold', w.cls)}>
              {w.label}
              {c.getValue() === 'overdue' && d ? ` ${d}d` : ''}
            </span>
          );
        },
      }),
    ],
    [],
  );

  const rows = items.map((i) => ({ ...i, keep: keep.has(i.taskId) }));
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
        <DataTable
          tableId="daily-plan"
          columns={columns}
          data={rows}
          rowKey={(r) => r.taskId}
          dense
          maxHeight={320}
          emptyText="Nothing overdue or due today. Add the tasks you will work on."
        />
        <SearchCombobox
          label="Add one of my tasks"
          single
          className="w-full"
          loading={!mine}
          options={(mine?.tasks ?? [])
            .filter((t) => !keep.has(t.id))
            .map((t) => ({ value: String(t.id), label: `${t.title} · ${t.project}` }))}
          selected={[]}
          onChange={(v) => v[0] && add(Number(v[0]))}
        />
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
        <span className="mr-auto text-table text-text-muted">{keep.size} planned</span>
        <button type="button" className={btn} onClick={onLater}>
          Later
        </button>
        <button type="button" className={mainBtn} disabled={busy} onClick={() => void post()}>
          {busy ? 'Posting…' : today.plan ? 'Post the change' : 'Post my plan'}
        </button>
      </div>
    </>
  );
}

interface Extra {
  key: number;
  title: string;
  groupId: number;
  done: boolean;
}
const wrapCol = createColumnHelper<WrapItem>();

function WrapView({ today, onLater }: { today: DailyToday; onLater: () => void }) {
  const { after } = useDailyDialog();
  const postDaily = useDailyPost();
  const finish = useAfterPost();
  const { data: projects } = useMyProjects();
  const [done, setDone] = useState<Map<number, boolean>>(new Map());
  const [extra, setExtra] = useState<Extra[]>([]);
  const [draft, setDraft] = useState({ title: '', groupId: 0, done: true });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const planned = today.wrap ? today.wrap.items.filter((i) => !i.extra) : today.wrapItems;
  useEffect(() => {
    setDone(new Map(planned.map((i) => [i.taskId, i.state === 'done'])));
    setNote(today.wrap?.note ?? '');
  }, [today.day, !!today.wrap]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!draft.groupId && projects?.projects[0])
      setDraft((d) => ({ ...d, groupId: projects.projects[0]!.id }));
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo(
    () => [
      wrapCol.accessor('title', {
        header: 'Task',
        cell: (c) => <span className="font-semibold text-text">{c.getValue()}</span>,
      }),
      wrapCol.accessor('project', { header: 'Project' }),
      wrapCol.accessor('state', {
        header: 'Status',
        enableSorting: false,
        cell: (c) => {
          const id = c.row.original.taskId;
          return (
            <Select
              size="sm"
              aria-label={`Status of ${c.row.original.title}`}
              value={done.get(id) ? 'done' : 'wip'}
              onChange={(e) => setDone((m) => new Map(m).set(id, e.target.value === 'done'))}
            >
              <option value="done">Done</option>
              <option value="wip">WIP</option>
            </Select>
          );
        },
      }),
    ],
    [done],
  );

  const addExtra = () => {
    if (draft.title.trim().length < 3) {
      toast.error('Give the work a short title (3 letters or more).');
      return;
    }
    setExtra((xs) => [...xs, { ...draft, title: draft.title.trim(), key: Date.now() }]);
    setDraft((d) => ({ ...d, title: '' }));
  };

  const post = async () => {
    setBusy(true);
    try {
      const r = await postDaily('wrap', {
        items: planned
          .filter((i) => i.taskId > 0)
          .map((i) => ({ taskId: i.taskId, done: !!done.get(i.taskId) })),
        extra: extra.map(({ title, groupId, done: d }) => ({ title, groupId, done: d })),
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

  const projectName = (id: number) =>
    projects?.projects.find((p) => p.id === id)?.name ?? 'No project';
  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
        <DataTable
          tableId="daily-wrap"
          columns={columns}
          data={planned}
          rowKey={(r) => r.taskId}
          dense
          maxHeight={280}
          emptyText="No plan was posted this morning. Add what you did below."
        />
        <div className="rounded-xl border border-border p-3">
          <p className="pb-2 font-heading text-label uppercase text-text-muted">
            Work outside the plan
          </p>
          {extra.length > 0 && (
            <ul className="mb-2 space-y-1 text-table">
              {extra.map((x) => (
                <li key={x.key} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold text-text">{x.title}</span>
                  <span className="text-text-muted">{projectName(x.groupId)}</span>
                  <span className={x.done ? 'text-good' : 'text-warn'}>
                    {x.done ? 'Done' : 'WIP'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${x.title}`}
                    onClick={() => setExtra((xs) => xs.filter((y) => y.key !== x.key))}
                    className="grid h-6 w-6 place-items-center rounded text-text-muted hover:bg-primary-soft-100"
                  >
                    <IconClose size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addExtra()}
              maxLength={200}
              placeholder="What did you do?"
              className="h-8 min-w-[12rem] flex-1 rounded-control border border-border bg-surface px-3 text-table text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <Select
              size="sm"
              aria-label="Project"
              value={draft.groupId}
              onChange={(e) => setDraft((d) => ({ ...d, groupId: Number(e.target.value) }))}
            >
              {(projects?.projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={0}>No project</option>
            </Select>
            <Select
              size="sm"
              aria-label="Done or WIP"
              value={draft.done ? 'done' : 'wip'}
              onChange={(e) => setDraft((d) => ({ ...d, done: e.target.value === 'done' }))}
            >
              <option value="done">Done</option>
              <option value="wip">WIP</option>
            </Select>
            <button
              type="button"
              className="h-8 rounded-control border border-primary px-3 font-heading text-button text-primary hover:bg-primary/10"
              onClick={addExtra}
            >
              Add
            </button>
          </div>
          <p className="pt-2 text-[12px] text-text-muted">
            Each one becomes a Bitrix24 task assigned to you in that project
            {today.canWrite ? '.' : ' once you sign in again with Bitrix24.'}
          </p>
        </div>
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
          {after ? 'Sign out without posting' : 'Later'}
        </button>
        <button type="button" className={mainBtn} disabled={busy} onClick={() => void post()}>
          {busy ? 'Posting…' : after ? 'Post and sign out' : 'Post my wrap-up'}
        </button>
      </div>
    </>
  );
}
