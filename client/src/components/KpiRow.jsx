import { fmtLakh, fmtPct, plural } from '../format.js';

const PERIOD_SHORT = { quarter: 'QTD', month: 'MTD', custom: 'range' };

function Kpi({ label, value, delta, tone = 'flat', bar, onClick }) {
  const body = (
    <>
      <div className="bar" style={{ background: `var(${bar})` }} />
      <div className="kpi-label">{label}{onClick && <span className="kpi-click-hint blue" aria-hidden="true"> ↗</span>}</div>
      <div className="kpi-value">{value}</div>
      <div className={`kpi-delta ${tone}`}>{delta}</div>
    </>
  );
  return onClick
    ? <button type="button" className="kpi drill-kpi" onClick={onClick} aria-haspopup="dialog">{body}</button>
    : <div className="kpi">{body}</div>;
}

/** FR-2 — the nine KPI tiles; Error List opens the FR-7 worklist. */
export default function KpiRow({ kpis: k, filters, onMissingClick, onDrill }) {
  const scoped = filters.pipeline !== 'all';
  return (
    <section className="kpi-row" aria-label="Key metrics">
      <Kpi bar="--p700" label="Open Deals" value={k.openDeals} onClick={() => onDrill('open-deals')} delta={scoped ? `In open stages · ${filters.pipelineLabel}` : 'All deals in open Kanban stages'} />
      <Kpi bar="--p500" label="Open Pipeline Value" value={fmtLakh(k.openPipelineValue)} delta={plural(k.openDeals, 'open deal')} />
      <Kpi bar="--p400" label="Weighted Forecast" value={fmtLakh(k.weightedForecast)} delta="Prob-weighted by stage" tone="up" />
      <Kpi bar="--r500" label="Win Rate" value={k.winRate == null ? '—' : fmtPct(k.winRate)}
        delta={`${k.won} won / ${k.lost} lost this period`} tone={k.winRate == null ? 'flat' : k.winRate >= 0.5 ? 'up' : 'down'} />
      <Kpi bar="--s500" label="Avg Deal Size" value={k.avgDealSize ? fmtLakh(k.avgDealSize) : '—'} delta={`Across ${plural(k.valuedDeals, 'valued deal')}`} />
      <Kpi bar="--p600" label="Deals at Risk" value={k.dealsAtRisk} onClick={() => onDrill('at-risk')} delta={`No stage move in >${k.atRiskDays} days`} tone={k.dealsAtRisk ? 'down' : 'flat'} />
      <Kpi bar="--p300" label={`New Leads (${PERIOD_SHORT[filters.period]})`} value={k.newLeads} delta={`Created ${filters.periodLabel.startsWith('This') ? filters.periodLabel.toLowerCase() : 'in range'}`} tone="up" />
      <Kpi bar="--p400" label="Total Leads" value={k.totalLeads} delta={scoped ? `Open leads in ${filters.pipelineLabel}` : 'Open leads — excludes converted'} />
      <button type="button" className="kpi" onClick={onMissingClick} aria-haspopup="dialog">
        <div className="bar" style={{ background: 'var(--r500)' }} />
        <div className="kpi-label">Error List <span className="kpi-click-hint" aria-hidden="true">↗</span></div>
        <div className="kpi-value">{k.missingValue}</div>
        <div className={`kpi-delta ${k.missingValue ? 'down' : 'flat'}`}>
          {k.missingValue
            ? `${k.errorsNoValue} no value · ${k.errorsNoCustomer} no customer name — click to fix`
            : 'No missing values or customer names'}
        </div>
      </button>
    </section>
  );
}
