// Development tab Projects (2026-10-13): the recent projects in a popup, each with its deadline
// (its last task deadline) and who works on it: open and all tasks, done yesterday, overdue today,
// spill of yesterday and their last deadline. A count closes the popup and opens those tasks.
import * as Dialog from '@radix-ui/react-dialog';
import type { DevPreset } from '@nural/shared';
import clsx from 'clsx';
import { Fragment, useMemo, useState } from 'react';
import type { ProjectWorkRow, WorkCounts } from '../../api/types';
import { ViewToggle } from '../../components/Card';
import { IconClose, IconLayers } from '../../components/ui/icons';
import { SearchInput } from '../../components/ui/SearchInput';
import { useDevProjects } from './api';
import { useDrillTo } from './drill';
import { fmtDate } from './format';

export type ProjectShow = 'all' | 'overdue' | 'spill' | 'doneYesterday';
const SHOW: Record<ProjectShow, string> = {
  all: 'All',
  overdue: 'With overdue',
  spill: 'With spill',
  doneYesterday: 'Done yesterday',
};
const shows = (s: ProjectShow, r: ProjectWorkRow) =>
  s === 'all'
    ? true
    : s === 'overdue'
      ? r.overdue > 0
      : s === 'spill'
        ? r.spill > 0
        : r.doneYesterday > 0;

type Count = Exclude<keyof WorkCounts, 'lastDeadline'>;
const COLS: { key: Count; label: string; preset: DevPreset; tone?: 'bad' }[] = [
  { key: 'open', label: 'Open', preset: 'pending' },
  { key: 'total', label: 'All tasks', preset: 'total' },
  { key: 'doneYesterday', label: 'Done yesterday', preset: 'doneYesterday' },
  { key: 'overdue', label: 'Overdue', preset: 'overdue', tone: 'bad' },
  { key: 'spill', label: 'Spill of yesterday', preset: 'spill', tone: 'bad' },
];

export function ProjectsDialog({
  initial,
  onClose,
}: {
  initial: ProjectShow;
  onClose: () => void;
}) {
  const { data, isLoading } = useDevProjects();
  const drill = useDrillTo();
  const [show, setShow] = useState<ProjectShow>(initial);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        shows(show, r) &&
        (!words ||
          r.name.toLowerCase().includes(words) ||
          r.people.some((p) => p.person.name.toLowerCase().includes(words))),
    );
  }, [data, show, q]);

  /** Closes the popup and opens the tasks behind a count. */
  const open = (label: string, preset: DevPreset, params: Record<string, string>) => {
    onClose();
    drill({ label, preset, params });
  };
  const cell = (
    n: number,
    tone: 'bad' | undefined,
    label: string,
    preset: DevPreset,
    params: Record<string, string>,
  ) =>
    n ? (
      <button
        type="button"
        onClick={() => open(label, preset, params)}
        className={clsx(
          'font-heading font-bold tabular-nums hover:underline',
          tone === 'bad' ? 'text-bad' : 'text-primary-dark',
        )}
      >
        {n.toLocaleString('en-IN')}
      </button>
    ) : (
      <span className="text-text-muted">0</span>
    );

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
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
                Projects at work
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                Recent projects, their deadline and who works on them. Click a count for its tasks.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <ViewToggle<ProjectShow>
              value={show}
              onChange={setShow}
              options={(Object.keys(SHOW) as ProjectShow[]).map((s) => ({
                value: s,
                label: `${SHOW[s]} ${(data?.rows ?? []).filter((r) => shows(s, r)).length}`,
              }))}
            />
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search project or person…"
              label="Search projects"
              className="w-64"
            />
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
                    <th>Project / assignee</th>
                    <th>Deadline</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="text-right">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="bg-primary-soft-100/60">
                        <td className="font-heading font-bold text-primary-dark">
                          {r.name}
                          <span className="ml-2 font-body text-[12px] font-normal text-text-muted">
                            {r.people.length} {r.people.length === 1 ? 'person' : 'people'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap font-bold">
                          {r.lastDeadline ? fmtDate(r.lastDeadline) : '—'}
                        </td>
                        {COLS.map((c) => (
                          <td key={c.key} className="text-right">
                            {cell(r[c.key], c.tone, `${r.name} · ${c.label}`, c.preset, {
                              project: String(r.id),
                            })}
                          </td>
                        ))}
                      </tr>
                      {r.people.map((p) => (
                        <tr key={p.id}>
                          <td className="pl-8 text-text">{p.person.name}</td>
                          <td className="whitespace-nowrap text-text-muted">
                            {p.lastDeadline ? fmtDate(p.lastDeadline) : '—'}
                          </td>
                          {COLS.map((c) => (
                            <td key={c.key} className="text-right">
                              {cell(
                                p[c.key],
                                c.tone,
                                `${r.name} · ${p.person.name} · ${c.label}`,
                                c.preset,
                                { project: String(r.id), assignee: String(p.id) },
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
