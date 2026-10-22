import { useState } from 'react';
import { fmtDate, fmtLakh } from '../format.js';

const VISIBLE = 6;

/** FR-9 — open deals with no stage movement past the threshold (from MOVED_TIME). */
export default function DealsAtRisk({ risk }) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? risk.rows : risk.rows.slice(0, VISIBLE);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Deals at Risk</h2>
          <div className="panel-sub">
            {risk.available
              ? `${risk.rows.length} of ${risk.openDeals} open deals with no Kanban stage move in ${risk.atRiskDays}+ days · High above ${risk.highDays} days`
              : 'Stage-entry date unavailable'}
          </div>
        </div>
        {risk.available
          ? <span className="badge badge-live">{risk.rows.length} flagged</span>
          : <span className="badge badge-warn">Not available</span>}
      </div>

      {!risk.available && <div className="empty">Deals at Risk is unavailable: {risk.reason}.</div>}
      {risk.available && risk.rows.length === 0 && <div className="empty">No stalled deals — every open deal moved stage within {risk.atRiskDays} days.</div>}

      {rows.map((d) => (
        <div className="risk-item" key={d.id}>
          <div>
            <div className="risk-name">{d.title}, {fmtLakh(d.value)}</div>
            <div className="risk-meta">In “{d.stage}” since {fmtDate(d.movedAt)} ({d.daysInStage} days) · {d.pipeline} · Owner: {d.owner}</div>
          </div>
          <span className={`risk-tag ${d.severity === 'high' ? 'risk-high' : 'risk-med'}`}>{d.severity === 'high' ? 'High' : 'Watch'}</span>
        </div>
      ))}
      {risk.rows.length > VISIBLE && (
        <button className="link-btn" style={{ marginTop: 10 }} onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show fewer' : `Show all ${risk.rows.length}`}
        </button>
      )}
      {risk.partial && <div className="panel-sub" style={{ marginTop: 10 }}>Some open deals have no MOVED_TIME and are not assessed.</div>}
    </section>
  );
}
