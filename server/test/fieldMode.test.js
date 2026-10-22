// Portals that keep every deal on one Kanban board and track the product line
// in a list field ("Product") — the reporting pipeline comes from that field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMapping } from '../src/config.js';
import { leadPipelineMaps, normalize } from '../src/normalize.js';
import { computeKpis, computePipelineBreakdown, missingValueRows } from '../src/metrics/dashboard.js';
import { resolvePeriod } from '../src/metrics/period.js';

const portalMapping = loadMapping();
// Value check only — the test portal has no customer names.
const mapping = { ...portalMapping, missingValue: { ...portalMapping.missingValue, checkCustomer: false } };
const env = { dealPipelineField: 'UF_PRODUCT', leadPipelineField: 'UF_LEAD_PRODUCT' };
const NOW = Date.parse('2026-10-21T12:00:00+05:30');
const iso = (daysAgo) => new Date(NOW - daysAgo * 86_400_000).toISOString();

const raw = {
  kanbans: [{ ID: '0', NAME: 'Default pipeline' }],
  categories: [
    { ID: '536', NAME: 'Nural Sales - DMS', SORT: 0 },
    { ID: '552', NAME: 'Nural Schemes', SORT: 1 },
    { ID: '526', NAME: 'Nural Service', SORT: 2 },
  ],
  pipelineField: {
    deal: [{ ID: '536', VALUE: 'Nural Sales - DMS' }, { ID: '552', VALUE: 'Nural Schemes' }, { ID: '526', VALUE: 'Nural Service' }],
    lead: [{ ID: '9001', VALUE: 'Nural Sales - DMS' }, { ID: '9002', VALUE: 'Nural Service' }],
  },
  statuses: [
    { ENTITY_ID: 'DEAL_STAGE', STATUS_ID: 'NEW', NAME: 'Proposal/Quote', SORT: 10, EXTRA: { SEMANTICS: 'process' } },
    { ENTITY_ID: 'DEAL_STAGE', STATUS_ID: 'PREPARATION', NAME: 'Negotiations & Discussions', SORT: 30, EXTRA: { SEMANTICS: 'process' } },
    { ENTITY_ID: 'DEAL_STAGE', STATUS_ID: 'LOSE', NAME: 'Closed - Lost', SORT: 50, EXTRA: { SEMANTICS: 'failure' } },
    { ENTITY_ID: 'STATUS', STATUS_ID: 'UC_HOT', NAME: 'Hot' },
  ],
  deals: [
    { ID: '1', CATEGORY_ID: '0', STAGE_ID: 'NEW', STAGE_SEMANTIC_ID: 'P', OPPORTUNITY: '500000', UF_PRODUCT: '536', DATE_CREATE: iso(100), MOVED_TIME: iso(3) },
    { ID: '2', CATEGORY_ID: '0', STAGE_ID: 'PREPARATION', STAGE_SEMANTIC_ID: 'P', OPPORTUNITY: '0', UF_PRODUCT: ['552'], DATE_CREATE: iso(5), MOVED_TIME: iso(30) },
    { ID: '3', CATEGORY_ID: '0', STAGE_ID: 'NEW', STAGE_SEMANTIC_ID: 'P', OPPORTUNITY: '200000', UF_PRODUCT: '526', DATE_CREATE: iso(5), MOVED_TIME: iso(1) },
    { ID: '4', CATEGORY_ID: '0', STAGE_ID: 'NEW', STAGE_SEMANTIC_ID: 'P', OPPORTUNITY: '0', UF_PRODUCT: '', DATE_CREATE: iso(5), MOVED_TIME: iso(1) },
    { ID: '5', CATEGORY_ID: '0', STAGE_ID: 'LOSE', STAGE_SEMANTIC_ID: 'F', OPPORTUNITY: '700000', UF_PRODUCT: '536', DATE_CREATE: iso(40), CLOSEDATE: iso(2), MOVED_TIME: iso(2) },
  ],
  leads: [
    { ID: '10', STATUS_ID: 'UC_HOT', OPPORTUNITY: '0', UF_LEAD_PRODUCT: '9001', DATE_CREATE: iso(2) },
    { ID: '11', STATUS_ID: 'UC_HOT', OPPORTUNITY: '0', UF_LEAD_PRODUCT: '', DATE_CREATE: iso(2) },
  ],
  users: [],
};

const model = normalize(raw, mapping, env);
const ctx = (pipeline = 'all') => ({ pipeline, period: resolvePeriod({ period: 'quarter' }, NOW), now: NOW });

test('deals take their pipeline from the Product field, stages from the Kanban column', () => {
  assert.equal(model.fieldMode, true);
  const byId = Object.fromEntries(model.deals.map((d) => [d.id, d]));
  assert.deepEqual([byId[1].categoryName, byId[1].family, byId[1].bucket], ['Nural Sales - DMS', 'sales', 'proposal']);
  assert.deepEqual([byId[2].categoryName, byId[2].family, byId[2].bucket], ['Nural Schemes', 'sales', 'negotiation']); // multi-select value
  assert.equal(byId[3].family, 'service');
  assert.deepEqual([byId[4].categoryId, byId[4].untagged, byId[4].family], [null, true, 'custom']);
  assert.deepEqual(model.kanbans, [{ id: '0', name: 'Default pipeline' }]);
});

test('leads map to the deal pipeline by option name', () => {
  const byId = Object.fromEntries(model.leads.map((l) => [l.id, l]));
  assert.deepEqual([byId[10].categoryId, byId[10].family], ['536', 'sales']);
  assert.deepEqual([byId[11].categoryId, byId[11].family], [null, 'custom']);
  const maps = leadPipelineMaps(raw);
  assert.equal(maps.toLeadOption('526', 'Nural Service'), '9002');
  assert.equal(maps.toLeadOption('552', 'Nural Schemes'), null); // no such option on the lead field
});

test('KPIs and breakdown scope by Product-based pipeline', () => {
  assert.equal(computeKpis(model, mapping, ctx('sales')).openDeals, 2);
  assert.equal(computeKpis(model, mapping, ctx('service')).openDeals, 1);
  assert.equal(computeKpis(model, mapping, ctx('custom')).openDeals, 1); // the deal with no Product
  const sales = computePipelineBreakdown(model, mapping, ctx()).rows.find((r) => r.family === 'sales');
  assert.deepEqual(sales.variants.map((v) => [v.label, v.openDeals]), [['Nural Sales - DMS', 1], ['Nural Schemes', 1]]);
  assert.equal(sales.lostValue, 700_000);
  const missing = missingValueRows(model, mapping, 'all');
  assert.deepEqual(missing.filter((r) => r.type === 'deal').map((r) => [r.id, r.pipeline]), [['2', 'Nural Schemes'], ['4', null]]);
});
