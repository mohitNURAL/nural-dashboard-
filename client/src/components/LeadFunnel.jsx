import FunnelBar from './FunnelBar.jsx';
import { fmtPct } from '../format.js';

/** FR-3 — Lead Funnel, current CRM stages (combined across pipelines). */
export default function LeadFunnel({ funnel, onSelect }) {
  const maxOf = (rows) => Math.max(0, ...rows.map((r) => r.count));
  const fwdMax = maxOf(funnel.forward);
  const dqMax = maxOf([...funnel.disqualified, ...funnel.unmapped]);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Lead Funnel — Current CRM Stages</h2>
          <div className="panel-sub">Current qualified-lead stage distribution after excluding Unassigned and Junk Lead</div>
        </div>
        <span className="badge badge-live">{funnel.total} relevant leads</span>
      </div>
      {funnel.forward.map((s) => <FunnelBar key={s.key} stageKey={s.key} label={s.label} count={s.count} max={fwdMax} aside={fmtPct(s.share)} onClick={() => onSelect(s)} />)}
      <div className="divider" />
      <div className="panel-sub" style={{ marginBottom: 8 }}>Disqualified / nurture — not part of the forward funnel</div>
      {funnel.disqualified.map((s) => <FunnelBar key={s.key} stageKey={s.key} label={s.label} count={s.count} max={dqMax} aside={fmtPct(s.share)} onClick={() => onSelect(s)} />)}
      {funnel.unmapped.map((s) => <FunnelBar key={s.key} stageKey="unmapped" label={s.label} count={s.count} max={dqMax} aside={fmtPct(s.share)} onClick={() => onSelect(s)} />)}
      <div className="stage-note">
        All displayed leads are already qualified. Unassigned and Junk Lead are excluded. “Lead Completed” is shown as “Converted to Deal”.
        Percentages are each stage's share of the displayed leads, not stage-to-stage conversion rates. Counts match the lead Kanban board:
        every lead currently in each status, combined across pipelines (not affected by the Period or Pipeline filters).
        {funnel.unmapped.length > 0 && ' Unmapped statuses need adding to the lead-status mapping config.'}
      </div>
    </section>
  );
}
