import { Fragment } from 'react';
import { STAGE_COLORS } from './FunnelBar.jsx';
import { fmtLakh } from '../format.js';

function StageMix({ mix }) {
  const total = mix.reduce((s, m) => s + m.count, 0);
  if (!total) return <span className="panel-sub">No deals in this period</span>;
  const title = mix.map((m) => `${m.label}: ${m.count}`).join(' · ');
  return (
    <div className="stagebar-wrap" role="img" aria-label={title} title={title}>
      {mix.map((m) => <div key={m.key} style={{ width: `${(m.count / total) * 100}%`, background: `var(${(STAGE_COLORS[m.key] ?? STAGE_COLORS.unmapped)[0]})` }} />)}
    </div>
  );
}

function Cells({ row, onOpen }) {
  return (
    <>
      <td className="num">
        {row.openDeals > 0
          ? <button className="drill-num" onClick={onOpen} aria-haspopup="dialog" title="Show these deals">{row.openDeals}</button>
          : row.openDeals}
      </td>
      <td className="num">{fmtLakh(row.openValue)}</td>
      <td className="num">{fmtLakh(row.lostValue)}</td>
      <td><StageMix mix={row.stageMix} /></td>
    </>
  );
}

/** FR-6 — flagship buckets with Sales variants nested; no internal scroll. */
export default function PipelineBreakdown({ breakdown, onSelect }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Pipeline Breakdown</h2>
          <div className="panel-sub">Flagship buckets with Sales variants nested — open deals as on the Kanban board; lost value and won/lost mix for the selected period</div>
        </div>
        <span className="badge badge-live">Live totals</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Product / Pipeline</th><th className="num">Open Deals</th><th className="num">Open Value</th><th className="num">Lost Value</th><th>Stage Mix</th></tr>
          </thead>
          <tbody>
            {breakdown.rows.map((r) => (
              <Fragment key={r.family}>
                <tr className="flagship"><td>{r.label}</td><Cells row={r} onOpen={() => onSelect({ family: r.family, label: r.label })} /></tr>
                {r.variants.map((v) => (
                  <tr className="variant" key={v.categoryId}><td>↳ {v.label}</td><Cells row={v} onOpen={() => onSelect({ family: r.family, categoryId: v.categoryId, label: v.label })} /></tr>
                ))}
              </Fragment>
            ))}
            {breakdown.total && (
              <tr className="total">
                <td>{breakdown.total.label}</td>
                <td className="num">{breakdown.total.openDeals}</td>
                <td className="num">{fmtLakh(breakdown.total.openValue)}</td>
                <td className="num">{fmtLakh(breakdown.total.lostValue)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="panel-sub" style={{ marginTop: 10 }}>
        Nural Sales, Nural Service and Nural Assets are the flagship buckets. Every pipeline whose name starts with “Nural Sales” rolls up into the
        Nural Sales total automatically. “Nural Custom” catches everything outside those three — including bespoke/custom development and untagged
        deals — so nothing silently falls outside reporting.
      </div>
    </section>
  );
}
