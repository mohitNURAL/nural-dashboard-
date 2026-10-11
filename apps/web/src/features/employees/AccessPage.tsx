// Access permissions (SRS 7 and 17): every person's rights with where each comes from, changed per
// person or per department. A right is either inherited (from the role, or a department for a
// person) or set: Allow / Deny (All / Own for data, All fields / Limited for edit). Admins in
// config/roles.json are locked. Every change is saved at once and logged under Recent changes.
// Admins only; the server checks every change.
import * as Popover from '@radix-ui/react-popover';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { API_KEY } from '../../api/queries';
import { IconLock, IconSearch, IconShield } from '../../components/ui/icons';
import { Tip } from '../../components/ui/Tip';
import {
  useAccess,
  useAudit,
  type AccessDept,
  type AccessPerson,
  type Grant,
  type RightKey,
  type Source,
} from './api';
import { Avatar, PageHead } from './common';
import { isOn, RIGHTS, ROLE_NAME, timeAgo, valueOf } from './labels';

const SOURCE: Record<Source, { label: string; dot: string }> = {
  role: { label: 'from the role', dot: 'bg-text-muted' },
  department: { label: 'set for the department', dot: 'bg-primary' },
  person: { label: 'set for this person', dot: 'bg-accent' },
  locked: { label: 'locked admin (roles.json)', dot: 'bg-bad' },
};

export function AccessPage() {
  const { data, isLoading } = useAccess();
  const [view, setView] = useState<'people' | 'departments'>('people');
  const [q, setQ] = useState('');
  const qc = useQueryClient();

  const save = async (type: 'user' | 'dept', id: number, name: string, grant: Grant | null) => {
    try {
      await apiPost(
        `/api/access/${type}/${id}`,
        { rights: grant && Object.keys(grant).length ? grant : null },
        'PUT',
      );
      toast.success(`Access updated for ${name}`, {
        description: 'In effect from their next click.',
      });
      void qc.invalidateQueries({ queryKey: [API_KEY] });
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    }
  };

  const people = useMemo(
    () =>
      (data?.people ?? []).filter(
        (p) =>
          !q ||
          `${p.name} ${p.position ?? ''} ${p.departments.join(' ')} ${ROLE_NAME[p.role]}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      ),
    [data, q],
  );

  return (
    <div className="space-y-5">
      <PageHead
        title="Access permissions"
        sub="Who sees what and who may change what, per person or department"
        icon={<IconShield size={24} />}
      >
        <div
          className="flex rounded-xl border border-border bg-surface p-1"
          role="radiogroup"
          aria-label="View"
        >
          {(['people', 'departments'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={clsx(
                'rounded-lg px-4 py-1.5 font-heading text-button transition',
                view === v
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-primary',
              )}
            >
              {v === 'people' ? 'By person' : 'By department'}
            </button>
          ))}
        </div>
      </PageHead>

      <Legend />

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 rounded-2xl border border-border bg-surface p-4">
          {view === 'people' && (
            <label className="relative mb-3 block w-72">
              <IconSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people"
                className="h-9 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-body text-text focus:border-primary focus:outline-none"
              />
            </label>
          )}
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[920px] border-separate border-spacing-0 text-table"
              data-tour="access-table"
            >
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-heading text-label uppercase tracking-wider text-text-muted">
                    {view === 'people' ? 'Person' : 'Department'}
                  </th>
                  {RIGHTS.map((r) => (
                    <th
                      key={r.key}
                      className="px-1 py-2 text-center font-heading text-label uppercase tracking-wider text-text-muted"
                    >
                      <Tip label={r.label} hint={r.hint}>
                        <span className="cursor-help border-b border-dotted border-text-muted/60">
                          {r.label}
                        </span>
                      </Tip>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={RIGHTS.length + 1} className="p-6 text-center text-text-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {view === 'people'
                  ? people.map((p) => <PersonRow key={p.id} p={p} save={save} />)
                  : (data?.departments ?? []).map((d) => <DeptRow key={d.id} d={d} save={save} />)}
              </tbody>
            </table>
          </div>
        </div>
        <RecentChanges />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3 text-table text-text-muted">
      <span className="font-heading text-label uppercase tracking-wider">
        Where a right comes from
      </span>
      {(Object.keys(SOURCE) as Source[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={clsx('h-2 w-2 rounded-full', SOURCE[s].dot)} />
          {SOURCE[s].label}
        </span>
      ))}
      <span className="ml-auto">Click a right to change it. Changes apply at once.</span>
    </div>
  );
}

type Save = (type: 'user' | 'dept', id: number, name: string, grant: Grant | null) => Promise<void>;

function PersonRow({ p, save }: { p: AccessPerson; save: Save }) {
  return (
    <tr className="group">
      <td className="sticky left-0 z-10 border-t border-border bg-surface px-2 py-2 group-hover:bg-primary-soft-100">
        <span className="flex items-center gap-2.5">
          <Avatar id={p.id} name={p.name} size={32} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-heading text-button text-primary-dark">
              <span className="truncate">{p.name}</span>
              {p.locked && (
                <Tip label="Locked admin" hint="Set in config/roles.json: always has every right">
                  <span className="text-bad">
                    <IconLock size={14} />
                  </span>
                </Tip>
              )}
            </span>
            <span className="block max-w-[220px] truncate text-table text-text-muted">
              {ROLE_NAME[p.role]} · {p.departments.join(', ') || 'No department'}
            </span>
          </span>
        </span>
      </td>
      {RIGHTS.map((r) => (
        <td
          key={r.key}
          className="border-t border-border px-1 py-2 text-center group-hover:bg-primary-soft-100"
        >
          <RightCell
            right={r.key}
            value={p.rights[r.key]}
            source={p.source[r.key]}
            set={p.grant?.[r.key]}
            inheritLabel={`Inherit (${r.values[isOn(r.key, p.inherited[r.key]) ? 0 : 1]})`}
            disabled={p.locked}
            onChange={(v) => {
              const grant = { ...(p.grant ?? {}) } as Record<string, unknown>;
              if (v === undefined) delete grant[r.key];
              else grant[r.key] = v;
              void save('user', p.id, p.name, grant as Grant);
            }}
          />
        </td>
      ))}
    </tr>
  );
}

function DeptRow({ d, save }: { d: AccessDept; save: Save }) {
  return (
    <tr className="group">
      <td className="sticky left-0 z-10 border-t border-border bg-surface px-2 py-2 group-hover:bg-primary-soft-100">
        <span className="flex items-center gap-2" style={{ paddingLeft: d.depth * 18 }}>
          {d.depth > 0 && <span className="h-px w-3 bg-border" />}
          <span className="min-w-0">
            <span className="block truncate font-heading text-button text-primary-dark">
              {d.name}
            </span>
            <span className="block truncate text-table text-text-muted">
              {d.members} people{d.head ? ` · head ${d.head}` : ''}
            </span>
          </span>
        </span>
      </td>
      {RIGHTS.map((r) => (
        <td
          key={r.key}
          className="border-t border-border px-1 py-2 text-center group-hover:bg-primary-soft-100"
        >
          <RightCell
            right={r.key}
            value={d.grant?.[r.key]}
            source={d.grant?.[r.key] !== undefined ? 'department' : 'role'}
            set={d.grant?.[r.key]}
            inheritLabel="Inherit (each person's role)"
            onChange={(v) => {
              const grant = { ...(d.grant ?? {}) } as Record<string, unknown>;
              if (v === undefined) delete grant[r.key];
              else grant[r.key] = v;
              void save('dept', d.id, d.name, grant as Grant);
            }}
          />
        </td>
      ))}
    </tr>
  );
}

/** One right: its value as a chip with a dot for its source; click to inherit, allow or deny. */
function RightCell({
  right,
  value,
  source,
  set,
  inheritLabel,
  disabled,
  onChange,
}: {
  right: RightKey;
  /** The effective value (people) or the department's setting (undefined = inherit). */
  value: unknown;
  source: Source;
  /** The override set here, if any. */
  set: unknown;
  inheritLabel: string;
  disabled?: boolean;
  onChange: (v: unknown) => void;
}) {
  const meta = RIGHTS.find((r) => r.key === right)!;
  const inherit = value === undefined;
  const on = isOn(right, value);
  const chip = (
    <span
      className={clsx(
        'relative inline-flex min-w-[64px] items-center justify-center gap-1 rounded-lg px-2 py-1 font-heading text-label font-bold transition',
        inherit
          ? 'border border-dashed border-border text-text-muted'
          : on
            ? 'bg-good/15 text-good'
            : 'bg-border/50 text-text-muted',
        !disabled && 'hover:ring-2 hover:ring-primary/30',
      )}
    >
      {inherit ? 'Inherit' : meta.values[on ? 0 : 1]}
      {!inherit && (
        <span
          className={clsx('h-1.5 w-1.5 rounded-full', SOURCE[source].dot)}
          aria-label={SOURCE[source].label}
        />
      )}
    </span>
  );
  if (disabled) return chip;
  const options: { label: string; v: unknown }[] = [
    { label: inheritLabel, v: undefined },
    { label: meta.values[0], v: valueOf(right, true) },
    { label: meta.values[1], v: valueOf(right, false) },
  ];
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`${meta.label}: change`}>
          {chip}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-56 rounded-xl border border-border bg-surface p-1.5 text-text shadow-pop"
        >
          <p className="px-2 pb-1 pt-0.5 font-heading text-label uppercase tracking-wider text-text-muted">
            {meta.label}: {meta.hint}
          </p>
          {options.map((o) => {
            const current = o.v === undefined ? set === undefined : set === o.v;
            return (
              <Popover.Close asChild key={o.label}>
                <button
                  type="button"
                  onClick={() => !current && onChange(o.v)}
                  className={clsx(
                    'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-body hover:bg-primary-soft-100',
                    current && 'font-bold text-primary',
                  )}
                >
                  {o.label}
                  {current && <span aria-hidden>✓</span>}
                </button>
              </Popover.Close>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const describe = (g: Grant | null) =>
  !g || !Object.keys(g).length
    ? 'inherit everything'
    : RIGHTS.filter((r) => g[r.key] !== undefined)
        .map((r) => `${r.label} ${r.values[isOn(r.key, g[r.key]) ? 0 : 1]}`)
        .join(', ');

function RecentChanges() {
  const { data } = useAudit();
  return (
    <aside
      className="h-fit rounded-2xl border border-border bg-surface p-4"
      data-tour="access-audit"
    >
      <h2 className="mb-3 font-heading text-h3 text-primary-dark">Recent changes</h2>
      {!data?.rows.length ? (
        <p className="text-table text-text-muted">No changes yet. Every change is listed here.</p>
      ) : (
        <ol className="space-y-3">
          {data.rows.slice(0, 30).map((r) => (
            <li key={r.id} className="relative border-l-2 border-accent/40 pl-3">
              <span className="block text-table text-text-muted">
                {timeAgo(r.at)} · {r.by}
              </span>
              <span className="block font-heading text-button text-primary-dark">
                {r.subjectType === 'dept' ? 'Department ' : ''}
                {r.subject}
              </span>
              <span className="block text-table text-text">
                {describe(r.after)}
                {r.before && Object.keys(r.before).length > 0 && (
                  <span className="text-text-muted"> (was {describe(r.before)})</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
