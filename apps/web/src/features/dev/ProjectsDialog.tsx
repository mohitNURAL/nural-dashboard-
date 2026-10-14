// Development tab Projects (2026-10-13): the projects in a popup, most active this week first.
// Each project is an accordion row (one open at a time) with its activity, deadline (its last task
// deadline) and counts; opening it lists who works on it with their own counts and last deadline.
// A count closes the popup and opens those tasks; their list has a Back button to return here.
import * as Dialog from '@radix-ui/react-dialog';
import type { DevPreset } from '@nural/shared';
import clsx from 'clsx';
import { Fragment, useMemo, useState } from 'react';
import type { WorkCounts } from '../../api/types';
import { ViewToggle } from '../../components/Card';
import { IconClose, IconLayers } from '../../components/ui/icons';
import { Tip } from '../../components/ui/Tip';
import { SearchInput } from '../../components/ui/SearchInput';
import { useDevProjects } from './api';
import { useDrillTo } from './drill';
import { fmtDate } from './format';
import { useProjectsPopup, type ProjectPeriod, type ProjectShow } from './projectsPopup';

const SHOW_TITLE: Record<ProjectShow, string> = {
  all: 'All projects',
  active: 'Active projects',
  silent: 'Silent projects',
  hold: 'Projects on hold',
};

const STATUS_LABEL = { active: 'Active', silent: 'Silent', hold: 'On hold' } as const;

const PERIOD_LABEL: Record<ProjectPeriod, string> = { day: 'Day', week: 'Week', month: 'Month' };

type Count = 'open' | 'done' | 'overdue' | 'spill';
/** Columns; Done, Overdue and Spill follow the Day / Week / Month switch. */
const columns = (
  p: ProjectPeriod,
): { key: Count; label: string; preset: DevPreset; tone?: 'bad'; period?: boolean }[] => {
  const w = p === 'day' ? 'day' : p;
  return [
    { key: 'open', label: 'Open', preset: 'pending' },
    { key: 'done', label: `Done prev ${w}`, preset: 'donePrev', period: true },
    {
      key: 'overdue',
      label: p === 'day' ? 'Overdue today' : `Overdue this ${w}`,
      preset: 'overduePeriod',
      tone: 'bad',
      period: true,
    },
    { key: 'spill', label: `Spill of prev ${w}`, preset: 'spill', tone: 'bad', period: true },
  ];
};

export function ProjectsDialog() {
  const { open, show, expanded, close, toggle, openPopup, period, setPeriod } = useProjectsPopup();
  const { data, isLoading } = useDevProjects(period);
  const COLS = columns(period);
  const WIDTH = COLS.length + 3;
  const drill = useDrillTo();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        (show === 'all' || r.status === show) &&
        (!words ||
          r.name.toLowerCase().includes(words) ||
          r.people.some((p) => p.person.name.toLowerCase().includes(words))),
    );
  }, [data, show, q]);
  if (!open) return null;

  /** Closes the popup and opens the tasks behind a count; their list can come back here. */
  const openTasks = (label: string, preset: DevPreset, params: Record<string, string>) => {
    close();
    drill({ label, preset, params, back: 'projects' });
  };
  /** A count: hover shows its dev tasks and issues; a click opens its tasks. */
  const cell = (
    c: ReturnType<typeof columns>[number],
    w: WorkCounts,
    label: string,
    params: Record<string, string>,
  ) => {
    const n = w[c.key];
    const issues = w.issues[c.key];
    return n ? (
      <Tip
        label={`Dev tasks ${(n - issues).toLocaleString('en-IN')} · Issues ${issues.toLocaleString('en-IN')}`}
        hint={`${c.label}: click for the tasks`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openTasks(`${label} · ${c.label}`, c.preset, c.period ? { ...params, period } : params);
          }}
          className={clsx(
            'font-heading font-bold tabular-nums hover:underline',
            c.tone === 'bad' ? 'text-bad' : 'text-primary-dark',
          )}
        >
          {n.toLocaleString('en-IN')}
        </button>
      </Tip>
    ) : (
      <span className="text-text-muted">0</span>
    );
  };
  const activity = (w: WorkCounts) => (
    <span title={w.lastActivity ? `Last activity ${fmtDate(w.lastActivity)}` : undefined}>
      {w.activityWeek ? (
        <b className="tabular-nums text-good">{w.activityWeek}</b>
      ) : (
        <span className="text-text-muted">0</span>
      )}
    </span>
  );

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(1100px,96vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none">
          <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-white">
              <IconLayers size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                Projects at work: {SHOW_TITLE[show]} ({rows.length})
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                Most active this week first, then the earliest deadline. Open a project to see who
                works on it; click a count for its tasks.
                {show !== 'all' && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => openPopup('all')}
                      className="font-heading font-bold text-primary hover:underline"
                    >
                      Show all projects
                    </button>
                  </>
                )}
              </Dialog.Description>
            </div>
            <ViewToggle<ProjectPeriod>
              value={period}
              onChange={setPeriod}
              options={(['day', 'week', 'month'] as const).map((p) => ({
                value: p,
                label: PERIOD_LABEL[p],
              }))}
            />
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search project or person…"
              label="Search projects"
              className="w-60"
            />
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto px-5 py-3">
            {isLoading ? (
              <p className="py-8 text-center text-text-muted">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-text-muted">No project here.</p>
            ) : (
              <table className="nural-table w-full border-separate border-spacing-0 text-table [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
                <thead className="sticky top-0 z-10">
                  <tr className="text-left font-heading text-label uppercase">
                    <th>Project</th>
                    <th className="text-right" title="Tasks touched (changed or moved) in 7 days">
                      Activity (7 d)
                    </th>
                    <th>Deadline</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="text-right">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = expanded === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className={clsx('cursor-pointer', isOpen && 'bg-primary-soft-100/70')}
                          onClick={() => toggle(r.id)}
                          aria-expanded={isOpen}
                        >
                          <td className="font-heading font-bold text-primary-dark">
                            <span className="inline-flex items-center gap-2">
                              <span
                                aria-hidden
                                className={clsx(
                                  'inline-block w-3 text-primary transition-transform',
                                  isOpen && 'rotate-90',
                                )}
                              >
                                ›
                              </span>
                              {r.name}
                              <span
                                className={clsx(
                                  'rounded-full px-2 py-0.5 font-heading text-[11px] font-bold',
                                  r.status === 'active'
                                    ? 'bg-good/15 text-good'
                                    : r.status === 'hold'
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-warn/15 text-warn',
                                )}
                              >
                                {STATUS_LABEL[r.status]}
                              </span>
                              <span className="font-body text-[12px] font-normal text-text-muted">
                                {r.people.length} {r.people.length === 1 ? 'person' : 'people'}
                              </span>
                            </span>
                          </td>
                          <td className="text-right">{activity(r)}</td>
                          <td className="whitespace-nowrap font-bold">
                            {r.lastDeadline ? fmtDate(r.lastDeadline) : '—'}
                          </td>
                          {COLS.map((c) => (
                            <td key={c.key} className="text-right">
                              {cell(c, r, r.name, { project: String(r.id) })}
                            </td>
                          ))}
                        </tr>
                        {isOpen &&
                          (r.people.length ? (
                            r.people.map((p) => (
                              <tr key={p.id} className="bg-bg/60">
                                <td className="pl-10 text-text">{p.person.name}</td>
                                <td className="text-right">{activity(p)}</td>
                                <td className="whitespace-nowrap text-text-muted">
                                  {p.lastDeadline ? fmtDate(p.lastDeadline) : '—'}
                                </td>
                                {COLS.map((c) => (
                                  <td key={c.key} className="text-right">
                                    {cell(c, p, `${r.name} · ${p.person.name}`, {
                                      project: String(r.id),
                                      assignee: String(p.id),
                                    })}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={WIDTH} className="pl-10 text-text-muted">
                                No one has open tasks here.
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
