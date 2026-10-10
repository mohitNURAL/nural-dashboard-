// Header alerts (top bar, right): overdue tasks per assignee and project, and tasks more than
// N days in a stage other than LIVE. Work waiting in QA Backlog or In QA names the tester who
// filed it, or the QA lead. Clicking an alert opens those tasks on the Development tab; its
// Bitrix24 link opens the project's board there, where the work is fixed (the alert then clears
// on the next sync; the dashboard itself never writes to Bitrix24).
import { STAGE_COLORS } from '@nural/shared';
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { useState } from 'react';
import { useApi } from '../api/queries';
import type { AlertRole, AlertsResponse } from '../api/types';
import { useDrill, type Drill } from '../features/dev/drill';
import { EMPTY_FILTERS, type Tab } from '../features/filters/toParams';
import { useDevScope, useFilters } from '../features/filters/useFilters';
import { ViewToggle } from './Card';

const ROLE_NOTE: Record<AlertRole, string | null> = {
  assignee: null,
  tester: 'tester',
  qaLead: 'QA lead',
};

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

export function AlertsBell({ onTab }: { onTab: (t: Tab) => void }) {
  const { data } = useApi<AlertsResponse>('/api/alerts', {});
  const drill = useDrill();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<'overdue' | 'stuck'>('overdue');
  const total = data?.total ?? 0;

  const { setFilters } = useFilters();
  const [, setScope] = useDevScope();

  /**
   * Go to the alert: the filter bar is set to its project (and assignee, when the alert names
   * the assignee), the switch to All, and "All tasks" opens with exactly the alert's tasks.
   */
  const go = (d: Drill, projectId: number, assigneeId: number | null) => {
    setOpen(false);
    onTab('dev');
    setScope('all');
    setFilters({
      ...EMPTY_FILTERS,
      project: projectId ? [projectId] : [],
      assignee: assigneeId ? [assigneeId] : [],
    });
    drill({ ...d, replaceFilters: true });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Alerts${total ? `: ${total}` : ''}`}
        className="relative grid h-8 w-8 place-items-center rounded-full text-white hover:bg-primary"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.5A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        {total > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-bad px-1 text-center font-heading text-[10px] font-bold leading-[18px] text-white">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          // Returning focus to the bell would scroll the page back to the top, away from the
          // task list an alert just opened.
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-50 flex max-h-[75vh] w-[440px] max-w-[calc(100vw-32px)] flex-col rounded-card border border-border bg-surface text-text shadow-pop"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border p-3">
            <h2 className="font-heading text-h3 text-primary-dark">Alerts</h2>
            {data && (
              <ViewToggle
                value={list}
                onChange={setList}
                options={[
                  { value: 'overdue', label: `Overdue (${data.overdue.length})` },
                  {
                    value: 'stuck',
                    label: `Over ${data.stuckDays} days in a stage (${data.stuck.length})`,
                  },
                ]}
              />
            )}
          </header>
          <p className="px-3 pt-2 text-table text-text-muted">
            {list === 'overdue'
              ? 'Pending tasks past their deadline, by assignee and project.'
              : `Tasks in one stage for more than ${data ? days(data.stuckDays) : '…'} (LIVE aside). QA Backlog and In QA name the tester, or the QA lead.`}{' '}
            Development department; the filter bar does not apply.
          </p>
          <ul className="flex-1 overflow-y-auto p-2">
            {!data && <li className="skeleton m-2 h-24" />}
            {data && list === 'overdue' && data.overdue.length === 0 && <Empty />}
            {data && list === 'stuck' && data.stuck.length === 0 && <Empty />}
            {data &&
              list === 'overdue' &&
              data.overdue.map((a) => (
                <AlertRow
                  key={`${a.personId}-${a.projectId}`}
                  name={a.person.name}
                  project={a.project?.name}
                  count={a.count}
                  what="overdue"
                  detail={`most overdue ${days(a.oldestDays)}`}
                  boardUrl={a.boardUrl}
                  onClick={() =>
                    go(
                      {
                        label: `${a.person.name} · ${a.project?.name ?? 'No project'} · overdue`,
                        preset: 'overdue',
                        params: {
                          scope: 'all',
                          assignee: String(a.personId),
                          project: String(a.projectId),
                        },
                      },
                      a.projectId,
                      a.personId,
                    )
                  }
                />
              ))}
            {data &&
              list === 'stuck' &&
              data.stuck.map((a) => (
                <AlertRow
                  key={`${a.personId}-${a.projectId}-${a.stage}`}
                  name={a.person.name}
                  role={ROLE_NOTE[a.role]}
                  project={a.project?.name}
                  count={a.count}
                  what={a.stage}
                  stageColor={STAGE_COLORS[a.stage]}
                  detail={`longest ${days(a.oldestDays)} in ${a.stage}`}
                  boardUrl={a.boardUrl}
                  onClick={() =>
                    go(
                      {
                        label: `${a.person.name} · ${a.project?.name ?? 'No project'} · ${a.stage} over ${days(data.stuckDays)}`,
                        preset: 'total',
                        params: {
                          scope: 'all',
                          owner: String(a.personId),
                          project: String(a.projectId),
                          stage: a.stage,
                          stuck: 'true',
                        },
                      },
                      a.projectId,
                      a.role === 'assignee' ? a.personId : null,
                    )
                  }
                />
              ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AlertRow({
  name,
  role,
  project,
  count,
  what,
  stageColor,
  detail,
  boardUrl,
  onClick,
}: {
  name: string;
  role?: string | null;
  project: string | undefined;
  count: number;
  what: string;
  stageColor?: string;
  detail: string;
  boardUrl: string | null;
  onClick: () => void;
}) {
  return (
    <li className="flex items-start gap-1 rounded-control hover:bg-primary-soft-100">
      <button
        type="button"
        onClick={onClick}
        title="Show these tasks on the Development tab"
        className="flex min-w-0 flex-1 items-start gap-3 rounded-control px-2 py-2 text-left"
      >
        <span
          className={clsx(
            'mt-0.5 min-w-[2rem] rounded-full px-1.5 text-center font-heading text-label font-bold leading-5',
            stageColor ? 'bg-primary-soft text-primary-dark' : 'bg-bad text-white',
          )}
        >
          {count}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <span className="font-bold text-primary-dark">{name}</span>
            {role && <span className="text-text-muted"> ({role})</span>}
            <span className="text-text-muted"> · {project ?? 'No project'}</span>
          </span>
          <span className="flex items-center gap-1.5 text-table text-text-muted">
            {stageColor && (
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: stageColor }}
                aria-hidden
              />
            )}
            <span className={clsx(!stageColor && 'font-bold text-bad')}>{what}</span>
            <span>· {detail}</span>
          </span>
        </span>
      </button>
      {boardUrl && (
        <a
          href={boardUrl}
          target="_blank"
          rel="noreferrer"
          title={`Open the ${project ?? ''} task board in Bitrix24 to clear this`}
          className="mr-1 mt-2 inline-flex shrink-0 items-center gap-1 rounded-control border border-border bg-surface px-2 py-1 font-heading text-label font-bold text-primary hover:border-primary"
        >
          Bitrix24
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path
              d="M4 1h5v5M9 1 4.5 5.5M7 6.5V9H1V3h2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
        </a>
      )}
    </li>
  );
}

function Empty() {
  return <li className="px-2 py-6 text-center text-text-muted">Nothing to flag.</li>;
}
