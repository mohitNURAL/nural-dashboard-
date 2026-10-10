// QA tab (SRS 4, wireframe in SRS 6): issues filed, what is open, what waits for retest.
import type { IssuePreset } from '@nural/shared';
import { useRef, useState } from 'react';
import { Accordion } from '../../components/Accordion';
import { InfoContext } from '../../components/infoContext';
import { useFilterSummary } from '../filters/useFilters';
import { issueColumns } from '../tasks/columns';
import { TaskList } from '../tasks/TaskList';
import { useQaIssues, useQaParams, useQaSummary } from './api';
import { ISSUE_PRESET_LABELS } from './format';
import { IssueAgeCard, IssuesByAssigneeCard, IssuesByStageCard, ReworkCard } from './IssueCharts';
import { QaTiles } from './QaTiles';
import { RetestCard, TestingCard } from './TeamCards';
import { INFO } from '../info';

type Section = 'latest' | 'all';

/** The "i" of "All issues" follows the tile that narrowed it. */
const ISSUE_LIST_INFO: Record<IssuePreset, string> = {
  all: INFO.allIssues,
  open: INFO.qaOpen,
  resolved: 'Issues in Done or LIVE.',
  lastFiled: INFO.latestFiled,
  rework: INFO.qaRework,
  retest: INFO.retest,
};

const LATEST_COLUMNS = issueColumns();
const ALL_COLUMNS = issueColumns({ full: true });

export function QaTab() {
  const params = useQaParams();
  // Every "i" on this tab adds what the filters cover.
  const showing = useFilterSummary('qa');
  const { data: summary } = useQaSummary();
  const { data: issues } = useQaIssues();
  const [open, setOpen] = useState<Record<Section, boolean>>({ latest: false, all: false });
  // "All issues" follows the last tile clicked (QA-01).
  const [allPreset, setAllPreset] = useState<IssuePreset>('all');
  const refs = { latest: useRef<HTMLElement>(null), all: useRef<HTMLElement>(null) };

  const reveal = (s: Section) => {
    setOpen((prev) => ({ ...prev, [s]: true }));
    requestAnimationFrame(() =>
      refs[s].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  const showAll = (preset: IssuePreset) => {
    setAllPreset(preset);
    reveal('all');
  };
  const onTile = (preset: IssuePreset) =>
    preset === 'lastFiled' ? reveal('latest') : showAll(preset);

  const allCount =
    summary &&
    {
      all: summary.total,
      open: summary.open,
      resolved: summary.resolved,
      lastFiled: summary.lastFiled?.count ?? 0,
      rework: summary.reworkIssues,
      retest: issues?.waitingForRetest.total,
    }[allPreset];

  return (
    <InfoContext.Provider value={showing}>
      <div className="space-y-4">
        <QaTiles active={open.all && allPreset !== 'all' ? allPreset : null} onSelect={onTile} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <IssuesByAssigneeCard className="lg:col-span-6" />
          <IssuesByStageCard className="lg:col-span-6" />
          <TestingCard className="lg:col-span-6" />
          <RetestCard className="lg:col-span-6" onShow={() => showAll('retest')} />
          <IssueAgeCard className="lg:col-span-6" />
          <ReworkCard className="lg:col-span-6" />
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
            defaultSort="-created"
            columns={LATEST_COLUMNS}
          />
        </Accordion>

        <Accordion
          ref={refs.all}
          info={ISSUE_LIST_INFO[allPreset]}
          title={
            allPreset === 'all'
              ? 'All issues (bug and feedback)'
              : `All issues: ${ISSUE_PRESET_LABELS[allPreset]}`
          }
          hint="Row click opens the issue"
          count={allCount}
          open={open.all}
          onOpenChange={(o) => setOpen((p) => ({ ...p, all: o }))}
        >
          {allPreset !== 'all' && (
            <button
              type="button"
              onClick={() => setAllPreset('all')}
              className="mb-3 font-heading text-button text-primary hover:underline"
            >
              Show all issues
            </button>
          )}
          <TaskList
            filterParams={params}
            kind="issues"
            preset={allPreset}
            defaultSort="-created"
            columns={ALL_COLUMNS}
            searchable
          />
        </Accordion>
      </div>
    </InfoContext.Provider>
  );
}
