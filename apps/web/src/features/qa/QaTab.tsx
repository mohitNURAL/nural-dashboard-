// QA tab (SRS 4, wireframe in SRS 6): issues filed, what is open, what waits for retest.
import type { IssuePreset } from '@nural/shared';
import { useEffect, useRef, useState } from 'react';
import { Accordion } from '../../components/Accordion';
import { InfoContext } from '../../components/infoContext';
import { keepInView } from '../../components/keepInView';
import { useFilterSummary, useFilters } from '../filters/useFilters';
import { qaFilterKey, useIssueList, useOpenIssues, type IssueList } from './issueList';
import { issueColumns, taskColumns } from '../tasks/columns';
import { TaskList } from '../tasks/TaskList';
import { useQaIssues, useQaParams, useQaSummary } from './api';
import { ISSUE_PRESET_LABELS } from './format';
import { IssueAgeingCard, IssuesByAssigneeCard, ReworkCard } from './IssueCharts';
import { IssueStageCard } from './IssueStageCard';
import { IssueTrendCard } from './IssueTrendCard';
import { QaTiles } from './QaTiles';
import { RetestByGroupCard } from './RetestByGroupCard';
import { RetestCard, TestingCard } from './TeamCards';
import { INFO } from '../info';

type Section = 'latest' | 'resolved' | 'all';

/** The "i" of "All issues" follows the tile that narrowed it. */
const ISSUE_LIST_INFO: Record<IssuePreset, string> = {
  all: INFO.allIssues,
  open: INFO.qaOpen,
  resolved: 'Issues in QA Backlog, In QA, Done or LIVE.',
  hold: INFO.hold,
  lastFiled: INFO.latestFiled,
  lastResolved: INFO.latestResolved,
  rework: INFO.qaRework,
  retest: INFO.retest,
};

const LATEST_COLUMNS = issueColumns();
const ALL_COLUMNS = issueColumns({ full: true });
const TESTING_COLUMNS = taskColumns({ withCreator: true });
const ALL_TASK_COLUMNS = taskColumns({ withCreator: true });

export function QaTab() {
  const params = useQaParams();
  // Every "i" on this tab adds what the filters cover.
  const showing = useFilterSummary('qa');
  const { data: summary } = useQaSummary();
  const { data: issues } = useQaIssues();
  const [open, setOpen] = useState<Record<Section, boolean>>({
    latest: false,
    resolved: false,
    all: false,
  });
  // "All issues" follows the last tile, tile part (Bug / Feedback) or table number clicked.
  const { list, reveal: revealList, reset, revealed } = useIssueList();
  const openIssues = useOpenIssues();
  const [listTotal, setListTotal] = useState<number>();
  // Testing-workload numbers open the testers' own tasks in this accordion (QA-06).
  const testing = list.kind === 'testing';
  // Retesting awaited lists every task (dev tasks and issues) waiting for QA.
  const everyTask = list.kind === 'all';
  const allPreset: IssuePreset = testing ? 'all' : (list.preset as IssuePreset);
  const listNoun = testing ? 'Testing tasks' : everyTask ? 'Tasks' : 'All issues';
  const allRef = useRef<HTMLElement>(null);
  const refs = {
    latest: useRef<HTMLElement>(null),
    resolved: useRef<HTMLElement>(null),
    all: allRef,
  };

  // A number clicked anywhere on the tab opens and scrolls to "All issues".
  const stopFollow = useRef<() => void>(undefined);
  useEffect(() => {
    if (!revealList) return;
    revealed();
    setOpen((prev) => ({ ...prev, all: true }));
    stopFollow.current?.();
    stopFollow.current = keepInView(allRef);
  }, [revealList, revealed]);
  useEffect(() => () => stopFollow.current?.(), []);

  // Clearing or changing the filters returns "All issues" to its default, unless the new
  // filters are the ones the click itself set.
  const { filters } = useFilters();
  const currentKey = qaFilterKey(filters);
  const lastKey = useRef(currentKey);
  useEffect(() => {
    if (currentKey === lastKey.current) return;
    lastKey.current = currentKey;
    const l = useIssueList.getState().list;
    if (l.filterKey !== currentKey) reset();
  }, [currentKey, reset]);

  const reveal = (s: Section) => {
    setOpen((prev) => ({ ...prev, [s]: true }));
    requestAnimationFrame(() =>
      refs[s].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  const showAll = (preset: IssuePreset, part?: Omit<IssueList, 'preset'>) =>
    openIssues({ preset, ...part });
  const onTile = (preset: IssuePreset) =>
    preset === 'lastFiled'
      ? reveal('latest')
      : preset === 'lastResolved'
        ? reveal('resolved')
        : showAll(preset);

  const allCount = list.params
    ? listTotal
    : summary &&
      {
        all: summary.total,
        open: summary.open,
        resolved: summary.resolved,
        hold: summary.hold,
        lastFiled: summary.lastFiled?.count ?? 0,
        lastResolved: summary.lastResolved?.count ?? 0,
        rework: summary.reworkIssues,
        retest: issues?.waitingForRetest.total,
      }[allPreset];

  return (
    <InfoContext.Provider value={showing}>
      <div className="space-y-4">
        <QaTiles
          active={open.all && allPreset !== 'all' && !list.params ? allPreset : null}
          onSelect={onTile}
          onPart={(preset, label, params) => showAll(preset, { label, params })}
          onRetest={(label, issue) =>
            showAll('retest', {
              kind: 'all',
              label,
              params: issue === undefined ? {} : { issue: String(issue) },
            })
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <IssuesByAssigneeCard className="lg:col-span-6" />
          <ReworkCard className="lg:col-span-6" />
          <TestingCard className="lg:col-span-6" />
          <RetestCard className="lg:col-span-6" onShow={() => showAll('retest')} />
          <RetestByGroupCard className="lg:col-span-12" />
          <IssueTrendCard className="lg:col-span-12" />
          <IssueAgeingCard className="lg:col-span-12" />
          {/* Full width like the Development tab's stage matrix. */}
          <IssueStageCard className="lg:col-span-12" />
        </div>

        <Accordion
          ref={refs.latest}
          title="Latest filed issues"
          info={INFO.latestFiled}
          hint="Filed on the Last filed date, newest first"
          count={summary?.lastFiled?.count}
          open={open.latest}
          onOpenChange={(o) => setOpen((p) => ({ ...p, latest: o }))}
        >
          <TaskList
            filterParams={params}
            kind="issues"
            preset="lastFiled"
            exportName="Latest filed issues"
            defaultSort="-created"
            columns={LATEST_COLUMNS}
          />
        </Accordion>

        <Accordion
          ref={refs.resolved}
          title="Latest resolved issues"
          info={INFO.latestResolved}
          hint="Pushed to QA Backlog on the Last resolved date"
          count={summary?.lastResolved?.count}
          open={open.resolved}
          onOpenChange={(o) => setOpen((p) => ({ ...p, resolved: o }))}
        >
          <TaskList
            filterParams={params}
            kind="issues"
            preset="lastResolved"
            exportName="Latest resolved issues"
            defaultSort="-created"
            columns={LATEST_COLUMNS}
          />
        </Accordion>

        <Accordion
          ref={refs.all}
          info={
            testing ? INFO.testing : everyTask ? INFO.retestAwaited : ISSUE_LIST_INFO[allPreset]
          }
          title={
            list.label
              ? `${listNoun}: ${list.label}`
              : allPreset === 'all'
                ? 'All issues (bug and feedback)'
                : `All issues: ${ISSUE_PRESET_LABELS[allPreset]}`
          }
          hint="Row click opens the issue"
          count={allCount}
          open={open.all}
          onOpenChange={(o) => setOpen((p) => ({ ...p, all: o }))}
        >
          {(allPreset !== 'all' || list.params || testing || everyTask) && (
            <button
              type="button"
              onClick={reset}
              className="mb-3 font-heading text-button text-primary hover:underline"
            >
              Show all issues
            </button>
          )}
          <TaskList
            filterParams={list.params ? { ...params, ...list.params } : params}
            kind={list.kind ?? 'issues'}
            preset={list.preset}
            exportName={
              list.label
                ? `${listNoun} · ${list.label}`
                : allPreset === 'all'
                  ? 'All issues'
                  : `All issues · ${ISSUE_PRESET_LABELS[allPreset]}`
            }
            defaultSort={testing || everyTask ? '-deadline' : '-created'}
            columns={testing ? TESTING_COLUMNS : everyTask ? ALL_TASK_COLUMNS : ALL_COLUMNS}
            searchable
            onTotal={setListTotal}
          />
        </Accordion>
      </div>
    </InfoContext.Provider>
  );
}
