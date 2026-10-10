// Alert details (bottom of the Development tab, opened by the header bell): the overdue and
// "over N days in a stage" alerts as a table, grouped project-wise or assignee-wise, with a stage
// filter on the stage view. Every count opens its exact tasks; each line links to Bitrix24.
import { STAGE_COLORS, type StageTitle } from '@nural/shared';
import clsx from 'clsx';
import { useMemo, useState, type ReactNode } from 'react';
import type { GroupBy } from '../../api/types';
import { GroupToggle, ViewToggle } from '../../components/Card';
import { CountButton } from '../../components/CountButton';
import { SearchCombobox } from '../../components/SearchCombobox';
import {
  days,
  overdueTarget,
  stuckTarget,
  useAlerts,
  useOpenAlert,
  type AlertTarget,
  type OverdueLine,
  type StuckLine,
} from './alerts';

type Kind = 'overdue' | 'stuck';
type Line = OverdueLine | StuckLine;

const ROLE_NOTE = { assignee: '', tester: ' (tester)', qaLead: ' (QA lead)' } as const;

interface Group {
  id: number;
  name: string;
  total: number;
  lines: Line[];
  target: AlertTarget;
}

export function AlertDetails() {
  const { data, isLoading } = useAlerts();
  const openAlert = useOpenAlert();
  const [kind, setKind] = useState<Kind>('overdue');
  const [by, setBy] = useState<GroupBy>('project');
  const [stages, setStages] = useState<string[]>([]);
  // Groups start collapsed; a new view (kind, grouping or stage filter) collapses them again.
  const viewKey = `${kind}|${by}|${stages.join(',')}`;
  const [expanded, setExpanded] = useState<{ view: string; ids: Set<number> }>({
    view: viewKey,
    ids: new Set(),
  });
  const openIds = expanded.view === viewKey ? expanded.ids : new Set<number>();
  const toggleGroup = (id: number) => {
    const ids = new Set(openIds);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setExpanded({ view: viewKey, ids });
  };
  const setAll = (open: boolean, groupIds: number[]) =>
    setExpanded({ view: viewKey, ids: new Set(open ? groupIds : []) });

  const stuckDays = data?.stuckDays ?? 5;
  const stageOptions = useMemo(() => {
    const counts = new Map<StageTitle, number>();
    for (const l of data?.stuck ?? []) counts.set(l.stage, (counts.get(l.stage) ?? 0) + l.count);
    return [...counts].map(([value, count]) => ({ value, label: value, count }));
  }, [data]);

  const groups = useMemo<Group[]>(() => {
    if (!data) return [];
    const lines: Line[] =
      kind === 'overdue'
        ? data.overdue
        : data.stuck.filter((l) => !stages.length || stages.includes(l.stage));
    const stageParam: Record<string, string> =
      kind === 'stuck' && stages.length ? { stage: stages.join(',') } : {};
    const map = new Map<number, Group>();
    for (const l of lines) {
      const id = by === 'project' ? l.projectId : l.personId;
      const name = by === 'project' ? (l.project?.name ?? 'No project') : l.person.name;
      let g = map.get(id);
      if (!g) {
        const what =
          kind === 'overdue'
            ? 'overdue'
            : `${stages.length === 1 ? stages[0] : 'any stage'} over ${days(stuckDays)}`;
        g = {
          id,
          name,
          total: 0,
          lines: [],
          target: {
            label: `${name} · ${what}`,
            preset: kind === 'overdue' ? 'overdue' : 'total',
            params: {
              scope: 'all',
              ...(by === 'project'
                ? { project: String(id) }
                : kind === 'overdue'
                  ? { assignee: String(id) }
                  : { owner: String(id) }),
              ...(kind === 'stuck' ? { stuck: 'true', ...stageParam } : {}),
            },
            projectId: by === 'project' ? id : null,
            assigneeId: by === 'assignee' ? id : null,
          },
        };
        map.set(id, g);
      }
      g.total += l.count;
      g.lines.push(l);
    }
    const list = [...map.values()].sort((a, b) => b.total - a.total);
    // A person named as tester or QA lead is not the assignee: keep the filter bar to projects.
    for (const g of list) {
      if (by === 'assignee' && g.lines.some((l) => l.role !== 'assignee')) {
        g.target.assigneeId = null;
      }
    }
    return list;
  }, [data, kind, by, stages, stuckDays]);

  const lineTotal = groups.reduce((n, g) => n + g.total, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewToggle
          value={kind}
          onChange={setKind}
          options={[
            { value: 'overdue', label: `Overdue (${data?.overdue.length ?? '…'})` },
            {
              value: 'stuck',
              label: `Over ${days(stuckDays)} in a stage (${data?.stuck.length ?? '…'})`,
            },
          ]}
        />
        <GroupToggle value={by} onChange={setBy} />
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setAll(
                openIds.size < groups.length,
                groups.map((g) => g.id),
              )
            }
            className="font-heading text-button text-primary hover:underline"
          >
            {openIds.size < groups.length ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {kind === 'stuck' && (
          <SearchCombobox
            label={stages.length ? 'Stage' : 'Stage: all'}
            className="h-8 w-60"
            options={stageOptions}
            selected={stages}
            onChange={setStages}
          />
        )}
        <span className="ml-auto text-table text-text-muted">
          {kind === 'overdue'
            ? 'Pending tasks past their deadline.'
            : `More than ${days(stuckDays)} in one stage (LIVE aside); QA Backlog and In QA name the tester or the QA lead.`}{' '}
          Development department; the filter bar does not apply.
        </span>
      </div>

      {isLoading && <div className="skeleton h-40" />}
      {data && groups.length === 0 && (
        <p className="py-6 text-center text-text-muted">Nothing to flag.</p>
      )}
      {groups.length > 0 && (
        <div className="max-h-[600px] overflow-auto rounded-control border border-border">
          <table className="w-full border-separate border-spacing-0 text-table">
            <thead>
              <tr className="font-heading text-label font-bold uppercase text-text-muted">
                <Th>{by === 'project' ? 'Project / assignee' : 'Assignee / project'}</Th>
                {kind === 'stuck' && <Th>Stage</Th>}
                <Th right>{kind === 'overdue' ? 'Overdue' : `Over ${days(stuckDays)}`}</Th>
                <Th right>{kind === 'overdue' ? 'Most overdue' : 'Longest'}</Th>
                {kind === 'stuck' && <Th right>In stage in Bitrix24</Th>}
                <Th right>Bitrix24</Th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.id}>
                <tr className="bg-primary-soft-100">
                  <td colSpan={kind === 'stuck' ? 2 : 1} className="border-b border-border p-0">
                    <button
                      type="button"
                      aria-expanded={openIds.has(g.id)}
                      onClick={() => toggleGroup(g.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left font-heading font-bold text-primary-dark hover:bg-primary-soft"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        aria-hidden
                        className={clsx(
                          'shrink-0 transition-transform',
                          openIds.has(g.id) && 'rotate-90',
                        )}
                      >
                        <path
                          d="M4.5 2.5 8 6l-3.5 3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                      </svg>
                      {g.name}
                      <span className="font-normal text-text-muted">
                        {g.lines.length} {g.lines.length === 1 ? 'line' : 'lines'}
                      </span>
                    </button>
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right font-bold">
                    <CountButton
                      n={g.total}
                      tone={kind === 'overdue' ? 'bad' : undefined}
                      title={`Open: ${g.target.label}`}
                      onClick={() => openAlert(g.target)}
                    />
                  </td>
                  <td colSpan={kind === 'stuck' ? 3 : 2} className="border-b border-border" />
                </tr>
                {openIds.has(g.id) &&
                  g.lines.map((l) => (
                    <LineRow
                      key={`${l.personId}-${l.projectId}-${'stage' in l ? l.stage : ''}`}
                      line={l}
                      by={by}
                      stuckDays={stuckDays}
                      onOpen={openAlert}
                    />
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      {groups.length > 0 && (
        <p className="text-table text-text-muted">
          {lineTotal.toLocaleString('en-IN')} tasks in {groups.length}{' '}
          {by === 'project' ? 'projects' : 'people'}. Click a count to open those tasks above; the
          Bitrix24 button opens the project board with the filter set.
          {kind === 'stuck' &&
            ' Bitrix24 cannot filter by days in a stage, so its board lists the whole stage.'}
        </p>
      )}
    </div>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      className={clsx(
        'sticky top-0 z-10 border-b border-border bg-surface px-3 py-2',
        right ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function LineRow({
  line,
  by,
  stuckDays,
  onOpen,
}: {
  line: Line;
  by: GroupBy;
  stuckDays: number;
  onOpen: (t: AlertTarget) => void;
}) {
  const stuck = 'stage' in line;
  const target = stuck ? stuckTarget(line, stuckDays) : overdueTarget(line as OverdueLine);
  // The row names whatever the group is not: the person under a project, the project under a person.
  const other =
    by === 'project'
      ? `${line.person.name}${ROLE_NOTE[line.role]}`
      : (line.project?.name ?? 'No project');
  return (
    <tr className="hover:bg-primary-soft-100">
      <td className="border-b border-primary-soft-100 py-1.5 pl-7 pr-3">{other}</td>
      {stuck && (
        <td className="border-b border-primary-soft-100 px-3 py-1.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: STAGE_COLORS[line.stage] }}
              aria-hidden
            />
            {line.stage}
          </span>
        </td>
      )}
      <td className="border-b border-primary-soft-100 px-3 py-1.5 text-right">
        <CountButton
          n={line.count}
          tone={stuck ? undefined : 'bad'}
          title={`Open: ${target.label}`}
          onClick={() => onOpen(target)}
        />
      </td>
      <td className="whitespace-nowrap border-b border-primary-soft-100 px-3 py-1.5 text-right">
        {days(line.oldestDays)}
      </td>
      {stuck && (
        <td className="border-b border-primary-soft-100 px-3 py-1.5 text-right text-text-muted">
          {line.boardCount}
        </td>
      )}
      <td className="border-b border-primary-soft-100 px-3 py-1.5 text-right">
        {line.boardUrl && (
          <a
            href={line.boardUrl}
            target="_blank"
            rel="noreferrer"
            title={
              stuck && line.boardCount > line.count
                ? `Bitrix24 lists all ${line.boardCount} in this stage; ${line.count} have been there over ${days(stuckDays)}`
                : 'Open the project board in Bitrix24, filtered to this line'
            }
            className="inline-flex items-center gap-1 rounded-control border border-border bg-surface px-2 py-0.5 font-heading text-label font-bold text-primary hover:border-primary"
          >
            Open ↗
          </a>
        )}
      </td>
    </tr>
  );
}
