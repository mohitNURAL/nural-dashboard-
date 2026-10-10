// QA-01: one row of 4 tiles. Each opens the matching issue list; under each number the Bug and
// Feedback parts (adding up to it) open their own list. No other counts on the tiles.
import type { IssuePreset, QaSummaryPart } from '@nural/shared';
import { StatTile } from '../../components/StatTile';
import { useQaSummary } from './api';
import { lastFiledText } from './format';
import { INFO } from '../info';

interface Props {
  active: IssuePreset | null;
  onSelect: (preset: IssuePreset) => void;
  /** A Bug / Feedback part: opens "All issues" narrowed to it. */
  onPart: (preset: IssuePreset, label: string, params: Record<string, string>) => void;
}

type PartCount = Exclude<keyof QaSummaryPart, 'key'>;
const TYPE_LABEL = { bug: 'Bug', feedback: 'Feedback' } as const;

export function QaTiles({ active, onSelect, onPart }: Props) {
  const { data } = useQaSummary();
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Total issues filed"
        info={INFO.qaTotal}
        value={data?.total}
        sub="Tagged bug or feedback"
        parts={parts('Total', 'total', 'all')}
        active={active === 'all'}
        onClick={() => onSelect('all')}
      />
      <StatTile
        label="Open / waiting"
        info={INFO.qaOpen}
        value={data?.open}
        sub="Not in Done or LIVE"
        parts={parts('Open', 'open', 'open')}
        active={active === 'open'}
        onClick={() => onSelect('open')}
        aside={data && <Ring resolvedPct={data.resolvedPct} />}
      />
      <StatTile
        label="Last filed"
        info={INFO.qaLastFiled}
        value={data && lastFiledText(last ?? null)}
        sub="Latest day an issue was filed"
        parts={parts('Last filed', 'lastFiled', 'all', lastDay)}
        active={active === 'lastFiled'}
        onClick={() => onSelect('lastFiled')}
      />
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
    </div>
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
