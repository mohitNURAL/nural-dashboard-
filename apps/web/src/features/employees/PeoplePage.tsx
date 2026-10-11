// People directory (SRS 17): everyone in Bitrix24 with their designation and department, what
// they can open on the dashboard (access areas), whether they use it (sign-in status, sign-ins,
// last active) and their open and overdue tasks. Employee module (employees right).
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import { IconDownload, IconPeople, IconSearch } from '../../components/ui/icons';
import { Tip } from '../../components/ui/Tip';
import { useEmployees, type Employee, type SignInStatus } from './api';
import { PageHead } from '../../components/ui/PageHead';
import { Avatar, StatusPill } from './common';
import { ROLE_NAME, STATUS, timeAgo } from './labels';

const col = createColumnHelper<Employee>();

/** What a person can open and do on the dashboard. */
function AccessChips({ e }: { e: Employee }) {
  const r = e.rights;
  const chips: [string, string][] = [
    [
      r.scope === 'all' ? 'All data' : 'Own tasks',
      r.scope === 'all' ? 'bg-primary/15 text-primary' : 'bg-border/50 text-text-muted',
    ],
    ...(r.kpi ? [['KPI', 'bg-accent/15 text-accent'] as [string, string]] : []),
    ['Dev · QA', 'bg-border/50 text-text-muted'],
    ...(r.support ? [['Support', 'bg-accent/15 text-accent'] as [string, string]] : []),
    ...(r.inbox ? [['Inbox', 'bg-accent/15 text-accent'] as [string, string]] : []),
    ...(r.employees ? [['Employees', 'bg-primary/15 text-primary'] as [string, string]] : []),
    [
      r.edit === 'all' ? 'Edit all' : 'Edit limited',
      r.edit === 'all' ? 'bg-good/15 text-good' : 'bg-border/50 text-text-muted',
    ],
    ...(r.admin ? [['Admin', 'bg-bad/15 text-bad'] as [string, string]] : []),
  ];
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map(([t, cls]) => (
        <span
          key={t}
          className={clsx(
            'whitespace-nowrap rounded-md px-1.5 py-0.5 font-heading text-label font-bold',
            cls,
          )}
        >
          {t}
        </span>
      ))}
    </span>
  );
}

const columns = [
  col.accessor('name', {
    header: 'Employee',
    cell: (c) => (
      <span className={clsx('flex items-center gap-2.5', !c.row.original.active && 'opacity-50')}>
        <Avatar id={c.row.original.id} name={c.getValue()} size={32} />
        <span className="min-w-0">
          <span className="block truncate font-heading text-button text-primary-dark">
            {c.getValue()}
          </span>
          <span className="block truncate text-table text-text-muted">
            {c.row.original.position ?? '—'}
            {!c.row.original.active && ' · inactive in Bitrix24'}
          </span>
        </span>
      </span>
    ),
  }),
  col.accessor((r) => r.departments.join(', '), { id: 'department', header: 'Department' }),
  col.accessor((r) => ROLE_NAME[r.role], { id: 'role', header: 'Role' }),
  col.display({
    id: 'access',
    header: 'Access areas',
    cell: (c) => <AccessChips e={c.row.original} />,
  }),
  col.accessor((r) => ORDER[r.status], {
    id: 'status',
    header: 'Dashboard',
    cell: (c) => (
      <span className="flex flex-col items-start gap-0.5">
        <StatusPill status={c.row.original.status} />
        <span className="text-table text-text-muted">
          {c.row.original.loginCount} sign-in{c.row.original.loginCount === 1 ? '' : 's'}
        </span>
      </span>
    ),
  }),
  col.accessor((r) => r.lastSeenAt ?? '', {
    id: 'lastSeen',
    header: 'Last active',
    cell: (c) => (
      <span
        title={
          c.row.original.lastSeenAt
            ? new Date(c.row.original.lastSeenAt).toLocaleString('en-IN')
            : undefined
        }
      >
        {timeAgo(c.row.original.lastSeenAt)}
      </span>
    ),
  }),
  col.accessor('open', { header: 'Open', meta: { align: 'right' } }),
  col.accessor('overdue', {
    header: 'Overdue',
    meta: { align: 'right' },
    cell: (c) => (
      <span className={clsx(c.getValue() > 0 && 'font-bold text-bad')}>{c.getValue()}</span>
    ),
  }),
];

const ORDER: Record<SignInStatus, number> = {
  active: 0,
  signedIn: 1,
  earlier: 2,
  ended: 3,
  never: 4,
};

export function PeoplePage() {
  const { data, isLoading } = useEmployees();
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  // 'session' = signed in now (active or session still open).
  const [status, setStatus] = useState<SignInStatus | 'session' | ''>('');
  const [inactive, setInactive] = useState(false);

  const departments = useMemo(
    () => [...new Set(rows.flatMap((r) => r.departments))].sort(),
    [rows],
  );
  const shown = rows.filter(
    (r) =>
      (inactive || r.active) &&
      (!dept || r.departments.includes(dept)) &&
      (!status ||
        (status === 'session'
          ? r.status === 'active' || r.status === 'signedIn'
          : r.status === status)) &&
      (!q ||
        `${r.name} ${r.position ?? ''} ${r.departments.join(' ')}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  const active = rows.filter((r) => r.active);
  const tiles: {
    id: string;
    label: string;
    info: string;
    value: number;
    sub: string;
    pick?: SignInStatus | 'session';
  }[] = [
    {
      id: 'employees',
      label: 'Employees',
      info: 'People active in Bitrix24.',
      value: active.length,
      sub: 'Active in Bitrix24',
    },
    {
      id: 'signedIn',
      label: 'Signed in',
      info: 'Active now, or signed in less than 3 days ago (a session lasts 3 days).',
      value: active.filter((r) => r.status === 'active' || r.status === 'signedIn').length,
      sub: 'Session still open',
      pick: 'session',
    },
    {
      id: 'activeNow',
      label: 'Active now',
      info: 'Used the dashboard in the last 5 minutes.',
      value: active.filter((r) => r.status === 'active').length,
      sub: 'In the last 5 minutes',
      pick: 'active',
    },
    {
      id: 'never',
      label: 'Never signed in',
      info: 'Active in Bitrix24 but never signed in to the dashboard.',
      value: active.filter((r) => r.status === 'never').length,
      sub: 'Not used the dashboard yet',
      pick: 'never',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHead
        title="People directory"
        sub="Who is who, what they can open, and who uses the dashboard"
        icon={<IconPeople size={24} />}
      >
        <Tip label="Export to Excel" hint="Everyone, with access and activity">
          <a
            href="/api/employees/export"
            download
            aria-label="Export to Excel"
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-text-muted hover:border-primary hover:text-primary"
          >
            <IconDownload />
          </a>
        </Tip>
      </PageHead>

      <div data-tour="people-tiles">
        <SortableGroup
          group="people.tiles"
          noun="tile"
          className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
          items={tiles.map((t) => ({
            id: t.id,
            node: (
              <StatTile
                label={t.label}
                info={t.info}
                value={isLoading ? undefined : t.value}
                sub={t.sub}
                active={!!t.pick && status === t.pick}
                onClick={() => setStatus(t.pick && status !== t.pick ? t.pick : '')}
              />
            ),
          }))}
        />
      </div>

      <SortableGroup
        group="people.cards"
        noun="card"
        className="grid grid-cols-1 gap-4"
        items={[
          {
            id: 'directory',
            node: (
              <div className="rounded-card border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label className="relative">
                    <IconSearch
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search name, designation, department"
                      className="h-9 w-72 rounded-xl border border-border bg-surface pl-9 pr-3 text-body text-text focus:border-primary focus:outline-none"
                    />
                  </label>
                  <select
                    value={dept}
                    onChange={(e) => setDept(e.target.value)}
                    aria-label="Department"
                    className="h-9 rounded-xl border border-border bg-surface px-3 text-body text-text"
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SignInStatus | 'session' | '')}
                    aria-label="Dashboard status"
                    className="h-9 rounded-xl border border-border bg-surface px-3 text-body text-text"
                  >
                    <option value="">Any status</option>
                    <option value="session">Signed in (now or session open)</option>
                    {(Object.keys(STATUS) as SignInStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS[s].label}
                      </option>
                    ))}
                  </select>
                  <label className="flex cursor-pointer items-center gap-2 text-table text-text-muted">
                    <input
                      type="checkbox"
                      checked={inactive}
                      onChange={(e) => setInactive(e.target.checked)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    Show inactive
                  </label>
                  <span className="ml-auto text-table text-text-muted">
                    {shown.length} of {inactive ? rows.length : active.length}
                  </span>
                </div>
                <DataTable
                  tableId="people"
                  columns={columns}
                  data={shown}
                  rowKey={(r) => r.id}
                  loading={isLoading}
                  initialSorting={[{ id: 'status', desc: false }]}
                  emptyText="Nobody matches."
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
