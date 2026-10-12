// Company tree (SRS 17): the company's departments as in Bitrix24, each with its head and people,
// sub-departments nested with connector lines. Search finds a person or department and opens the
// way to it. Employee module (employees right).
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import { IconChevron, IconTree } from '../../components/ui/icons';
import { Tip } from '../../components/ui/Tip';
import { useOrgTree, type DeptNode, type PersonRef } from './api';
import { PageHead } from '../../components/ui/PageHead';
import { Avatar } from './common';
import { SearchInput } from '../../components/ui/SearchInput';

export function OrgTree() {
  const { data, isLoading } = useOrgTree();
  const depts = useMemo(() => data?.departments ?? [], [data]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<number> | null>(null);

  const { children, roots, peopleIn } = useMemo(() => {
    const ids = new Set(depts.map((d) => d.id));
    const children = new Map<number, DeptNode[]>();
    for (const d of depts) {
      if (d.parentId != null && ids.has(d.parentId)) {
        children.set(d.parentId, [...(children.get(d.parentId) ?? []), d]);
      }
    }
    for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const roots = depts.filter((d) => d.parentId == null || !ids.has(d.parentId));
    // People in a department and everything under it.
    const peopleIn = new Map<number, number>();
    const count = (d: DeptNode): Set<number> => {
      const s = new Set(d.members.map((m) => m.id));
      for (const c of children.get(d.id) ?? []) for (const id of count(c)) s.add(id);
      peopleIn.set(d.id, s.size);
      return s;
    };
    roots.forEach(count);
    return { children, roots, peopleIn };
  }, [depts]);

  // Search: departments matching by name or person, and every department on the way to them.
  const needle = q.trim().toLowerCase();
  const { hits, path } = useMemo(() => {
    const hits = new Set<number>();
    const path = new Set<number>();
    if (!needle) return { hits, path };
    const byId = new Map(depts.map((d) => [d.id, d]));
    const match = (p: PersonRef | null) =>
      !!p &&
      (p.name.toLowerCase().includes(needle) || !!p.position?.toLowerCase().includes(needle));
    for (const d of depts) {
      if (d.name.toLowerCase().includes(needle) || match(d.head) || d.members.some(match)) {
        hits.add(d.id);
        for (let p = d.parentId; p != null; p = byId.get(p)?.parentId ?? null) path.add(p);
      }
    }
    return { hits, path };
  }, [needle, depts]);

  // Open by default: the top two levels.
  const defaultOpen = useMemo(
    () =>
      new Set([
        ...roots.map((r) => r.id),
        ...roots.flatMap((r) => (children.get(r.id) ?? []).map((c) => c.id)),
      ]),
    [roots, children],
  );
  const isOpen = (id: number) =>
    needle ? path.has(id) || hits.has(id) : (open ?? defaultOpen).has(id);
  const toggle = (id: number) => {
    const next = new Set(open ?? defaultOpen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  const people = new Set(depts.flatMap((d) => d.members.map((m) => m.id))).size;
  const heads = new Set(depts.flatMap((d) => (d.head ? [d.head.id] : []))).size;

  return (
    <div className="space-y-5">
      <PageHead
        title="Company tree"
        sub={`${depts.length} departments · ${people} people, from Bitrix24`}
        icon={<IconTree size={24} />}
      >
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Find a person or department"
          className="w-72"
        />
        <Tip label="Expand all">
          <button
            type="button"
            aria-label="Expand all"
            onClick={() => setOpen(new Set(depts.map((d) => d.id)))}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-text-muted hover:border-primary hover:text-primary"
          >
            <IconChevron className="rotate-90" />
          </button>
        </Tip>
        <Tip label="Collapse all">
          <button
            type="button"
            aria-label="Collapse all"
            onClick={() => setOpen(new Set())}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-text-muted hover:border-primary hover:text-primary"
          >
            <IconChevron className="-rotate-90" />
          </button>
        </Tip>
      </PageHead>

      <div data-tour="org-tiles">
        <SortableGroup
          group="org.tiles"
          noun="tile"
          className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
          items={[
            {
              id: 'departments',
              node: (
                <StatTile
                  label="Departments"
                  info="Departments in Bitrix24, sub-departments included."
                  value={isLoading ? undefined : depts.length}
                  sub={`${roots.length} at the top level`}
                  onClick={() => setOpen(new Set(depts.map((d) => d.id)))}
                />
              ),
            },
            {
              id: 'people',
              node: (
                <StatTile
                  label="People"
                  info="Active people in at least one department."
                  value={isLoading ? undefined : people}
                  sub="Active in Bitrix24"
                  onClick={() => setOpen(new Set(depts.map((d) => d.id)))}
                />
              ),
            },
            {
              id: 'heads',
              node: (
                <StatTile
                  label="Department heads"
                  info="People set as head of a department in Bitrix24; one person can head several."
                  value={isLoading ? undefined : heads}
                  sub={`${depts.filter((d) => d.head).length} departments have a head`}
                />
              ),
            },
            {
              id: 'noHead',
              node: (
                <StatTile
                  label="Without a head"
                  info="Departments with no head set in Bitrix24."
                  value={isLoading ? undefined : depts.filter((d) => !d.head).length}
                  sub="Set one in Bitrix24"
                  tone={depts.some((d) => !d.head) ? 'bad' : undefined}
                  onClick={() => setQ('')}
                />
              ),
            },
          ]}
        />
      </div>

      <SortableGroup
        group="org.cards"
        noun="card"
        className="grid grid-cols-1 gap-4"
        items={[
          {
            id: 'tree',
            node: (
              <div className="rounded-card border border-border bg-surface p-4">
                {isLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton h-16 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-3" data-tour="org-tree">
                    {roots.map((d) => (
                      <Node
                        key={d.id}
                        d={d}
                        depth={0}
                        children={children}
                        peopleIn={peopleIn}
                        isOpen={isOpen}
                        toggle={toggle}
                        hits={hits}
                        needle={needle}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

const DEPTH_TINT = [
  'from-primary to-accent',
  'from-accent to-primary',
  'from-primary-dark to-primary',
  'from-accent-dark to-accent',
];

function Node({
  d,
  depth,
  children,
  peopleIn,
  isOpen,
  toggle,
  hits,
  needle,
}: {
  d: DeptNode;
  depth: number;
  children: Map<number, DeptNode[]>;
  peopleIn: Map<number, number>;
  isOpen: (id: number) => boolean;
  toggle: (id: number) => void;
  hits: Set<number>;
  needle: string;
}) {
  const kids = children.get(d.id) ?? [];
  const open = isOpen(d.id);
  const hit = hits.has(d.id);
  const mark = (p: PersonRef) =>
    !!needle &&
    (p.name.toLowerCase().includes(needle) || !!p.position?.toLowerCase().includes(needle));
  return (
    <li className="relative">
      {depth > 0 && <span className="absolute -left-6 top-7 h-0.5 w-5 bg-border" aria-hidden />}
      <div
        className={clsx(
          'group flex items-center gap-3 rounded-card border bg-surface p-3 pr-4 transition hover:shadow-pop',
          hit ? 'border-accent ring-2 ring-accent/30' : 'border-border',
        )}
      >
        <button
          type="button"
          onClick={() => toggle(d.id)}
          aria-expanded={open}
          aria-label={`${open ? 'Close' : 'Open'} ${d.name}`}
          className={clsx(
            'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm transition group-hover:scale-105',
            DEPTH_TINT[depth % DEPTH_TINT.length],
          )}
        >
          <IconChevron className={clsx('transition-transform', open && 'rotate-90')} />
        </button>
        <button type="button" onClick={() => toggle(d.id)} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-heading text-h1 text-primary-dark">{d.name}</span>
          <span className="block text-table text-text-muted">
            {peopleIn.get(d.id) ?? 0} people
            {kids.length > 0 && ` · ${kids.length} team${kids.length > 1 ? 's' : ''}`}
            {d.members.length > 0 && kids.length > 0 && ` · ${d.members.length} directly`}
          </span>
        </button>
        {d.head && (
          <span className="hidden items-center gap-2.5 rounded-xl bg-primary-soft-100 py-1.5 pl-1.5 pr-3 sm:flex">
            <Avatar id={d.head.id} name={d.head.name} size={34} />
            <span className="min-w-0">
              <span className="block font-heading text-label uppercase tracking-wider text-accent">
                Head
              </span>
              <span
                className={clsx(
                  'block truncate font-heading text-button text-primary-dark',
                  mark(d.head) && 'underline decoration-accent decoration-2',
                )}
              >
                {d.head.name}
              </span>
              {d.head.position && (
                <span className="block truncate text-table text-text-muted">{d.head.position}</span>
              )}
            </span>
          </span>
        )}
      </div>

      {open && (d.members.length > 0 || kids.length > 0) && (
        <div className="relative ml-[22px] border-l-2 border-dashed border-border pl-6 pt-3">
          {d.members.length > 0 && (
            <ul className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {d.members.map((m) => (
                <li
                  key={m.id}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-xl border bg-surface px-2.5 py-2',
                    mark(m) ? 'border-accent ring-2 ring-accent/30' : 'border-border/70',
                  )}
                >
                  <Avatar id={m.id} name={m.name} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate font-heading text-button text-primary-dark">
                      {m.name}
                      {d.head?.id === m.id && (
                        <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 text-label text-accent">
                          Head
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-table text-text-muted">
                      {m.position ?? '—'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {kids.length > 0 && (
            <ul className="space-y-3">
              {kids.map((c) => (
                <Node
                  key={c.id}
                  d={c}
                  depth={depth + 1}
                  children={children}
                  peopleIn={peopleIn}
                  isOpen={isOpen}
                  toggle={toggle}
                  hits={hits}
                  needle={needle}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
