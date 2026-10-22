import { plural } from '../format.js';

// One card per follow-up window; each opens the customer list on its tab.
const CARDS = [
  { key: 'today', label: 'Due Today', bar: '--s500', sub: () => 'Follow-ups due today' },
  { key: 'week', label: 'This Week', bar: '--p500', sub: () => 'Due today to Sunday' },
  { key: 'month', label: 'This Month', bar: '--p400', sub: () => 'Due today to month-end' },
  { key: 'quarter', label: 'This Quarter', bar: '--p600', sub: (s) => `Due by end of ${s.quarterLabel}` },
  { key: 'nextQuarter', label: 'Next Quarter', bar: '--p300', sub: (s) => s.nextQuarterLabel },
];

export default function FollowUpRow({ summary, onOpen }) {
  return (
    <section className="followup-section" aria-label="Follow-ups">
      <div className="section-label">Follow-ups</div>
      <div className="followup-row">
        {CARDS.map((c) => (
          <button key={c.key} type="button" className="kpi drill-kpi" onClick={() => onOpen(c.key)} aria-haspopup="dialog">
            <div className="bar" style={{ background: `var(${c.bar})` }} />
            <div className="kpi-label">{c.label}<span className="kpi-click-hint blue" aria-hidden="true"> ↗</span></div>
            <div className="kpi-value">{summary[c.key]}</div>
            <div className="kpi-delta flat">{plural(summary[c.key], 'customer')} · {c.sub(summary)}</div>
          </button>
        ))}

        {/* Overdue and No Deadline: one card, two separate data points. */}
        <button type="button" className="kpi drill-kpi" onClick={() => onOpen('attention')} aria-haspopup="dialog">
          <div className="bar" style={{ background: 'var(--r500)' }} />
          <div className="kpi-label">Overdue · No Deadline<span className="kpi-click-hint blue" aria-hidden="true"> ↗</span></div>
          <div className="split-values">
            <div>
              <div className={`kpi-value${summary.overdue ? ' text-red' : ''}`}>{summary.overdue}</div>
              <div className={`kpi-delta ${summary.overdue ? 'down' : 'flat'}`}>Overdue</div>
            </div>
            <div className="split-divider" aria-hidden="true" />
            <div>
              <div className="kpi-value">{summary.noDeadline}</div>
              <div className="kpi-delta flat">No deadline</div>
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}
