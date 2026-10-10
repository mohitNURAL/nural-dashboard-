// Task drawer (DEV-08, SRS 6): 480 px right panel with the full task, its stage timeline,
// linked bugs and feedback, and "Open in Bitrix24". The open task id lives in the URL.
import { STAGE_COLORS } from '@nural/shared';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { StageMove, TaskRow } from '../api/types';
import { ageingText, bbcodeToText, fmtDate, fmtDateTime } from '../features/dev/format';
import { useOpenTask, useTask } from '../features/tasks/api';
import { Avatar, PriorityBadge, StageChip, TagChips } from './chips';

export function TaskDrawer() {
  const [taskId, setTaskId] = useOpenTask();
  const { data, isLoading, isError, isPlaceholderData } = useTask(taskId);
  const t = data?.task;

  return (
    <Dialog.Root open={taskId !== null} onOpenChange={(o) => !o && void setTaskId(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(12_18_38/0.35)]" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-surface shadow-pop outline-none"
          aria-describedby={undefined}
        >
          <header className="flex items-start gap-3 border-b border-border p-4">
            <div className="min-w-0 flex-1">
              <p className="font-heading text-label uppercase text-text-muted">
                Task {taskId}
                {t?.isIssue && t.issueType && ` · ${t.issueType}`}
              </p>
              <Dialog.Title className="mt-1 font-heading text-h3 text-primary-dark">
                {t?.title ?? (isError ? 'Task not found' : 'Loading…')}
              </Dialog.Title>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-h1 text-text-muted hover:bg-primary-soft-100 hover:text-text"
            >
              ×
            </Dialog.Close>
          </header>

          <div
            className={clsx(
              'flex-1 space-y-5 overflow-y-auto p-4',
              isPlaceholderData && 'opacity-50',
            )}
          >
            {isLoading && <div className="skeleton h-40" />}
            {isError && <p className="text-bad">This task is not in the dashboard’s data.</p>}
            {t && data && (
              <>
                <Facts t={t} />
                {t.tags.length > 0 && <TagChips tags={t.tags} max={20} />}
                <Section title="Description">
                  {data.description ? (
                    <p className="whitespace-pre-wrap break-words text-body">
                      {bbcodeToText(data.description)}
                    </p>
                  ) : (
                    <p className="text-text-muted">
                      No description, or Bitrix24 could not be reached.
                    </p>
                  )}
                </Section>
                <Section title={`Stage history (${data.timeline.length})`}>
                  <Timeline moves={data.timeline} reopens={data.reopens} createdAt={t.createdAt} />
                </Section>
                {data.parent && (
                  <Section title="Parent task">
                    <LinkedList rows={[data.parent]} />
                  </Section>
                )}
                {data.linkedIssues.length > 0 && (
                  <Section title={`Linked bugs and feedback (${data.linkedIssues.length})`}>
                    <LinkedList rows={data.linkedIssues} />
                  </Section>
                )}
                {data.related.length > 0 && (
                  <Section title={`Related tasks (${data.related.length})`}>
                    <LinkedList rows={data.related} />
                  </Section>
                )}
              </>
            )}
          </div>

          {t && (
            <footer className="border-t border-border p-4">
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 w-full items-center justify-center rounded-control bg-primary font-heading text-button uppercase text-white hover:bg-primary-dark"
              >
                Open in Bitrix24
              </a>
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Facts({ t }: { t: TaskRow }) {
  const rows: [string, ReactNode][] = [
    ['Stage', <StageChip key="s" title={t.stageTitle ?? t.stage} color={t.stageColor} />],
    ['Project', t.project?.name ?? '—'],
    ['Assignee', <Person key="a" name={t.assignee.name} />],
    ['Creator', <Person key="c" name={t.creator.name} />],
    ['Priority', <PriorityBadge key="p" priority={t.priority} />],
    [
      'Deadline',
      <span key="d" className={clsx(t.overdue && 'font-bold text-bad')}>
        {fmtDate(t.deadline)}
        {t.ageingDays !== null && ` · ${ageingText(t.ageingDays)}`}
      </span>,
    ],
    ['Created', fmtDate(t.createdAt)],
    ...(t.closedAt ? [['Closed', fmtDate(t.closedAt)] as [string, string]] : []),
    ...(t.isIssue && t.rework
      ? [
          [
            'Rework',
            <span key="r" className="font-bold text-bad">
              {t.rework}
            </span>,
          ] as [string, ReactNode],
        ]
      : []),
  ];
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-heading text-label uppercase text-text-muted">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Person({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} />
      {name}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-heading text-label font-bold uppercase text-primary-dark">
        {title}
      </h3>
      {children}
    </section>
  );
}

const sameMove = (a: StageMove, b: StageMove) => a.at === b.at && a.to === b.to;

function Timeline({
  moves,
  reopens,
  createdAt,
}: {
  moves: StageMove[];
  reopens: StageMove[];
  createdAt: string;
}) {
  const list = [...moves].reverse();
  return (
    <ol className="relative space-y-3 border-l-2 border-primary-soft pl-4">
      {list.map((m, i) => {
        const reopen = reopens.some((r) => sameMove(r, m));
        return (
          <li key={`${m.at}-${i}`} className="relative">
            <span
              className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2 border-surface"
              style={{
                background: reopen
                  ? 'var(--bad)'
                  : ((m.to && STAGE_COLORS[m.to]) ?? 'var(--text-muted)'),
              }}
              aria-hidden
            />
            <p>
              {m.from ?? '—'} → <span className="font-bold">{m.to ?? '—'}</span>
              {reopen && (
                <span className="ml-2 rounded bg-bad-soft px-1.5 font-heading text-label font-bold text-bad-dark">
                  REOPENED
                </span>
              )}
            </p>
            <p className="text-table text-text-muted">
              {fmtDateTime(m.at)}
              {m.by && ` · ${m.by.name}`}
            </p>
          </li>
        );
      })}
      <li className="relative">
        <span
          className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2 border-surface bg-primary-muted"
          aria-hidden
        />
        <p>Created</p>
        <p className="text-table text-text-muted">{fmtDateTime(createdAt)}</p>
      </li>
    </ol>
  );
}

function LinkedList({ rows }: { rows: TaskRow[] }) {
  const [, openTask] = useOpenTask();
  return (
    <ul className="divide-y divide-primary-soft-100 rounded-control border border-border">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => void openTask(r.id)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-primary-soft-100"
          >
            <span className="font-bold text-primary">{r.id}</span>
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            <StageChip title={r.stage} color={r.stageColor} />
          </button>
        </li>
      ))}
    </ul>
  );
}
