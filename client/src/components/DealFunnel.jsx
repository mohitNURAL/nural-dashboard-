import FunnelBar from './FunnelBar.jsx';
import { fmtPct } from '../format.js';

/** FR-4 — Deal Stage Funnel, combined across all pipelines. */
export default function DealFunnel({ funnel, onSelect }) {
  const max = Math.max(0, ...funnel.stages.map((s) => s.count), funnel.lost.count, funnel.unmapped);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Deal Stage Funnel</h2>
          <div className="panel-sub">All {funnel.pipelines} pipelines combined</div>
        </div>
        <span className="badge badge-live">Live totals</span>
      </div>
      {funnel.stages.map((s) => <FunnelBar key={s.key} stageKey={s.key} label={s.label} count={s.count} max={max} aside={fmtPct(s.conversion)} onClick={() => onSelect(s)} />)}
      <FunnelBar stageKey="lost" label={funnel.lost.label} count={funnel.lost.count} max={max} aside="—" onClick={() => onSelect(funnel.lost)} />
      {funnel.unmapped > 0 && <FunnelBar stageKey="unmapped" label="Unmapped" count={funnel.unmapped} max={max} aside="—" onClick={() => onSelect({ key: 'unmapped', label: 'Unmapped' })} />}
      <div className="panel-sub" style={{ marginTop: 6 }}>
        Open stages show every deal currently in that Kanban column; Closed Won / Lost show deals closed in the selected period. Percentages
        are stage-to-stage conversion: the share of deals that reached the previous stage and went on to reach this one (lost deals excluded).
        Combined across pipelines — not affected by the Pipeline filter.
      </div>
    </section>
  );
}
