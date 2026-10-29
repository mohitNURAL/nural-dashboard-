// Header alerts (top bar, right): a bell whose badge counts projects with alerts. It opens a short
// project-wise summary, "Nural Edge: 194 overdue · 376 over 5 days", where each number opens those
// tasks; "See alert details" opens the full Alert details accordion on the Development tab.
import * as Popover from '@radix-ui/react-popover';
import { useMemo, useState } from 'react';
import { days, useAlerts, useOpenAlert, type AlertTarget } from '../features/dev/alerts';
import { useDrillStore } from '../features/dev/drill';
import type { Tab } from '../features/filters/toParams';
import { CountButton } from './CountButton';

interface ProjectAlerts {
  id: number;
  name: string;
  overdue: number;
  stuck: number;
}

export function AlertsBell({ onTab }: { onTab: (t: Tab) => void }) {
  const { data } = useAlerts();
  const openAlert = useOpenAlert();
  const openAlerts = useDrillStore((s) => s.openAlerts);
  const [open, setOpen] = useState(false);

  // One line per project: its overdue tasks and its tasks over N days in a stage.
  const projects = useMemo(() => {
    const map = new Map<number, ProjectAlerts>();
    const add = (id: number, name: string | undefined, key: 'overdue' | 'stuck', n: number) => {
      const p = map.get(id) ?? { id, name: name ?? 'No project', overdue: 0, stuck: 0 };
      p[key] += n;
      map.set(id, p);
    };
    for (const a of data?.overdue ?? []) add(a.projectId, a.project?.name, 'overdue', a.count);
    for (const a of data?.stuck ?? []) add(a.projectId, a.project?.name, 'stuck', a.count);
    return [...map.values()].sort((a, b) => b.overdue - a.overdue || b.stuck - a.stuck);
  }, [data]);

  const stuckDays = data?.stuckDays ?? 5;
  const go = (t: AlertTarget) => {
    setOpen(false);
    onTab('dev');
    openAlert(t);
  };
  const projectTarget = (p: ProjectAlerts, kind: 'overdue' | 'stuck'): AlertTarget => ({
    label: `${p.name} · ${kind === 'overdue' ? 'overdue' : `over ${days(stuckDays)} in a stage`}`,
    preset: kind === 'overdue' ? 'overdue' : 'total',
    params: {
      scope: 'all',
      project: String(p.id),
      ...(kind === 'stuck' ? { stuck: 'true' } : {}),
    },
    projectId: p.id,
    assigneeId: null,
  });

  const label = `Alerts: ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        title={label}
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
        {projects.length > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-bad px-1 text-center font-heading text-[10px] font-bold leading-[18px] text-white">
            {projects.length > 99 ? '99+' : projects.length}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          // Returning focus to the bell would scroll the page away from the opened list.
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-50 flex max-h-[70vh] w-[380px] max-w-[calc(100vw-32px)] flex-col rounded-card border border-border bg-surface text-text shadow-pop"
        >
          <header className="border-b border-border px-3 py-2.5">
            <h2 className="font-heading text-h3 text-primary-dark">Alerts by project</h2>
          </header>
          <ul className="flex-1 divide-y divide-primary-soft-100 overflow-y-auto">
            {!data && <li className="skeleton m-3 h-20" />}
            {data && projects.length === 0 && (
              <li className="px-3 py-6 text-center text-text-muted">Nothing to flag.</li>
            )}
            {projects.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-bold text-primary-dark">
                  {p.name}
                </span>
                <span className="shrink-0 whitespace-nowrap text-table">
                  <CountButton
                    n={p.overdue}
                    tone="bad"
                    title={`Open ${p.name}: overdue`}
                    onClick={() => go(projectTarget(p, 'overdue'))}
                  />{' '}
                  <span className="text-text-muted">overdue</span>
                  <span className="mx-1.5 text-border">·</span>
                  <CountButton
                    n={p.stuck}
                    title={`Open ${p.name}: over ${days(stuckDays)} in a stage`}
                    onClick={() => go(projectTarget(p, 'stuck'))}
                  />{' '}
                  <span className="text-text-muted">over {stuckDays} days</span>
                </span>
              </li>
            ))}
          </ul>
          <footer className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onTab('dev');
                openAlerts();
              }}
              className="btn btn-link"
            >
              See alert details (by person and stage) →
            </button>
          </footer>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
