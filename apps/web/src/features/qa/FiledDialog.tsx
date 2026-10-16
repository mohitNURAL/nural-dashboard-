// QA "Last filed" popup (2026-10-16): the issues filed on the Last filed day, in the Projects at
// work look. Each project is an accordion row listing who filed its issues (the creators); each
// creator opens to who the issues went to (the assignees). Filed, Bug and Feedback at every level;
// a count closes the popup and opens exactly those issues.
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { Fragment, useMemo, useState } from 'react';
import { useApi } from '../../api/queries';
import type { QaFiled, QaFiledCounts } from '../../api/types';
import { InfoTip } from '../../components/InfoTip';
import { IconClose, IconQa } from '../../components/ui/icons';
import { SearchInput } from '../../components/ui/SearchInput';
import { useQaParams } from './api';
import { useFiledPopup } from './filedPopup';
import { lastFiledText } from './format';

type Key = 'filed' | 'bug' | 'feedback';
const COLS: { key: Key; label: string; info: string; type?: 'bug' | 'feedback' }[] = [
  { key: 'filed', label: 'Filed', info: 'Issues filed (created) that day: bugs and feedback.' },
  { key: 'bug', label: 'Bug', info: 'Issues tagged bug filed that day.', type: 'bug' },
  {
    key: 'feedback',
    label: 'Feedback',
    info: 'Issues tagged feedback filed that day.',
    type: 'feedback',
  },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

const Chevron = ({ open }: { open: boolean }) => (
  <span
    aria-hidden
    className={clsx(
      'inline-grid h-5 w-5 place-items-center rounded-md bg-primary/10 text-primary transition-transform',
      open && 'rotate-90',
    )}
  >
    ›
  </span>
);

const Avatar = ({ name, small }: { name: string; small?: boolean }) => (
  <span
    className={clsx(
      'grid place-items-center rounded-full bg-gradient-to-br from-primary to-accent font-heading font-bold text-white',
      small ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]',
    )}
  >
    {initials(name)}
  </span>
);

export function FiledDialog({
  onOpen,
}: {
  /** Opens "All issues" narrowed to these params. */
  onOpen: (label: string, params: Record<string, string>) => void;
}) {
  const { open, close } = useFiledPopup();
  const { data, isLoading } = useApi<QaFiled>('/api/qa/filed', useQaParams(), { enabled: open });
  const [q, setQ] = useState('');
  const [project, setProject] = useState<number | null>(null);
  const [creator, setCreator] = useState<string | null>(null);

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        !words ||
        r.name.toLowerCase().includes(words) ||
        r.creators.some(
          (c) =>
            c.person.name.toLowerCase().includes(words) ||
            c.assignees.some((a) => a.person.name.toLowerCase().includes(words)),
        ),
    );
  }, [data, q]);
  const total = rows.reduce((n, r) => n + r.filed, 0);
  if (!open) return null;

  const day = data?.day ?? null;
  const when = lastFiledText(day ? { date: day, isToday: !!data?.isToday } : null);
  const dayParams: Record<string, string> = day ? { dateField: 'created', from: day, to: day } : {};
  const count = (
    c: (typeof COLS)[number],
    w: QaFiledCounts,
    label: string,
    params: Record<string, string>,
    strong: boolean,
  ) => {
    const n = w[c.key];
    if (!n) return <span className="text-text-muted">0</span>;
    return (
      <button
        type="button"
        title={`${c.label}: click for the issues`}
        onClick={(e) => {
          e.stopPropagation();
          close();
          onOpen(`Filed ${when} · ${label} · ${c.label}`, {
            ...dayParams,
            ...params,
            ...(c.type ? { type: c.type } : {}),
          });
        }}
        className={clsx(
          'inline-flex min-w-[2.25rem] justify-center rounded-full px-2 py-0.5 font-heading font-bold tabular-nums transition hover:scale-105 hover:shadow-sm',
          c.key === 'bug'
            ? 'bg-bad/10 text-bad hover:bg-bad/20'
            : strong
              ? 'bg-primary/10 text-primary-dark hover:bg-primary/20'
              : 'bg-primary-soft-100 text-primary-dark hover:bg-primary/15',
        )}
      >
        {n.toLocaleString('en-IN')}
      </button>
    );
  };
  const cells = (
    w: QaFiledCounts,
    label: string,
    params: Record<string, string>,
    strong: boolean,
    py = 'py-2',
  ) =>
    COLS.map((c) => (
      <td key={c.key} className={clsx('border-b border-border px-3 text-center', py)}>
        {count(c, w, label, params, strong)}
      </td>
    ));

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(1040px,97vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none">
          <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-white">
              <IconQa size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                Last filed: {when} ({total})
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                Issues filed that day, by project. Open a project for who filed them, and a creator
                for who they went to; click a count for the issues.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg/40 px-5 py-2.5">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search project or person…"
              label="Search filed issues"
              className="w-60"
            />
          </div>
          <div className="flex-1 overflow-auto px-5 py-3">
            {isLoading ? (
              <p className="py-8 text-center text-text-muted">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-text-muted">No issue was filed that day.</p>
            ) : (
              <div className="nural-table-wrap">
                <table className="nural-table w-full border-separate border-spacing-0 text-table">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="w-1.5 p-0" aria-hidden />
                      <th className="px-3 py-2.5 text-left font-heading text-label font-bold uppercase tracking-wide">
                        Project / creator / assignee
                      </th>
                      {COLS.map((c) => (
                        <th
                          key={c.key}
                          scope="col"
                          className="whitespace-nowrap px-3 py-2.5 text-center font-heading text-label font-bold uppercase tracking-wide"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {c.label}
                            <InfoTip text={c.info} label={c.label} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const pOpen = project === r.id;
                      const pParams = { project: String(r.id) };
                      return (
                        <Fragment key={r.id}>
                          <tr
                            onClick={() => {
                              setProject(pOpen ? null : r.id);
                              setCreator(null);
                            }}
                            aria-expanded={pOpen}
                            className={clsx(
                              'cursor-pointer transition-colors',
                              pOpen
                                ? 'bg-primary-soft-100'
                                : 'bg-surface hover:bg-primary-soft-100/60',
                            )}
                          >
                            <td className="w-1.5 border-b border-l-4 border-border border-l-primary p-0" />
                            <td className="border-b border-border px-3 py-2.5 font-heading font-bold text-primary-dark">
                              <span className="inline-flex flex-wrap items-center gap-2">
                                <Chevron open={pOpen} />
                                {r.name}
                                <span className="font-body text-[12px] font-normal text-text-muted">
                                  {r.creators.length}{' '}
                                  {r.creators.length === 1 ? 'creator' : 'creators'}
                                </span>
                              </span>
                            </td>
                            {cells(r, r.name, pParams, true, 'py-2.5')}
                          </tr>
                          {pOpen &&
                            r.creators.map((c) => {
                              const key = `${r.id}:${c.id}`;
                              const cOpen = creator === key;
                              const cParams = { ...pParams, createdBy: String(c.id) };
                              const cLabel = `${r.name} · ${c.person.name}`;
                              return (
                                <Fragment key={key}>
                                  <tr
                                    onClick={() => setCreator(cOpen ? null : key)}
                                    aria-expanded={cOpen}
                                    className={clsx(
                                      'cursor-pointer',
                                      cOpen ? 'bg-primary-soft-100/70' : 'bg-surface hover:bg-bg',
                                    )}
                                  >
                                    <td className="border-b border-l-4 border-border border-l-primary-soft-300 p-0" />
                                    <td className="border-b border-border px-3 py-2 pl-9 text-text">
                                      <span className="inline-flex items-center gap-2">
                                        <Chevron open={cOpen} />
                                        <Avatar name={c.person.name} />
                                        <span className="font-heading font-bold">
                                          {c.person.name}
                                        </span>
                                        <span className="text-[12px] text-text-muted">
                                          filed for {c.assignees.length}{' '}
                                          {c.assignees.length === 1 ? 'person' : 'people'}
                                        </span>
                                      </span>
                                    </td>
                                    {cells(c, cLabel, cParams, false)}
                                  </tr>
                                  {cOpen &&
                                    c.assignees.map((a, i) => (
                                      <tr key={a.id} className={i % 2 ? 'bg-bg/70' : 'bg-surface'}>
                                        <td className="border-b border-l-4 border-border border-l-primary-soft-300 p-0" />
                                        <td className="border-b border-border px-3 py-1.5 pl-20 text-text">
                                          <span className="inline-flex items-center gap-2">
                                            <Avatar name={a.person.name} small />
                                            {a.person.name}
                                          </span>
                                        </td>
                                        {cells(
                                          a,
                                          `${cLabel} → ${a.person.name}`,
                                          { ...cParams, assignee: String(a.id) },
                                          false,
                                          'py-1.5',
                                        )}
                                      </tr>
                                    ))}
                                </Fragment>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
