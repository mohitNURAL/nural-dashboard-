// Access permissions (SRS 7 and 17; redesigned 2026-10-12). Pick a person or a department on the
// left; on the right every menu module opens into its pages and the permissions under them
// (packages/shared modules.ts, so a new page shows here by itself). Each switch shows its value
// and where it comes from (role, department, person, locked admin); a change is a draft until
// Save. A whole module, or every module, can be switched at once. Admins only; the server checks
// every change and logs it under Recent changes.
import { MODULES, type ModuleDef, type PageDef, type PermissionDef } from '@nural/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { API_KEY } from '../../api/queries';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import {
  IconChevron,
  IconFlow,
  IconGrid,
  IconHelp,
  IconInsights,
  IconLock,
  IconPeople,
  IconPlug,
  IconReset,
  IconShield,
} from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { Tip } from '../../components/ui/Tip';
import {
  useAccess,
  useAudit,
  type AccessDept,
  type AccessPerson,
  type Grant,
  type RightKey,
  type Rights,
  type Source,
} from './api';
import { Avatar } from './common';
import { isOn, RIGHTS, ROLE_NAME, timeAgo, valueOf } from './labels';
import { SearchInput } from '../../components/ui/SearchInput';

const MODULE_ICON: Record<string, ReactNode> = {
  Dashboard: <IconGrid size={18} />,
  Insights: <IconInsights size={18} />,
  Projects: <IconFlow size={18} />,
  Employees: <IconPeople size={18} />,
  Integration: <IconPlug size={18} />,
  Help: <IconHelp size={18} />,
};

const SOURCE: Record<Source | 'draft', { label: string; dot: string }> = {
  role: { label: 'from the role', dot: 'bg-text-muted' },
  department: { label: 'from a department', dot: 'bg-primary' },
  person: { label: 'set for this person', dot: 'bg-accent' },
  locked: { label: 'locked admin (roles.json)', dot: 'bg-bad' },
  draft: { label: 'changed, not saved yet', dot: 'bg-warn' },
};

type Subject = { type: 'user'; p: AccessPerson } | { type: 'dept'; d: AccessDept };

/** An old grant in today's terms: `employees` covers both Employee pages. */
const normalize = (g: Grant | null): Grant => {
  if (!g) return {};
  const { employees, ...rest } = g;
  return employees === undefined ? rest : { org: employees, people: employees, ...rest };
};

const pageKeys = (m: ModuleDef) => m.pages.map((pg) => pg.right as RightKey);

export function AccessPage() {
  const { data, isLoading } = useAccess();
  const [view, setView] = useState<'people' | 'departments'>('people');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ type: 'user' | 'dept'; id: number } | null>(null);

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
  const departments = useMemo(
    () =>
      (data?.departments ?? []).filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  const subject: Subject | null = useMemo(() => {
    if (!data || !picked) return null;
    if (picked.type === 'user') {
      const p = data.people.find((x) => x.id === picked.id);
      return p ? { type: 'user', p } : null;
    }
    const d = data.departments.find((x) => x.id === picked.id);
    return d ? { type: 'dept', d } : null;
  }, [data, picked]);
  // Start with the first person, so the screen is never empty.
  useEffect(() => {
    if (!picked && data?.people[0]) setPicked({ type: 'user', id: data.people[0].id });
  }, [data, picked]);

  return (
    <div className="space-y-4">
      <PageHead
        title="Access permissions"
        sub="Who may open which module and page, and what they may do there, per person or department"
        icon={<IconShield size={24} />}
      />

      <div data-tour="access-tiles">
        <SortableGroup
          group="access.tiles"
          noun="tile"
          className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
          items={[
            {
              id: 'people',
              node: (
                <StatTile
                  label="Set per person"
                  info="People with at least one right set for them personally."
                  value={data && data.people.filter((p) => p.grant).length}
                  sub={data && `of ${data.people.length} people`}
                  onClick={() => setView('people')}
                />
              ),
            },
            {
              id: 'departments',
              node: (
                <StatTile
                  label="Set per department"
                  info="Departments with at least one right set; it reaches their people and sub-departments."
                  value={data && data.departments.filter((d) => d.grant).length}
                  sub={data && `of ${data.departments.length} departments`}
                  onClick={() => setView('departments')}
                />
              ),
            },
            {
              id: 'admins',
              node: (
                <StatTile
                  label="Admins"
                  info="People who can manage access. Locked admins come from config/roles.json."
                  value={data && data.people.filter((p) => p.rights.admin).length}
                  sub={data && `${data.people.filter((p) => p.locked).length} locked`}
                />
              ),
            },
            {
              id: 'allData',
              node: (
                <StatTile
                  label="See all data"
                  info="People whose data scope is every project and person; the rest see only their own tasks."
                  value={data && data.people.filter((p) => p.rights.scope === 'all').length}
                  sub={
                    data &&
                    `${data.people.filter((p) => p.rights.scope === 'own').length} see own tasks`
                  }
                />
              ),
            },
          ]}
        />
      </div>

      <SortableGroup
        group="access.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        items={[
          {
            id: 'rights',
            className: 'xl:col-span-12',
            node: (
              <div className="grid min-w-0 grid-cols-1 gap-4 rounded-card border border-border bg-surface p-3 lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="flex min-h-0 flex-col gap-2 lg:max-h-[78vh]">
                  <div
                    className="flex rounded-full bg-primary-soft p-1"
                    role="radiogroup"
                    aria-label="Set access for"
                  >
                    {(['people', 'departments'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={view === v}
                        onClick={() => setView(v)}
                        className={clsx(
                          'flex-1 rounded-full px-3 py-1.5 font-heading text-button uppercase transition',
                          view === v
                            ? 'bg-surface text-primary'
                            : 'text-primary-muted hover:text-primary',
                        )}
                      >
                        {v === 'people' ? 'People' : 'Departments'}
                      </button>
                    ))}
                  </div>
                  <SearchInput
                    value={q}
                    onChange={setQ}
                    size="sm"
                    placeholder={view === 'people' ? 'Search people' : 'Search departments'}
                  />
                  <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
                    {isLoading && <li className="skeleton h-40" />}
                    {view === 'people'
                      ? people.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setPicked({ type: 'user', id: p.id })}
                              className={clsx(
                                'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition',
                                picked?.type === 'user' && picked.id === p.id
                                  ? 'bg-primary-soft'
                                  : 'hover:bg-primary-soft-100',
                              )}
                            >
                              <Avatar id={p.id} name={p.name} size={28} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-heading text-button text-primary-dark">
                                  {p.name}
                                </span>
                                <span className="block truncate text-[12px] text-text-muted">
                                  {ROLE_NAME[p.role]}
                                  {p.departments[0] ? ` · ${p.departments[0]}` : ''}
                                </span>
                              </span>
                              {p.locked ? (
                                <IconLock size={14} className="text-bad" />
                              ) : (
                                p.grant && (
                                  <span
                                    className="h-2 w-2 rounded-full bg-accent"
                                    title="Set for this person"
                                  />
                                )
                              )}
                            </button>
                          </li>
                        ))
                      : departments.map((d) => (
                          <li key={d.id}>
                            <button
                              type="button"
                              onClick={() => setPicked({ type: 'dept', id: d.id })}
                              style={{ paddingLeft: 8 + Math.min(d.depth, 6) * 12 }}
                              className={clsx(
                                'flex w-full items-center gap-2 rounded-xl py-1.5 pr-2 text-left transition',
                                picked?.type === 'dept' && picked.id === d.id
                                  ? 'bg-primary-soft'
                                  : 'hover:bg-primary-soft-100',
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-heading text-button text-primary-dark">
                                  {d.name}
                                </span>
                                <span className="block truncate text-[12px] text-text-muted">
                                  {d.members} people{d.head ? ` · head ${d.head}` : ''}
                                </span>
                              </span>
                              {d.grant && (
                                <span
                                  className="h-2 w-2 rounded-full bg-primary"
                                  title="Set for this department"
                                />
                              )}
                            </button>
                          </li>
                        ))}
                  </ul>
                </aside>
                <section className="min-w-0" data-tour="access-tree">
                  {subject ? (
                    <Editor
                      key={`${subject.type}-${subject.type === 'user' ? subject.p.id : subject.d.id}`}
                      subject={subject}
                    />
                  ) : (
                    <p className="p-6 text-text-muted">Pick a person or a department.</p>
                  )}
                </section>
              </div>
            ),
          },
          { id: 'changes', className: 'xl:col-span-12', node: <RecentChanges /> },
        ]}
      />
    </div>
  );
}

/** The rights of one person or department, module by module, with a draft until Save. */
function Editor({ subject }: { subject: Subject }) {
  const qc = useQueryClient();
  const person = subject.type === 'user' ? subject.p : null;
  const locked = !!person?.locked;
  const saved = normalize(subject.type === 'user' ? subject.p.grant : subject.d.grant);
  const [draft, setDraft] = useState<Grant>(saved);
  const [open, setOpen] = useState<string[]>(['Dashboard']);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const changes = RIGHTS.filter((r) => draft[r.key] !== saved[r.key]).length;

  /** The value shown: set here (draft), else inherited (role and departments). */
  const valueOfKey = (k: RightKey): { value: unknown; source: Source | 'draft' | 'inherit' } => {
    if (draft[k] !== undefined)
      return {
        value: draft[k],
        source: draft[k] !== saved[k] ? 'draft' : subject.type === 'user' ? 'person' : 'department',
      };
    if (person) {
      const src = person.source[k];
      return {
        value: person.inherited[k],
        source: src === 'person' ? 'role' : src === 'locked' ? 'locked' : src,
      };
    }
    return { value: undefined, source: 'inherit' };
  };
  const set = (k: RightKey, v: unknown | undefined) =>
    setDraft((g) => {
      const next = { ...g } as Record<string, unknown>;
      if (v === undefined) delete next[k];
      else next[k] = v;
      return next as Grant;
    });
  const setMany = (keys: RightKey[], on: boolean) =>
    setDraft((g) => {
      const next = { ...g } as Record<string, unknown>;
      for (const k of keys) next[k] = valueOf(k, on);
      return next as Grant;
    });

  const save = async () => {
    setBusy(true);
    try {
      const id = subject.type === 'user' ? subject.p.id : subject.d.id;
      await apiPost(
        `/api/access/${subject.type}/${id}`,
        { rights: Object.keys(draft).length ? draft : null },
        'PUT',
      );
      toast.success(
        `Access saved for ${person ? person.name : (subject as { d: AccessDept }).d.name}`,
        {
          description: 'In effect from their next click.',
        },
      );
      void qc.invalidateQueries({ queryKey: [API_KEY] });
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  // The Access page itself is never switched on in bulk: making someone an admin is explicit.
  const bulkKeys = MODULES.flatMap(pageKeys).filter((k) => k !== 'admin');

  return (
    <div className="flex min-h-0 flex-col lg:max-h-[78vh]">
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        {person ? (
          <Avatar id={person.id} name={person.name} size={40} />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <IconPeople size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-h2 text-primary-dark">
            {person ? person.name : (subject as { d: AccessDept }).d.name}
          </h2>
          <p className="truncate text-table text-text-muted">
            {person
              ? `${ROLE_NAME[person.role]}${person.position ? ` · ${person.position}` : ''}${
                  person.departments.length ? ` · ${person.departments.join(', ')}` : ''
                }`
              : 'Reaches everyone in this department and its sub-departments, unless set lower down'}
          </p>
        </div>
        {!locked && (
          <span className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setMany(bulkKeys, true)}
              className="btn btn-stroke h-8 border-good/40 px-2.5 text-good"
            >
              Allow all modules
            </button>
            <button
              type="button"
              onClick={() => setMany([...bulkKeys, 'admin'], false)}
              className="btn btn-stroke h-8 border-bad/40 px-2.5 text-bad"
            >
              Remove all
            </button>
            <Tip label="Back to inherited" hint="Clear everything set here">
              <button
                type="button"
                aria-label="Back to inherited"
                onClick={() => setDraft({})}
                className="grid h-8 w-8 place-items-center rounded-control border border-border text-text-muted hover:border-primary hover:text-primary"
              >
                <IconReset size={15} />
              </button>
            </Tip>
          </span>
        )}
      </header>
      {locked && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-bad/10 px-3 py-2 text-table text-bad">
          <IconLock size={14} /> A locked admin (config/roles.json) always has every right.
        </p>
      )}
      <Legend />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3 pr-1">
        {MODULES.map((m) => {
          const keys = pageKeys(m);
          const onCount = keys.filter((k) => isOn(k, valueOfKey(k).value)).length;
          const expanded = open.includes(m.label);
          return (
            <div
              key={m.label}
              className={clsx(
                'rounded-2xl border transition',
                expanded ? 'border-primary/30 bg-primary-soft-100/40' : 'border-border',
              )}
            >
              <div className="flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setOpen((o) =>
                      o.includes(m.label) ? o.filter((x) => x !== m.label) : [...o, m.label],
                    )
                  }
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="grid h-8 w-8 place-items-center text-primary">
                    {MODULE_ICON[m.label]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-h3 font-extrabold text-primary-dark">
                      {m.label}
                    </span>
                    <span className="block text-[12px] text-text-muted">
                      {onCount} of {keys.length} pages open
                    </span>
                  </span>
                  <IconChevron
                    size={14}
                    className={clsx(
                      'text-text-muted transition-transform',
                      expanded && 'rotate-90',
                    )}
                  />
                </button>
                <Toggle
                  on={onCount === keys.length}
                  partial={onCount > 0 && onCount < keys.length}
                  disabled={locked}
                  label={`${m.label}: all pages`}
                  onChange={(on) =>
                    setMany(
                      on ? keys.filter((k) => k !== 'admin' || onCount === keys.length) : keys,
                      on,
                    )
                  }
                />
              </div>
              {expanded && (
                <ul className="space-y-1 px-3 pb-3">
                  {m.pages.map((pg) => (
                    <PageRow key={pg.id} pg={pg} locked={locked} get={valueOfKey} set={set} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <p className="px-1 text-[12px] text-text-muted">
          Finance is for admins only and cannot be given here.
        </p>
      </div>

      {!locked && (
        <footer
          className={clsx(
            'sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition',
            dirty ? 'border-warn/50 bg-warn/10' : 'border-border bg-surface',
          )}
        >
          <span className="text-table text-text-muted">
            {dirty ? `${changes} change${changes === 1 ? '' : 's'} not saved yet` : 'No changes'}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => setDraft(saved)}
              className="btn btn-stroke h-9 px-3 disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => void save()}
              className="btn btn-page h-9 px-4 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </span>
        </footer>
      )}
    </div>
  );
}

type Get = (k: RightKey) => { value: unknown; source: Source | 'draft' | 'inherit' };
type Set = (k: RightKey, v: unknown | undefined) => void;

function PageRow({ pg, locked, get, set }: { pg: PageDef; locked: boolean; get: Get; set: Set }) {
  const k = pg.right as RightKey;
  const v = get(k);
  return (
    <li className="rounded-xl bg-surface px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-heading text-button text-primary-dark">
            {pg.label}
            <SourceDot source={v.source} />
          </span>
          <span className="block truncate text-[12px] text-text-muted">{pg.hint}</span>
        </span>
        <ResetButton
          show={!locked && v.source !== 'inherit' && v.source !== 'role' && v.source !== 'locked'}
          onClick={() => set(k, undefined)}
        />
        <Toggle
          on={isOn(k, v.value)}
          unknown={v.value === undefined}
          disabled={locked}
          label={pg.label}
          onChange={(on) => set(k, valueOf(k, on))}
        />
      </div>
      {pg.permissions && pg.permissions.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-l-2 border-accent/30 pl-3">
          {pg.permissions.map((perm) => (
            <PermissionRow key={perm.key} perm={perm} locked={locked} get={get} set={set} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PermissionRow({
  perm,
  locked,
  get,
  set,
}: {
  perm: PermissionDef;
  locked: boolean;
  get: Get;
  set: Set;
}) {
  const k = perm.key as RightKey;
  const v = get(k);
  const on = v.value === undefined ? null : isOn(k, v.value);
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-table font-bold text-text">
          {perm.label}
          <SourceDot source={v.source} />
        </span>
        <span className="block truncate text-[12px] text-text-muted">{perm.hint}</span>
      </span>
      <ResetButton
        show={!locked && v.source !== 'inherit' && v.source !== 'role' && v.source !== 'locked'}
        onClick={() => set(k, undefined)}
      />
      <span
        className="inline-flex rounded-full bg-primary-soft p-0.5"
        role="radiogroup"
        aria-label={perm.label}
      >
        {perm.values.map((label, i) => {
          const active = on === (i === 0);
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={locked}
              onClick={() => set(k, valueOf(k, i === 0))}
              className={clsx(
                'rounded-full px-2.5 py-1 font-heading text-[12px] font-bold transition disabled:cursor-not-allowed',
                active
                  ? i === 0
                    ? 'bg-surface text-primary'
                    : 'bg-navy text-white'
                  : 'text-primary-muted hover:text-primary',
              )}
            >
              {label}
            </button>
          );
        })}
      </span>
    </li>
  );
}

function Toggle({
  on,
  partial,
  unknown,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  partial?: boolean;
  unknown?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={partial ? 'mixed' : on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      title={
        unknown
          ? 'Inherited from higher up'
          : on
            ? 'On: click to turn off'
            : 'Off: click to turn on'
      }
      className={clsx(
        'relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60',
        unknown
          ? 'bg-[color-mix(in_srgb,var(--text)_14%,var(--surface))]'
          : on
            ? 'bg-accent'
            : partial
              ? 'bg-accent/50'
              : 'bg-[color-mix(in_srgb,var(--text)_32%,var(--surface))]',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          unknown ? 'left-3' : on ? 'left-[22px]' : partial ? 'left-3' : 'left-0.5',
        )}
      />
    </button>
  );
}

function SourceDot({ source }: { source: Source | 'draft' | 'inherit' }) {
  if (source === 'inherit')
    return <span className="text-[10px] font-normal text-text-muted">inherited</span>;
  const s = SOURCE[source];
  return (
    <Tip label={s.label}>
      <span className={clsx('inline-block h-2 w-2 rounded-full', s.dot)} aria-label={s.label} />
    </Tip>
  );
}

function ResetButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  if (!show) return null;
  return (
    <Tip label="Back to inherited">
      <button
        type="button"
        aria-label="Back to inherited"
        onClick={onClick}
        className="grid h-7 w-7 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100 hover:text-primary"
      >
        <IconReset size={13} />
      </button>
    </Tip>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[12px] text-text-muted">
      {(Object.keys(SOURCE) as (keyof typeof SOURCE)[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={clsx('h-2 w-2 rounded-full', SOURCE[k].dot)} />
          {SOURCE[k].label}
        </span>
      ))}
    </p>
  );
}

const describe = (g: Grant | null) => {
  const n = normalize(g);
  return !Object.keys(n).length
    ? 'inherit everything'
    : RIGHTS.filter((r) => n[r.key] !== undefined)
        .map((r) => `${r.label} ${r.values[isOn(r.key, n[r.key as keyof Rights]) ? 0 : 1]}`)
        .join(', ');
};

function RecentChanges() {
  const { data } = useAudit();
  return (
    <aside className="rounded-card border border-border bg-surface p-4" data-tour="access-audit">
      <h2 className="mb-3 font-heading text-h3 text-primary-dark">Recent changes</h2>
      {!data?.rows.length ? (
        <p className="text-table text-text-muted">No changes yet. Every change is listed here.</p>
      ) : (
        <ol className="grid gap-2 md:grid-cols-2">
          {data.rows.slice(0, 30).map((r) => (
            <li
              key={r.id}
              className="relative rounded-xl border-l-2 border-accent/50 bg-bg/60 px-3 py-2"
            >
              <span className="block text-[12px] text-text-muted">
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
