// Bulk edit (SRS 7, Task actions). Tick rows (the header box selects or clears the whole page,
// ticks are kept across pages up to 100), pick an item and a value, Check, then Apply. The server
// checks every task first: rows that cannot take the change are highlighted red with the reason,
// rows already so are greyed and skipped, and only the valid ones are sent to Bitrix24.
import { STAGE_TITLES } from '@nural/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { BULK_MAX, type Bulk, type BulkResult, type BulkState } from './bulk';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { useMe } from '../../api/me';
import { API_KEY, useApi } from '../../api/queries';
import type { BoardStage, TaskRow } from '../../api/types';

const RESULT_TEXT: Record<BulkState, string> = {
  ok: 'Ready',
  skip: 'Skipped',
  error: 'Cannot change',
  done: 'Changed',
  failed: 'Bitrix24 refused',
};

/** The tick box of one row; its result (if any) as a short mark next to it. */
export function SelectCell({ row, bulk }: { row: TaskRow; bulk: Bulk }) {
  const r = bulk.results.get(row.id);
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={`Select task ${row.id}`}
        className="h-4 w-4 accent-[var(--primary)]"
        checked={bulk.selected.has(row.id)}
        onChange={(e) => bulk.toggle(row, e.target.checked)}
      />
      {r && (
        <span
          title={r.reason}
          className={clsx(
            'h-2 w-2 rounded-full',
            r.state === 'error' || r.state === 'failed'
              ? 'bg-bad'
              : r.state === 'skip'
                ? 'bg-text-muted'
                : 'bg-good',
          )}
        />
      )}
    </span>
  );
}

/** The header box: ticks or clears every row on this page; partly ticked shows a dash. */
export function SelectAllCell({ rows, bulk }: { rows: TaskRow[]; bulk: Bulk }) {
  const onPage = rows.filter((r) => bulk.selected.has(r.id)).length;
  return (
    <input
      type="checkbox"
      aria-label="Select all tasks on this page"
      title={
        onPage === rows.length && rows.length
          ? 'Unselect all on this page'
          : 'Select all on this page'
      }
      className="h-4 w-4 accent-[var(--primary)]"
      checked={rows.length > 0 && onPage === rows.length}
      ref={(el) => {
        if (el) el.indeterminate = onPage > 0 && onPage < rows.length;
      }}
      onChange={(e) => bulk.setPage(rows, e.target.checked)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

type Item = 'stage' | 'status' | 'tags' | 'project' | 'assignee' | 'priority' | 'deadline';
const ITEMS: { value: Item; label: string; managers?: boolean }[] = [
  { value: 'stage', label: 'Stage' },
  { value: 'status', label: 'Status' },
  { value: 'tags', label: 'Tags' },
  { value: 'project', label: 'Project', managers: true },
  { value: 'assignee', label: 'Assignee', managers: true },
  { value: 'priority', label: 'Priority', managers: true },
  { value: 'deadline', label: 'Deadline', managers: true },
];
const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'inProgress', label: 'In progress' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'completed', label: 'Completed' },
];

const control =
  'h-8 rounded-control border border-border bg-surface px-2 text-body focus:border-primary focus:outline-none';

/** Today, while 18:30 IST is still ahead; otherwise tomorrow (IST dates). */
function firstAllowedDay(): string {
  const ist = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const now = new Date();
  const today = ist(now);
  return new Date(`${today}T18:30:00+05:30`) > now
    ? today
    : ist(new Date(now.getTime() + 86_400_000));
}

/** The bar shown while tasks are ticked: item, value, Check, Apply, Clear, and the problems. */
export function BulkBar({ bulk, boards }: { bulk: Bulk; boards: Record<string, BoardStage[]> }) {
  const { data: me } = useMe();
  // Every field, or stage, status and tags only (the edit right).
  const full = !!(me?.editAll ?? me?.full);
  const canEdit = me?.auth === 'bitrix';
  const queryClient = useQueryClient();
  const [item, setItem] = useState<Item>('stage');
  const [value, setValue] = useState('');
  const [tagsMode, setTagsMode] = useState<'add' | 'replace'>('add');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const { data: options } = useApi<{
    projects: { id: number; name: string }[];
    people: { id: number; name: string }[];
  }>('/api/tasks/edit-options', {}, { enabled: full && canEdit });

  const rows = [...bulk.selected.values()];
  // One board: its own columns. Several boards: the dashboard stages, mapped per board.
  const projectIds = new Set(rows.map((r) => r.project?.id ?? 0));
  const oneBoard =
    projectIds.size === 1 && !projectIds.has(0) ? boards[String([...projectIds][0])] : undefined;

  useEffect(() => {
    setValue('');
    setChecked(false);
  }, [item]);
  useEffect(() => setChecked(false), [value, tagsMode, bulk.selected]);

  const edit = useMemo(() => {
    if (!value) return null;
    if (item === 'stage')
      return oneBoard ? { kind: 'stage', stageId: Number(value) } : { kind: 'stage', stage: value };
    if (item === 'status') return { kind: 'status', status: value };
    if (item === 'deadline')
      return { kind: 'field', field: 'deadline', value: `${value}T18:30:00+05:30` };
    if (item === 'tags') return { kind: 'field', field: 'tags', value, tagsMode };
    return { kind: 'field', field: item, value: item === 'priority' ? value : Number(value) };
  }, [item, value, tagsMode, oneBoard]);

  if (!bulk.selected.size) return null;

  const send = async (path: 'check' | 'apply') => {
    if (!edit) return;
    setBusy(true);
    try {
      const { results } = await apiPost<{ results: BulkResult[] }>(`/api/tasks/bulk/${path}`, {
        ids: rows.map((r) => r.id),
        edit,
      });
      const n = (s: BulkState) => results.filter((r) => r.state === s).length;
      if (path === 'apply') bulk.afterApply(results);
      else bulk.setResults(new Map(results.map((r) => [r.id, r])));
      if (path === 'check') {
        setChecked(true);
        if (n('error'))
          toast.warning(`${n('error')} of ${results.length} cannot take this change`, {
            description: 'They are highlighted in red; Apply skips them.',
          });
      } else {
        toast[n('failed') ? 'warning' : 'success'](
          `${n('done')} changed · ${n('skip')} already so · ${n('error') + n('failed')} not changed`,
          { description: 'The dashboard refreshes in a few seconds.' },
        );
        setTimeout(() => void queryClient.invalidateQueries({ queryKey: [API_KEY] }), 3500);
      }
    } catch (e) {
      toast.error('Bulk edit not done', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  const problems = [...bulk.results.values()].filter(
    (r) => r.state === 'error' || r.state === 'failed',
  );
  const ready = [...bulk.results.values()].filter((r) => r.state === 'ok').length;

  return (
    <div className="space-y-2 rounded-card border border-primary bg-primary-soft-100 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-button text-primary-dark">
          {bulk.selected.size} selected{bulk.selected.size >= BULK_MAX && ` (max ${BULK_MAX})`}
        </span>
        {canEdit ? (
          <>
            <select
              aria-label="Item to change"
              className={control}
              value={item}
              onChange={(e) => setItem(e.target.value as Item)}
            >
              {ITEMS.filter((i) => !i.managers || full).map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
            {item === 'stage' && (
              <select
                aria-label="New stage"
                className={control}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">Choose {oneBoard ? 'column' : 'stage'}…</option>
                {oneBoard
                  ? oneBoard.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))
                  : STAGE_TITLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
              </select>
            )}
            {item === 'status' && (
              <select
                aria-label="New status"
                className={control}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">Choose status…</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            {item === 'tags' && (
              <>
                <select
                  aria-label="Tags mode"
                  className={control}
                  value={tagsMode}
                  onChange={(e) => setTagsMode(e.target.value as 'add' | 'replace')}
                >
                  <option value="add">Add tags</option>
                  <option value="replace">Replace tags with</option>
                </select>
                <input
                  aria-label="Tags, comma-separated"
                  placeholder="bug, Backend App"
                  className={clsx(control, 'w-56')}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </>
            )}
            {item === 'project' && (
              <select
                aria-label="New project"
                className={control}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">Choose project…</option>
                {options?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {item === 'assignee' && (
              <select
                aria-label="New assignee"
                className={control}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">Choose person…</option>
                {options?.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {item === 'priority' && (
              <select
                aria-label="New priority"
                className={control}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">Choose priority…</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            )}
            {item === 'deadline' && (
              <input
                type="date"
                aria-label="New deadline"
                className={control}
                min={firstAllowedDay()}
                value={value}
                onChange={(e) =>
                  setValue(e.target.value >= firstAllowedDay() ? e.target.value : '')
                }
              />
            )}
            <button
              type="button"
              disabled={!edit || busy}
              onClick={() => void send('check')}
              className="h-8 rounded-control border border-primary px-3 font-heading text-button text-primary hover:bg-surface disabled:opacity-50"
            >
              Check
            </button>
            <button
              type="button"
              disabled={!edit || busy || !checked || ready === 0}
              title={
                !checked
                  ? 'Check first'
                  : ready === 0
                    ? 'Nothing to change'
                    : `Change ${ready} tasks in Bitrix24`
              }
              onClick={() => {
                if (window.confirm(`Change ${ready} tasks in Bitrix24?`)) void send('apply');
              }}
              className="h-8 rounded-control bg-primary px-3 font-heading text-button text-white hover:brightness-110 disabled:opacity-50"
            >
              {busy ? 'Working…' : checked ? `Apply to ${ready}` : 'Apply'}
            </button>
          </>
        ) : (
          <span className="text-table text-text-muted">Sign in with Bitrix24 to change tasks.</span>
        )}
        <button
          type="button"
          onClick={bulk.clear}
          className="ml-auto font-heading text-button text-primary hover:underline"
        >
          Clear selection
        </button>
      </div>
      {problems.length > 0 && (
        <ul className="max-h-32 space-y-0.5 overflow-y-auto text-table">
          {problems.map((p) => (
            <li key={p.id} className="text-bad">
              <b>#{p.id}</b> · {RESULT_TEXT[p.state]}: {p.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
