// QA-01: one row of 7 tiles. Each opens the matching list; under each number its parts (Bug and
// Feedback, or for Retesting awaited Dev tasks and Issues) add up to it and open their own list.
import type { IssuePreset, QaSummaryPart } from '@nural/shared';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { InHandTile } from '../../components/InHandTile';
import { StatTile } from '../../components/StatTile';
import { useIssueList, useOpenIssues } from './issueList';
import { useQaRetest, useQaSummary } from './api';
import { lastFiledText } from './format';
import { INFO } from '../info';

interface Props {
  active: IssuePreset | null;
  onSelect: (preset: IssuePreset) => void;
  /** A Bug / Feedback part: opens "All issues" narrowed to it. */
  onPart: (preset: IssuePreset, label: string, params: Record<string, string>) => void;
  /** Retesting awaited: every task in QA Backlog or In QA; `issue` narrows to issues or dev tasks. */
  onRetest: (label: string, issue?: boolean) => void;
}

type PartCount = Exclude<keyof QaSummaryPart, 'key'>;
const TYPE_LABEL = { bug: 'Bug', feedback: 'Feedback' } as const;

export function QaTiles({ active, onSelect, onPart, onRetest }: Props) {
  const { data } = useQaSummary();
  const { data: retest } = useQaRetest();
  const openList = useOpenIssues();
  const shown = useIssueList((st) => st.list.label);
  const last = data?.lastFiled;
  /** The Bug | Feedback parts of one tile. */
  const parts = (
    tile: string,
    count: PartCount,
    preset: IssuePreset,
    extra: Record<string, string> = {},
  ) =>
    data?.parts.map((p) => ({
      label: TYPE_LABEL[p.key],
      value: p[count],
      onClick: () => onPart(preset, `${tile} · ${TYPE_LABEL[p.key]}`, { type: p.key, ...extra }),
    }));
  // Last filed parts: that day's issues of each type (created on the Last filed date).
  const lastDay = last
    ? { dateField: 'created', from: last.date, to: last.date }
    : ({} as Record<string, string>);

  return (
    <SortableGroup
      group="qa.tiles"
      noun="tile"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      items={[
        {
          id: 'inHand',
          node: (
            <InHandTile
              counts={data?.inHand}
              info={INFO.qaInHand}
              active={!!shown?.startsWith('Tasks in hand')}
              onOpen={(w, label) =>
                openList({ kind: 'testing', preset: 'pending', label, params: { due: w } })
              }
            />
          ),
        },
        {
          id: 'qaTotal',
          node: (
            <StatTile
              label="Total issues filed"
              info={INFO.qaTotal}
              value={data?.total}
              sub="Tagged bug or feedback"
              parts={parts('Total', 'total', 'all')}
              active={active === 'all'}
              onClick={() => onSelect('all')}
            />
          ),
        },
        {
          id: 'qaOpen',
          node: (
            <StatTile
              label="Open / pending"
              info={INFO.qaOpen}
              value={data?.open}
              sub={
                data
                  ? `Resolved ${data.resolved.toLocaleString('en-IN')} · ${data.resolvedPct}%`
                  : undefined
              }
              parts={parts('Open', 'open', 'open')}
              active={active === 'open'}
              onClick={() => onSelect('open')}
              aside={data && <Ring resolvedPct={data.resolvedPct} />}
            />
          ),
        },
        {
          id: 'hold',
          node: (
            <StatTile
              label="On hold"
              info={INFO.hold}
              value={data?.hold}
              sub="Issues in On Hold"
              parts={parts('On hold', 'hold', 'hold')}
              active={active === 'hold'}
              onClick={() => onSelect('hold')}
            />
          ),
        },
        {
          id: 'qaLastFiled',
          node: (
            <StatTile
              label="Last filed"
              info={INFO.qaLastFiled}
              value={data && lastFiledText(last ?? null)}
              sub="Latest day an issue was filed"
              parts={parts('Last filed', 'lastFiled', 'all', lastDay)}
              active={active === 'lastFiled'}
              onClick={() => onSelect('lastFiled')}
            />
          ),
        },
        {
          id: 'qaLastResolved',
          node: (
            <StatTile
              label="Last resolved"
              info={INFO.qaLastResolved}
              value={data && lastFiledText(data.lastResolved ?? null)}
              sub="Latest day fixes reached QA Backlog"
              parts={parts(
                'Last resolved',
                'lastResolved',
                'lastResolved',
                data?.lastResolved ? { day: data.lastResolved.date } : {},
              )}
              active={active === 'lastResolved'}
              onClick={() => onSelect('lastResolved')}
            />
          ),
        },
        {
          id: 'qaRework',
          node: (
            <StatTile
              label="Rework issues"
              info={INFO.qaRework}
              value={data?.reworkIssues}
              sub="Sent back from QA for a fix"
              parts={parts('Rework', 'rework', 'rework')}
              tone="bad"
              active={active === 'rework'}
              onClick={() => onSelect('rework')}
            />
          ),
        },
        {
          id: 'retestAwaited',
          node: (
            <StatTile
              label="Retesting awaited"
              info={INFO.retestAwaited}
              value={retest?.totals.total}
              sub="In QA Backlog or In QA"
              parts={
                retest && [
                  {
                    label: 'Dev tasks',
                    value: retest.totals.dev,
                    onClick: () => onRetest('Retesting awaited · Dev tasks', false),
                  },
                  {
                    label: 'Issues',
                    value: retest.totals.issues,
                    onClick: () => onRetest('Retesting awaited · Issues', true),
                  },
                ]
              }
              onClick={() => onRetest('Retesting awaited')}
            />
          ),
        },
      ]}
    />
  );
}

/** Resolved % vs open % as a small donut (QA-01 tile 2). */
function Ring({ resolvedPct }: { resolvedPct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--primary-soft)" strokeWidth="6" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke="var(--good)"
        strokeWidth="6"
        strokeDasharray={`${(resolvedPct / 100) * c} ${c}`}
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}
