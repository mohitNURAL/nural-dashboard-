// QA-01: one row of 4 tiles. Each opens the matching issue list.
import type { IssuePreset } from '@nural/shared';
import { StatTile } from '../../components/StatTile';
import { useQaSummary } from './api';
import { lastFiledText } from './format';

interface Props {
  active: IssuePreset | null;
  onSelect: (preset: IssuePreset) => void;
}

export function QaTiles({ active, onSelect }: Props) {
  const { data } = useQaSummary();
  const last = data?.lastFiled;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Total issues filed"
        value={data?.total}
        sub="Tagged bug or feedback"
        active={active === 'all'}
        onClick={() => onSelect('all')}
      />
      <StatTile
        label="Open / waiting"
        value={data?.open}
        sub={data && `${data.resolvedPct}% resolved · ${data.openPct}% open`}
        active={active === 'open'}
        onClick={() => onSelect('open')}
        aside={data && <Ring resolvedPct={data.resolvedPct} />}
      />
      <StatTile
        label="Last filed"
        value={data && lastFiledText(last ?? null)}
        sub={last ? `${last.count} ${last.count === 1 ? 'issue' : 'issues'} that day` : undefined}
        active={active === 'lastFiled'}
        onClick={() => onSelect('lastFiled')}
      />
      <StatTile
        label="Rework issues"
        value={data?.reworkIssues}
        sub={
          data &&
          `${data.reworkPct}% of issues · ${data.reworkTotal} ${data.reworkTotal === 1 ? 'reopen' : 'reopens'}`
        }
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
