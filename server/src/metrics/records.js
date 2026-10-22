// Drill-down lists: the deals or leads behind a dashboard number. Each view
// uses the same rule as the card it opens from, so a list's length always
// equals the number that was clicked.

import { inRange } from './period.js';

const DAY = 86_400_000;

export class RecordsQueryError extends Error {}

const inPipeline = (pipeline) => (r) => pipeline === 'all' || r.family === pipeline;
const ageDays = (createdAt, now) => (createdAt == null ? null : Math.max(0, Math.floor((now - createdAt) / DAY)));

export function dealRow(d, { now, portal }) {
  return {
    type: 'deal',
    id: d.id,
    company: d.company,
    customer: d.customer,
    product: d.untagged ? null : d.categoryName,
    source: d.sourceName,
    stage: d.stageName,
    value: d.opportunity,
    ageDays: ageDays(d.createdAt, now),
    daysInStage: d.movedAt == null ? null : Math.floor((now - d.movedAt) / DAY),
    owner: d.ownerName,
    link: portal ? `${portal}/crm/deal/details/${d.id}/` : null,
  };
}

export function leadRow(l, { now, portal }) {
  return {
    type: 'lead',
    id: l.id,
    company: l.company,
    customer: l.customer,
    product: l.categoryName,
    source: l.sourceName,
    stage: l.statusName,
    value: l.opportunity,
    ageDays: ageDays(l.createdAt, now),
    daysInStage: null,
    owner: l.ownerName,
    link: portal ? `${portal}/crm/lead/details/${l.id}/` : null,
  };
}

/**
 * @param {{ view: string, bucket?: string, family?: string, categoryId?: string }} q
 *   view: open-deals | at-risk | deal-stage | lead-stage | pipeline
 */
export function computeRecords(model, mapping, ctx, q) {
  const { pipeline, period, now } = ctx;
  const open = (d) => d.semantic === 'P';
  let deals = null;
  let leads = null;

  switch (q.view) {
    case 'open-deals': // KPI tile — pipeline-scoped, current Kanban state
      deals = model.deals.filter((d) => open(d) && inPipeline(pipeline)(d));
      break;
    case 'at-risk': // KPI tile and panel
      deals = model.deals.filter((d) => open(d) && inPipeline(pipeline)(d) && d.movedAt != null
        && Math.floor((now - d.movedAt) / DAY) > mapping.risk.atRiskDays);
      break;
    case 'deal-stage': { // Deal funnel bar — all pipelines; won/lost closed in the period
      const known = [...mapping.dealStages.order, 'unmapped'];
      if (!known.includes(q.bucket)) throw new RecordsQueryError(`Unknown deal stage "${q.bucket}"`);
      deals = model.deals.filter((d) => d.bucket === q.bucket && (open(d) || inRange(d.closedAt, period)));
      break;
    }
    case 'lead-stage': { // Lead funnel bar — current lead Kanban, all pipelines
      const cfg = mapping.leadStatuses;
      if (![...cfg.forward, ...cfg.disqualified, 'unmapped'].includes(q.bucket)) throw new RecordsQueryError(`Unknown lead stage "${q.bucket}"`);
      leads = model.leads.filter((l) => l.bucket === q.bucket);
      break;
    }
    case 'pipeline': // Pipeline Breakdown "Open Deals" — flagship row or one variant
      if (!mapping.pipelineFamilies.order.includes(q.family)) throw new RecordsQueryError(`Unknown pipeline "${q.family}"`);
      deals = model.deals.filter((d) => open(d) && d.family === q.family && (!q.categoryId || d.categoryId === q.categoryId));
      break;
    default:
      throw new RecordsQueryError(`Unknown list "${q.view}"`);
  }

  const rowCtx = { now, portal: ctx.portal };
  const rows = deals ? deals.map((d) => dealRow(d, rowCtx)) : leads.map((l) => leadRow(l, rowCtx));
  rows.sort((a, b) => b.value - a.value || (b.ageDays ?? 0) - (a.ageDays ?? 0));
  return {
    entity: deals ? 'deal' : 'lead',
    count: rows.length,
    totalValue: rows.reduce((s, r) => s + r.value, 0),
    rows,
  };
}
