// QA issue popups in the Projects at work look (2026-10-16, shared 2026-10-21): Last filed and
// Open / pending. Each project is an accordion row listing who filed its issues (the creators);
// each creator opens to who the issues are with (the assignees). The caller picks the count
// columns; a count closes the popup and opens exactly those issues.
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { Person } from '../../api/types';
import { InfoTip } from '../../components/InfoTip';
import { IconClose, IconExcel, IconPdf, IconQa } from '../../components/ui/icons';
import { SearchInput } from '../../components/ui/SearchInput';

export type TreeRow<C> = C & {
  id: number;
  name: string;
  creators: (C & {
    id: number;
    person: Person;
    assignees: (C & { id: number; person: Person })[];
  })[];
};

export interface TreeCol<C> {
  key: keyof C & string;
  label: string;
  info: string;
  /** Red chip (bugs, overdue). */
  bad?: boolean;
  /** Added to the list a count opens. */
  params?: Record<string, string>;
}

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

export function IssueTreeDialog<C extends Record<keyof C, number>>({
  title,
  description,
  rows: all,
  isLoading,
  cols,
  totalKey,
  creatorNote,
  empty,
  searchLabel,
  onClose,
  onCount,
  onExport,
}: {
  /** The title before "(total)". */
  title: string;
  description: ReactNode;
  rows: TreeRow<C>[] | undefined;
  isLoading: boolean;
  cols: TreeCol<C>[];
  /** The column summed into the title. */
  totalKey: keyof C & string;
  /** Beside a creator's name, e.g. "filed for 3 people". */
  creatorNote: (people: number) => string;
  empty: string;
  searchLabel: string;
  onClose: () => void;
  /** A count clicked: `label` names its line, `params` narrow the list to it. */
  onCount: (label: string, col: TreeCol<C>, params: Record<string, string>) => void;
  /** Excel and PDF of the projects shown (search applied); `q` is the search. */
  onExport: (kind: 'xlsx' | 'pdf', rows: TreeRow<C>[], q: string) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [project, setProject] = useState<number | null>(null);
  const [creator, setCreator] = useState<string | null>(null);
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (all ?? []).filter(
      (r) =>
        !words ||
        r.name.toLowerCase().includes(words) ||
        r.creators.some(
          (c) =>
            c.person.name.toLowerCase().includes(words) ||
            c.assignees.some((a) => a.person.name.toLowerCase().includes(words)),
        ),
    );
  }, [all, q]);
  const total = rows.reduce((n, r) => n + r[totalKey], 0);

  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    setBusy(kind);
    try {
      await onExport(kind, rows, q.trim());
    } finally {
      setBusy(null);
    }
  };
  const count = (
    c: TreeCol<C>,
    w: C,
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
          onClose();
          onCount(label, c, { ...params, ...c.params });
        }}
        className={clsx(
          'inline-flex min-w-[2.25rem] justify-center rounded-full px-2 py-0.5 font-heading font-bold tabular-nums transition hover:scale-105 hover:shadow-sm',
          c.bad
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
    w: C,
    label: string,
    params: Record<string, string>,
    strong: boolean,
    py = 'py-2',
  ) =>
    cols.map((c) => (
      <td key={c.key} className={clsx('border-b border-border px-3 text-center', py)}>
        {count(c, w, label, params, strong)}
      </td>
    ));

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
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
                {title} ({total.toLocaleString('en-IN')})
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                {description}
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
              label={searchLabel}
              className="w-60"
            />
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => void exportAs('xlsx')}
              disabled={!!busy || !rows.length}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 font-heading text-button text-text hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <IconExcel size={14} /> {busy === 'xlsx' ? 'Exporting…' : 'Excel'}
            </button>
            <button
              type="button"
              onClick={() => void exportAs('pdf')}
              disabled={!!busy || !rows.length}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 font-heading text-button text-text hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <IconPdf size={14} /> {busy === 'pdf' ? 'Exporting…' : 'PDF'}
            </button>
          </div>
          <div className="flex-1 overflow-auto px-5 py-3">
            {isLoading ? (
              <p className="py-8 text-center text-text-muted">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-text-muted">{empty}</p>
            ) : (
              <div className="nural-table-wrap">
                <table className="nural-table w-full border-separate border-spacing-0 text-table">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="w-1.5 p-0" aria-hidden />
                      <th className="px-3 py-2.5 text-left font-heading text-label font-bold uppercase tracking-wide">
                        Project / creator / assignee
                      </th>
                      {cols.map((c) => (
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
                                          {creatorNote(c.assignees.length)}
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
