// Report › Daily task update (2026-10-17, SRS 24): what each person planned and what they actually
// did, with every task's fields now and its Kanban moves that day, and who has and has not planned
// and wrapped up. View only. Admins, PM and team leads (full data scope) see everyone expected to
// post; anyone else sees their own days. Filters: dates, department, assignee. Excel and PDF.
import type { DailyState } from '@nural/shared';
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useMe } from '../../api/me';
import { useApi } from '../../api/queries';
import { Card, ViewToggle } from '../../components/Card';
import { DataTable } from '../../components/DataTable';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { SearchCombobox } from '../../components/SearchCombobox';
import { StatTile } from '../../components/StatTile';
import { IconDaily, IconExcel, IconPdf } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { Select } from '../../components/ui/Select';
import { StateChip } from '../daily/taskColumns';
import { CheckInsCard } from './CheckInsCard';
import { DEPT_LABEL } from '../kpi/format';
import { reportTables } from './dailyReportTable';
import type { DailyReport, ReportLine } from './dailyReportTypes';

type Who = 'all' | 'notPlanned' | 'notWrapped';

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
const dayText = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
const DEPT = DEPT_LABEL;
const WHY: Record<string, string> = {
  carried: 'Carried over',
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Taken early',
  noDeadline: 'No deadline (set to today)',
  added: 'Added',
};

const col = createColumnHelper<ReportLine>();
const btn =
  'inline-flex h-9 items-center gap-1.5 rounded-control border border-border bg-surface px-3 font-heading text-button text-text hover:border-primary hover:text-primary disabled:opacity-50';
const dateInput =
  'h-9 rounded-control border border-border bg-surface px-2 text-table text-text outline-none focus:border-primary';

export function DailyReportPage() {
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [from, setFrom] = useState(todayKey);
  const [to, setTo] = useState(todayKey);
  const [dept, setDept] = useState('all');
  const [assignee, setAssignee] = useState<string[]>([]);
  const [who, setWho] = useState<Who>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const params = useMemo(() => {
    const p: Record<string, string> = { from, to };
    if (dept !== 'all') p.dept = dept;
    if (assignee.length) p.assignee = assignee.join(',');
    return p;
  }, [from, to, dept, assignee]);
  const { data, isLoading } = useApi<DailyReport>('/api/report/daily', params);
  const { data: me } = useMe();

  const lines = useMemo(
    () =>
      (data?.lines ?? []).filter((l) =>
        who === 'notPlanned' ? !l.plannedAt : who === 'notWrapped' ? !l.wrappedAt : true,
      ),
    [data, who],
  );
  const posted = (data?.lines ?? []).filter((l) => l.plannedAt || l.wrappedAt);
  const s = data?.summary;
  const showing = `${from === to ? dayText(to) : `${dayText(from)} to ${dayText(to)}`}${
    dept !== 'all' ? ` · ${DEPT[dept as keyof typeof DEPT]}` : ''
  }${assignee.length ? ` · ${assignee.length} people` : ''}`;

  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    if (!data) return;
    setBusy(kind);
    try {
      const m = await import('../dev/projectsExport');
      const t = reportTables(data.lines);
      if (kind === 'xlsx') await m.exportProjectsExcel('Daily task update', showing, t.full);
      else
        m.exportProjectsPdf('Daily task update', showing, t.pdf, {
          textWidths: [92, 58, 40, 40, 170, 92, 62, 52, 48, 70],
          isGroup: (row) => row[4] === '' || row[4] === null,
          text: (_row, _i, x) => x,
        });
    } finally {
      setBusy(null);
    }
  };

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: 'Person',
        cell: (c) => <span className="font-bold text-primary-dark">{c.getValue()}</span>,
      }),
      col.accessor((l) => DEPT[l.dept], { id: 'dept', header: 'Department' }),
      col.accessor('day', { header: 'Day', cell: (c) => dayText(c.getValue()) }),
      col.accessor((l) => l.plannedAt ?? '', {
        id: 'plannedAt',
        header: 'Planned at',
        cell: (c) =>
          c.row.original.plannedAt ? (
            <span className="font-medium text-good">{time(c.row.original.plannedAt)}</span>
          ) : (
            <span className="font-bold text-bad">Not planned</span>
          ),
      }),
      col.accessor('planned', { header: 'Planned', meta: { align: 'center' } }),
      col.accessor((l) => l.wrappedAt ?? '', {
        id: 'wrappedAt',
        header: 'Wrapped up at',
        cell: (c) =>
          c.row.original.wrappedAt ? (
            <span className="font-medium text-good">{time(c.row.original.wrappedAt)}</span>
          ) : (
            <span className="font-bold text-bad">Not wrapped up</span>
          ),
      }),
      col.accessor('done', { header: 'Done', meta: { align: 'center' } }),
      col.accessor('wip', { header: 'WIP', meta: { align: 'center' } }),
      col.accessor('pending', { header: 'Pending', meta: { align: 'center' } }),
      col.accessor('hold', { header: 'On hold', meta: { align: 'center' } }),
      col.accessor('added', { header: 'Added', meta: { align: 'center' } }),
    ],
    [],
  );

  const tile = (
    id: string,
    label: string,
    value: number | undefined,
    sub: string,
    w: Who,
    tone?: 'bad',
  ) => ({
    id,
    node: (
      <StatTile
        label={label}
        value={value}
        sub={sub}
        tone={tone && value ? tone : undefined}
        active={who === w && w !== 'all'}
        onClick={() => setWho(w)}
      />
    ),
  });

  return (
    <div className="space-y-4">
      <PageHead
        title="Daily task update"
        sub={
          data?.full === false
            ? 'Your own days: what you planned and what you did'
            : 'Who planned and wrapped up their day, what was planned and what was done'
        }
        icon={<IconDaily size={24} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-table font-medium text-text">
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
              className={dateInput}
            />
          </label>
          <label className="flex items-center gap-1 text-table font-medium text-text">
            To
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && setTo(e.target.value)}
              className={dateInput}
            />
          </label>
          <button
            type="button"
            className={btn}
            onClick={() => void exportAs('xlsx')}
            disabled={!data || !!busy}
          >
            <IconExcel size={14} /> {busy === 'xlsx' ? 'Exporting…' : 'Excel'}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => void exportAs('pdf')}
            disabled={!data || !!busy}
          >
            <IconPdf size={14} /> {busy === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
        </div>
      </PageHead>

      {data?.full !== false && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchCombobox
            label="Assignee"
            className="w-72"
            options={(data?.people ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
            selected={assignee}
            onChange={setAssignee}
          />
          <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">Department: all</option>
            <option value="dev">Development</option>
            <option value="qa">QA</option>
            <option value="support">Support</option>
            <option value="ba">BA</option>
            <option value="other">Other</option>
          </Select>
        </div>
      )}

      <SortableGroup
        group="dailyreport.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          tile('expected', 'Expected', s?.expected, data ? dayText(data.day) : '', 'all'),
          tile('planned', 'Planned their day', s?.planned.length, 'Posted a morning plan', 'all'),
          tile(
            'notPlanned',
            'Not planned',
            s?.notPlanned.length,
            s?.notPlanned
              .slice(0, 3)
              .map((p) => p.name)
              .join(', ') ?? '',
            'notPlanned',
            'bad',
          ),
          tile('wrapped', 'Wrapped up', s?.wrapped.length, 'Posted what they did', 'all'),
          tile(
            'notWrapped',
            'Not wrapped up',
            s?.notWrapped.length,
            s?.notWrapped
              .slice(0, 3)
              .map((p) => p.name)
              .join(', ') ?? '',
            'notWrapped',
            'bad',
          ),
        ]}
      />

      <SortableGroup
        group="dailyreport.cards"
        noun="card"
        className="grid grid-cols-1 gap-4"
        items={[
          {
            id: 'who',
            node: (
              <Card
                title="Who planned and wrapped up"
                info="One line per person and working day: when they posted their plan and their wrap-up, how many tasks they planned, and how those ended (as reported in the wrap-up, else as they are now). Not planned and Not wrapped up in red."
                loading={isLoading}
                empty={!!data && lines.length === 0}
                action={
                  <ViewToggle<Who>
                    value={who}
                    onChange={setWho}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'notPlanned', label: 'Not planned' },
                      { value: 'notWrapped', label: 'Not wrapped up' },
                    ]}
                  />
                }
              >
                <DataTable
                  tableId="daily-report-who"
                  columns={columns}
                  data={lines}
                  rowKey={(l) => `${l.userId}:${l.day}`}
                  maxHeight={460}
                  dense
                />
              </Card>
            ),
          },
          {
            id: 'detail',
            node: (
              <Card
                title="Planned vs done"
                info="Each posted day: the tasks planned in the morning (and why), what was reported in the evening, where each task is now, and its Kanban moves that day. Open one at a time."
                loading={isLoading}
                empty={!!data && posted.length === 0}
                emptyText="Nobody has posted a plan or wrap-up in these dates."
              >
                <ul className="space-y-2">
                  {posted.map((l) => (
                    <DayAccordion
                      key={`${l.userId}:${l.day}`}
                      l={l}
                      open={openKey === `${l.userId}:${l.day}`}
                      onToggle={() =>
                        setOpenKey((k) =>
                          k === `${l.userId}:${l.day}` ? null : `${l.userId}:${l.day}`,
                        )
                      }
                    />
                  ))}
                </ul>
              </Card>
            ),
          },
          ...(me?.admin ? [{ id: 'checkins', node: <CheckInsCard /> }] : []),
        ]}
      />
    </div>
  );
}

function Count({ n, state }: { n: number; state: DailyState }) {
  return n ? (
    <span className="inline-flex items-center gap-1">
      <StateChip state={state} />
      <b className="tabular-nums">{n}</b>
    </span>
  ) : null;
}

function DayAccordion({
  l,
  open,
  onToggle,
}: {
  l: ReportLine;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={clsx(
        'overflow-hidden rounded-xl border',
        open ? 'border-primary/40 shadow-sm' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={clsx(
          'flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left',
          open ? 'bg-primary-soft-100' : 'hover:bg-primary-soft-100/60',
        )}
      >
        <span
          aria-hidden
          className={clsx(
            'inline-grid h-5 w-5 place-items-center rounded-md bg-primary/10 text-primary transition-transform',
            open && 'rotate-90',
          )}
        >
          ›
        </span>
        <span className="font-heading font-bold text-primary-dark">{l.name}</span>
        <span className="text-table font-medium text-text">{dayText(l.day)}</span>
        <span className="text-table text-text">
          Plan {l.plannedAt ? time(l.plannedAt) : '—'} · Wrap-up{' '}
          {l.wrappedAt ? time(l.wrappedAt) : '—'}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-table">
          <span className="font-medium text-text">{l.planned} planned</span>
          <Count n={l.done} state="done" />
          <Count n={l.wip} state="wip" />
          <Count n={l.pending} state="pending" />
          <Count n={l.hold} state="hold" />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {(l.planNote || l.wrapNote) && (
            <p className="text-table text-text">
              {l.planNote && (
                <span>
                  <b>Morning note:</b> {l.planNote}{' '}
                </span>
              )}
              {l.wrapNote && (
                <span>
                  <b>Evening note:</b> {l.wrapNote}
                </span>
              )}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-table">
              <thead>
                <tr className="bg-primary-dark text-left text-white">
                  {[
                    'Task',
                    'Project',
                    'On the plan',
                    'Reported',
                    'Now',
                    'Stage',
                    'Status',
                    'Priority',
                    'Tags',
                    'Deadline',
                    'Moves that day',
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-2.5 py-2 font-heading text-label font-bold uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {l.tasks.map((t, i) => (
                  <tr key={t.taskId || `x${i}`} className={i % 2 ? 'bg-bg/60' : 'bg-surface'}>
                    <td className="border-b border-border px-2.5 py-2">
                      {t.taskId > 0 && (
                        <span className="mr-1.5 text-[12px] font-bold text-primary">
                          #{t.taskId}
                        </span>
                      )}
                      <span className="font-semibold text-text">{t.title}</span>
                    </td>
                    <td className="border-b border-border px-2.5 py-2 text-text">{t.project}</td>
                    <td className="border-b border-border px-2.5 py-2">
                      {t.planned ? (
                        <span className="text-text">{WHY[t.why ?? ''] ?? 'Planned'}</span>
                      ) : (
                        <span className="font-bold text-accent-dark">Added in the evening</span>
                      )}
                    </td>
                    <td className="border-b border-border px-2.5 py-2">
                      {t.reported ? (
                        <StateChip state={t.reported} />
                      ) : (
                        <span className="text-text">—</span>
                      )}
                    </td>
                    <td className="border-b border-border px-2.5 py-2">
                      <StateChip state={t.now ?? undefined} />
                    </td>
                    <td className="border-b border-border px-2.5 py-2 text-text">
                      {t.stage ?? '—'}
                    </td>
                    <td className="border-b border-border px-2.5 py-2 text-text">
                      {t.status ?? '—'}
                    </td>
                    <td className="border-b border-border px-2.5 py-2 text-text">
                      {t.priority ?? '—'}
                    </td>
                    <td className="border-b border-border px-2.5 py-2 text-text">
                      {t.tags.join(', ') || '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-border px-2.5 py-2 text-text">
                      {t.deadline ? dayText(t.deadline.slice(0, 10)) : '—'}
                    </td>
                    <td className="border-b border-border px-2.5 py-2">
                      {t.moves.length ? (
                        <span className="flex flex-wrap gap-1">
                          {t.moves.map((m, k) => (
                            <span
                              key={k}
                              className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary-dark"
                            >
                              {m.from ?? '—'} → {m.to ?? '—'} · {time(m.at)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-text">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </li>
  );
}
