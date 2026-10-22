// Every dashboard number, computed server-side from the normalized model
// (SRS §6, §7 Scalability: only aggregates leave the backend).
//
// Kanban basis — every stage-based number mirrors the Bitrix24 Kanban board:
//   - Open stages (semantic P) count every deal/lead currently in that
//     column, regardless of when it was created — exactly what the board shows.
//     Open Deals/Value/Forecast/Avg size, Deals at Risk, Missing Value, Total
//     Leads, the open bars of both funnels and the breakdown use this.
//   - Closed Won / Closed Lost columns only count deals closed (CLOSEDATE) in
//     the selected period, otherwise they would grow forever.
//   - Period-only metrics: Win Rate, Won vs Lost Trend (CLOSEDATE), New Leads
//     and Lead Source Performance (DATE_CREATE).
// Pipeline scope (FR-1.2): everything except the two funnels and Lead Source
// Performance, so a KPI tile and its detail panel always agree.

import { inRange } from './period.js';
import { suggestCustomer } from '../customerMatch.js';
import { computeFollowUpSummary } from './followUps.js';

const DAY = 86_400_000;
const PIPELINE_KEYS = ['all', 'sales', 'service', 'assets', 'custom'];

export function assertPipeline(pipeline) {
  if (!PIPELINE_KEYS.includes(pipeline)) throw new RangeError(`Unknown pipeline "${pipeline}"`);
}

const inPipeline = (pipeline) => (r) => pipeline === 'all' || r.family === pipeline;
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const pct = (n, d) => (d > 0 ? n / d : null);
/** Deals on the Kanban board for this view: all open ones + those closed in the period. */
const onBoard = (period) => (d) => d.semantic === 'P' || inRange(d.closedAt, period);

export function pipelineLabel(mapping, pipeline) {
  return pipeline === 'all' ? 'All pipelines' : mapping.pipelineFamilies.labels[pipeline];
}

// ---------------------------------------------------------------- FR-2 KPIs
export function computeKpis(model, mapping, { pipeline, period, now }) {
  const deals = model.deals.filter(inPipeline(pipeline));
  const leads = model.leads.filter(inPipeline(pipeline));

  const open = deals.filter((d) => d.semantic === 'P');
  const valued = open.filter((d) => d.opportunity > 0);
  const closed = deals.filter((d) => d.semantic !== 'P' && inRange(d.closedAt, period));
  const won = closed.filter((d) => d.semantic === 'S').length;
  const lost = closed.length - won;
  const risk = dealsAtRiskRows(deals, mapping, now);
  const missing = missingValueRows(model, mapping, pipeline);

  return {
    openDeals: open.length,
    openPipelineValue: sum(open, (d) => d.opportunity),
    weightedForecast: sum(open, (d) => d.opportunity * d.probability),
    winRate: pct(won, won + lost),
    won,
    lost,
    avgDealSize: valued.length ? sum(valued, (d) => d.opportunity) / valued.length : null,
    valuedDeals: valued.length,
    dealsAtRisk: risk.length,
    atRiskDays: mapping.risk.atRiskDays,
    newLeads: leads.filter((l) => inRange(l.createdAt, period)).length,
    totalLeads: leads.filter((l) => l.bucket !== 'converted').length,
    missingValue: missing.length,
    missingDeals: missing.filter((r) => r.type === 'deal').length,
    missingLeads: missing.filter((r) => r.type === 'lead').length,
    missingIncludesLeads: mapping.missingValue.includeLeads !== false,
    followUps: computeFollowUpSummary(model, { pipeline, now }),
    errorsNoValue: missing.filter((r) => r.issues.includes('value')).length,
    errorsNoCustomer: missing.filter((r) => r.issues.includes('customer')).length,
  };
}

// ----------------------------------------------------------- FR-3 Lead funnel
export function computeLeadFunnel(model, mapping) {
  const cfg = mapping.leadStatuses;
  const counts = {};
  // Current lead Kanban: every lead in each status column.
  for (const l of model.leads) {
    if (cfg.excluded.includes(l.bucket)) continue;
    counts[l.bucket] = (counts[l.bucket] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const row = (key) => ({ key, label: cfg.labels[key] ?? key, count: counts[key] || 0, share: pct(counts[key] || 0, total) });
  const known = new Set([...cfg.forward, ...cfg.disqualified]);
  // §9: anything not in the config shows in a visible Unmapped bucket.
  const unmapped = Object.keys(counts).filter((k) => !known.has(k));
  return {
    total,
    forward: cfg.forward.map(row),
    disqualified: cfg.disqualified.map(row),
    unmapped: unmapped.map((k) => ({ ...row(k), label: k === 'unmapped' ? cfg.labels.unmapped : k })),
  };
}

// ----------------------------------------------------------- FR-4 Deal funnel
export function computeDealFunnel(model, mapping, { period }) {
  const cfg = mapping.dealStages;
  const counts = {};
  for (const d of model.deals.filter(onBoard(period))) counts[d.bucket] = (counts[d.bucket] || 0) + 1;
  const forwardKeys = cfg.order.filter((k) => k !== 'lost');
  // Bars show current-stage counts; conversion uses deals that *reached* each
  // stage (currently there or further along), so it never exceeds 100%.
  const reached = forwardKeys.map((_, i) => forwardKeys.slice(i).reduce((s, k) => s + (counts[k] || 0), 0));
  const stages = forwardKeys.map((key, i) => ({
    key,
    label: cfg.labels[key],
    count: counts[key] || 0,
    reached: reached[i],
    conversion: i === 0 ? null : pct(reached[i], reached[i - 1]),
  }));
  const pipelines = new Set(model.deals.map((d) => d.categoryId)).size;
  return {
    pipelines,
    stages,
    lost: { key: 'lost', label: cfg.labels.lost, count: counts.lost || 0 },
    unmapped: counts.unmapped || 0,
  };
}

// ------------------------------------------------------ FR-5 Lead sources
export function computeLeadSources(model, mapping, { period }) {
  const agg = new Map();
  for (const l of model.leads) {
    if (!l.source || !inRange(l.createdAt, period)) continue;
    const a = agg.get(l.source) || { source: l.source, leads: 0, converted: 0 };
    a.leads++;
    if (l.bucket === 'converted') a.converted++;
    agg.set(l.source, a);
  }
  return [...agg.values()]
    .filter((a) => a.leads > 0)
    .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source))
    .slice(0, mapping.leadSources.topN)
    .map((a) => ({ ...a, conversion: pct(a.converted, a.leads) }));
}

// ------------------------------------------------- FR-6 Pipeline breakdown
function breakdownStats(deals, mapping) {
  const open = deals.filter((d) => d.semantic === 'P');
  const mix = {};
  for (const d of deals) mix[d.bucket] = (mix[d.bucket] || 0) + 1;
  return {
    openDeals: open.length,
    openValue: sum(open, (d) => d.opportunity),
    lostValue: sum(deals.filter((d) => d.semantic === 'F'), (d) => d.opportunity),
    dealCount: deals.length,
    stageMix: [...mapping.dealStages.order, 'unmapped']
      .filter((k) => mix[k])
      .map((k) => ({ key: k, label: mapping.dealStages.labels[k], count: mix[k] })),
  };
}

export function computePipelineBreakdown(model, mapping, { pipeline, period }) {
  const pf = mapping.pipelineFamilies;
  const deals = model.deals.filter(onBoard(period));
  const families = pf.order.filter((f) => pipeline === 'all' || f === pipeline);

  const rows = families.map((family) => {
    const famDeals = deals.filter((d) => d.family === family);
    const row = { family, label: pf.labels[family], ...breakdownStats(famDeals, mapping), variants: [] };
    if (pf.variantFamilies.includes(family)) {
      // Variant rows come from live categories, so a new "Nural Sales - X" appears automatically.
      row.variants = model.categories
        .filter((c) => c.family === family)
        .map((c) => ({ categoryId: c.id, label: c.name, ...breakdownStats(famDeals.filter((d) => d.categoryId === c.id), mapping) }));
    }
    return row;
  });

  const total = pipeline === 'all'
    ? {
        label: `Total (${rows.length} flagship buckets)`,
        openDeals: sum(rows, (r) => r.openDeals),
        openValue: sum(rows, (r) => r.openValue),
        lostValue: sum(rows, (r) => r.lostValue),
      }
    : null;
  return { rows, total };
}

// ---------------------------------------------------------- FR-8 Trend
export function computeTrend(model, { pipeline, period }) {
  const deals = model.deals.filter(inPipeline(pipeline));
  return period.trendMonths.map((m) => {
    let won = 0;
    let lost = 0;
    for (const d of deals) {
      if (d.semantic === 'P' || !inRange(d.closedAt, m)) continue;
      if (d.semantic === 'S') won++;
      else lost++;
    }
    return { month: m.key, label: m.label, won, lost };
  });
}

// ------------------------------------------------------ FR-9 Deals at risk
function dealsAtRiskRows(deals, mapping, now) {
  const { atRiskDays, highDays } = mapping.risk;
  return deals
    .filter((d) => d.semantic === 'P' && d.movedAt != null)
    .map((d) => ({ d, days: Math.floor((now - d.movedAt) / DAY) }))
    .filter(({ days }) => days > atRiskDays)
    .sort((a, b) => b.days - a.days || b.d.opportunity - a.d.opportunity)
    .map(({ d, days }) => ({
      id: d.id,
      title: d.title,
      value: d.opportunity,
      stage: d.stageName,
      pipeline: d.categoryName,
      movedAt: d.movedAt,
      daysInStage: days,
      owner: d.ownerName,
      severity: days > highDays ? 'high' : 'watch',
    }));
}

export function computeDealsAtRisk(model, mapping, { pipeline = 'all', now }) {
  const deals = model.deals.filter(inPipeline(pipeline));
  const missingMovedTime = deals.some((d) => d.semantic === 'P' && d.movedAt == null);
  const openDeals = deals.filter((d) => d.semantic === 'P');
  // FR-9: degrade explicitly instead of showing wrong data if MOVED_TIME is absent.
  if (openDeals.length && openDeals.every((d) => d.movedAt == null)) {
    return { available: false, reason: 'MOVED_TIME is not populated on any open deal', rows: [] };
  }
  return {
    available: true,
    atRiskDays: mapping.risk.atRiskDays,
    highDays: mapping.risk.highDays,
    partial: missingMovedTime,
    openDeals: openDeals.length,
    rows: dealsAtRiskRows(deals, mapping, now),
  };
}

// --------------------------------------------- FR-7 Error List (was Missing Value)
// An open deal or active lead is listed when it has one or more errors:
//   value    — no potential value (OPPORTUNITY empty or 0)
//   customer — no customer name (no contact, and none on the lead it came from)
// Each check and the lead side are switchable in config/mapping.json → missingValue.
export function errorIssues(record, cfg) {
  const issues = [];
  if (cfg.checkValue !== false && !(record.opportunity > 0)) issues.push('value');
  if (cfg.checkCustomer && !record.customer) issues.push('customer');
  return issues;
}

export function missingValueRows(model, mapping, pipeline, { portal = null } = {}) {
  const cfg = mapping.missingValue;
  const link = (type, id) => (portal ? `${portal}/crm/${type}/details/${id}/` : null);
  const deals = model.deals
    .filter((d) => d.semantic === 'P' && inPipeline(pipeline)(d))
    .map((d) => ({ d, issues: errorIssues(d, cfg) }))
    .filter(({ issues }) => issues.length)
    .map(({ d, issues }) => ({
      type: 'deal',
      id: d.id,
      title: d.title,
      company: d.company,
      customer: d.customer,
      value: d.opportunity,
      categoryId: d.untagged ? null : d.categoryId,
      pipeline: d.untagged ? null : d.categoryName,
      stage: d.stageName,
      issues,
      // A name found on the lead it came from (or a same-company lead), for an admin to apply.
      suggestion: issues.includes('customer') ? suggestCustomer(d, model) : null,
      link: link('deal', d.id),
    }));
  if (cfg.includeLeads === false) return deals;
  const leads = model.leads
    .filter((l) => cfg.leadBuckets.includes(l.bucket) && inPipeline(pipeline)(l))
    .map((l) => ({ l, issues: errorIssues(l, cfg) }))
    .filter(({ issues }) => issues.length)
    .map(({ l, issues }) => ({
      type: 'lead',
      id: l.id,
      title: l.title,
      company: l.company,
      customer: l.customer,
      value: l.opportunity,
      categoryId: l.categoryId,
      pipeline: l.categoryName,
      stage: mapping.leadStatuses.labels[l.bucket] ?? l.statusId,
      issues,
      link: link('lead', l.id),
    }));
  return [...deals, ...leads];
}

// ------------------------------------------------------------ Combined
export function computeDashboard(model, mapping, ctx) {
  return {
    filters: { pipeline: ctx.pipeline, pipelineLabel: pipelineLabel(mapping, ctx.pipeline), period: ctx.period.key, periodLabel: ctx.period.label },
    kpis: computeKpis(model, mapping, ctx),
    leadFunnel: computeLeadFunnel(model, mapping, ctx),
    dealFunnel: computeDealFunnel(model, mapping, ctx),
    leadSources: computeLeadSources(model, mapping, ctx),
    pipelineBreakdown: computePipelineBreakdown(model, mapping, ctx),
    trend: computeTrend(model, ctx),
    dealsAtRisk: computeDealsAtRisk(model, mapping, ctx),
  };
}
