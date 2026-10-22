import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMapping } from '../src/config.js';
import { dealStageBucket, familyForCategory, leadStatusBucket, normalizeLeadSource, stageProbability } from '../src/mapping.js';
import { normalize } from '../src/normalize.js';
import { resolvePeriod } from '../src/metrics/period.js';
import {
  computeDealFunnel, computeDealsAtRisk, computeKpis, computeLeadFunnel, computeLeadSources,
  computePipelineBreakdown, computeTrend, missingValueRows,
} from '../src/metrics/dashboard.js';
import { toQuery } from '../src/bitrix/client.js';

const portalMapping = loadMapping();
// These tests cover the original no-value rule over deals and leads; the
// customer-name check of the Error List is tested separately below.
const mapping = { ...portalMapping, missingValue: { ...portalMapping.missingValue, includeLeads: true, checkCustomer: false } };
const NOW = Date.parse('2026-10-21T12:00:00+05:30');
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

test('pipeline family parsing from category NAME', () => {
  assert.equal(familyForCategory(mapping, 'Nural Sales - DMS'), 'sales');
  assert.equal(familyForCategory(mapping, 'nural sales - Brand New Variant'), 'sales');
  assert.equal(familyForCategory(mapping, 'Nural Service'), 'service');
  assert.equal(familyForCategory(mapping, 'Nural Assets'), 'assets');
  assert.equal(familyForCategory(mapping, 'Bespoke Development'), 'custom');
  assert.equal(familyForCategory(mapping, 'General'), 'custom');
});

test('deal stage buckets and probabilities', () => {
  assert.equal(dealStageBucket(mapping, { stageId: 'C1:NEW', name: 'Proposal/Quote', semantic: 'P' }), 'proposal');
  assert.equal(dealStageBucket(mapping, { stageId: 'C1:PREP', name: 'Revised Proposal Sent', semantic: 'P' }), 'revised');
  // Purchase Order is not a funnel stage; a deal parked there surfaces as Unmapped.
  assert.equal(dealStageBucket(mapping, { stageId: 'C1:X', name: 'Purchase Order', semantic: 'P' }), 'unmapped');
  assert.equal(dealStageBucket(mapping, { stageId: 'C1:WON', name: 'Anything', semantic: 'S' }), 'won');
  assert.equal(dealStageBucket(mapping, { stageId: 'C1:LOSE', name: 'Anything', semantic: 'F' }), 'lost');
  assert.equal(dealStageBucket(mapping, { stageId: 'C1:Q', name: 'Something new', semantic: 'P' }), 'unmapped');
  assert.equal(stageProbability(mapping, 'C1:NEW', 'proposal'), 0.2);
  assert.equal(stageProbability(mapping, 'C1:WON', 'won'), 1);
});

test('lead status buckets', () => {
  assert.equal(leadStatusBucket(mapping, { statusId: 'CONVERTED', name: 'Lead Completed' }), 'converted');
  assert.equal(leadStatusBucket(mapping, { statusId: 'NEW', name: 'Unassigned' }), 'unassigned');
  assert.equal(leadStatusBucket(mapping, { statusId: 'UC_1', name: 'Hot' }), 'hot');
  assert.equal(leadStatusBucket(mapping, { statusId: 'JUNK', name: 'Junk Lead' }), 'junk');
  assert.equal(leadStatusBucket(mapping, { statusId: 'UC_9', name: 'Mystery' }), 'unmapped');
});

test('lead source normalization: Call + Website merge, Existing Client excluded', () => {
  assert.equal(normalizeLeadSource(mapping, 'Call'), 'Website Enquiry');
  assert.equal(normalizeLeadSource(mapping, ' website '), 'Website Enquiry');
  assert.equal(normalizeLeadSource(mapping, 'Cold Call'), 'Cold Call');
  assert.equal(normalizeLeadSource(mapping, 'Existing Client'), null);
  assert.equal(normalizeLeadSource(mapping, ''), null);
});

test('period resolution in IST', () => {
  const q = resolvePeriod({ period: 'quarter' }, NOW);
  assert.equal(q.from, Date.parse('2026-10-01T00:00:00+05:30'));
  assert.deepEqual(q.trendMonths.map((m) => m.label), ['Aug', 'Sep', 'Oct']);
  const m = resolvePeriod({ period: 'month' }, NOW);
  assert.equal(m.trendMonths.length, 1);
  const c = resolvePeriod({ period: 'custom', from: '2025-12-15', to: '2026-02-10' }, NOW);
  assert.equal(c.to, Date.parse('2026-02-11T00:00:00+05:30') - 1);
  assert.deepEqual(c.trendMonths.map((x) => x.label), ['Dec 25', 'Jan 26', 'Feb 26']);
  assert.throws(() => resolvePeriod({ period: 'custom', from: '2026-03-01', to: '2026-02-01' }, NOW));
});

test('toQuery builds PHP-style nested params for batch', () => {
  assert.equal(toQuery({ start: 50, select: ['ID', 'TITLE'], order: { ID: 'ASC' } }),
    'start=50&select%5B0%5D=ID&select%5B1%5D=TITLE&order%5BID%5D=ASC');
});

// --- Small hand-built portal so expected numbers are obvious ---------------
function portal() {
  const stages = (cat) => [
    ['NEW', 'Proposal/Quote', 'process'], ['NEG', 'Negotiation', 'process'],
    ['WON', 'Closed Won', 'success'], ['LOSE', 'Closed Lost', 'failure'],
  ].map(([c, n, s], i) => ({ ENTITY_ID: cat === '0' ? 'DEAL_STAGE' : `DEAL_STAGE_${cat}`, STATUS_ID: cat === '0' ? c : `C${cat}:${c}`, NAME: n, SORT: i, EXTRA: { SEMANTICS: s } }));
  const deal = (id, cat, stage, sem, value, createdDaysAgo, movedDaysAgo, closedDaysAgo) => ({
    ID: id, TITLE: `Deal ${id}`, CATEGORY_ID: cat, STAGE_ID: cat === '0' ? stage : `C${cat}:${stage}`, STAGE_SEMANTIC_ID: sem,
    OPPORTUNITY: String(value), CURRENCY_ID: 'INR', DATE_CREATE: iso(NOW - createdDaysAgo * DAY),
    MOVED_TIME: iso(NOW - movedDaysAgo * DAY), CLOSEDATE: iso(NOW - (closedDaysAgo ?? -30) * DAY), ASSIGNED_BY_ID: '1',
  });
  const lead = (id, status, source, value, createdDaysAgo, tag = '') => ({
    ID: id, TITLE: `Lead ${id}`, STATUS_ID: status, SOURCE_ID: source, OPPORTUNITY: String(value),
    DATE_CREATE: iso(NOW - createdDaysAgo * DAY), UF_TAG: tag,
  });
  return {
    categories: [{ ID: '0', NAME: 'General' }, { ID: '1', NAME: 'Nural Sales - DMS' }, { ID: '2', NAME: 'Nural Assets' }],
    statuses: [
      ...stages('0'), ...stages('1'), ...stages('2'),
      { ENTITY_ID: 'STATUS', STATUS_ID: 'NEW', NAME: 'Unassigned' },
      { ENTITY_ID: 'STATUS', STATUS_ID: 'UC_HOT', NAME: 'Hot' },
      { ENTITY_ID: 'STATUS', STATUS_ID: 'UC_COLD', NAME: 'Cold' },
      { ENTITY_ID: 'STATUS', STATUS_ID: 'CONVERTED', NAME: 'Lead Completed' },
      { ENTITY_ID: 'SOURCE', STATUS_ID: 'CALL', NAME: 'Call' },
      { ENTITY_ID: 'SOURCE', STATUS_ID: 'WEB', NAME: 'Website' },
      { ENTITY_ID: 'SOURCE', STATUS_ID: 'EX', NAME: 'Existing Client' },
    ],
    deals: [
      deal('1', '1', 'NEW', 'P', 1_000_000, 5, 20),      // open, at risk (20d → watch)
      deal('2', '1', 'NEG', 'P', 3_000_000, 10, 2),      // open
      deal('3', '1', 'WON', 'S', 500_000, 60, 3, 3),     // won this quarter
      deal('4', '2', 'LOSE', 'F', 200_000, 8, 1, 1),     // lost this quarter
      deal('5', '0', 'NEW', 'P', 0, 3, 30),              // untagged, missing value, high risk
      deal('6', '2', 'NEW', 'P', 400_000, 200, 1),       // created last year-ish: outside period
    ],
    leads: [
      lead('10', 'UC_HOT', 'CALL', 0, 2, '1'),
      lead('11', 'UC_HOT', 'WEB', 50_000, 4),
      lead('12', 'CONVERTED', 'WEB', 10, 6, '2'),
      lead('13', 'UC_COLD', 'EX', 0, 6),
      lead('14', 'NEW', 'CALL', 0, 6),
      lead('15', 'UC_HOT', 'CALL', 0, 120),             // outside period
    ],
    users: [{ ID: '1', NAME: 'Asha', LAST_NAME: 'K' }],
  };
}

const model = normalize(portal(), mapping, { leadPipelineField: 'UF_TAG' });
const period = resolvePeriod({ period: 'quarter' }, NOW);
const ctx = (pipeline = 'all') => ({ pipeline, period, now: NOW });

test('KPIs — all pipelines, open deals as on the Kanban board', () => {
  const k = computeKpis(model, mapping, ctx());
  // Every deal in an open stage counts, including deal 6 created 200 days ago.
  assert.equal(k.openDeals, 4); // deals 1, 2, 5, 6
  assert.equal(k.openPipelineValue, 4_400_000);
  assert.equal(Math.round(k.weightedForecast), Math.round(1_000_000 * 0.2 + 3_000_000 * 0.55 + 400_000 * 0.2));
  assert.equal(k.won, 1);
  assert.equal(k.lost, 1);
  assert.equal(k.winRate, 0.5);
  assert.equal(k.avgDealSize, 4_400_000 / 3); // valued open deals 1, 2, 6
  assert.equal(k.dealsAtRisk, 2);
  assert.equal(k.newLeads, 5);
  assert.equal(k.totalLeads, 5);
  assert.deepEqual([k.missingValue, k.missingDeals, k.missingLeads], [3, 1, 2]);
});

test('KPIs — pipeline scoping, untagged lead falls into Custom', () => {
  const sales = computeKpis(model, mapping, ctx('sales'));
  assert.equal(sales.openDeals, 2);
  assert.equal(sales.missingLeads, 1); // lead 10 tagged to Sales
  const custom = computeKpis(model, mapping, ctx('custom'));
  assert.equal(custom.openDeals, 1); // the untagged General deal
  assert.equal(custom.missingLeads, 1); // lead 15, untagged
});

test('lead funnel excludes Unassigned/Junk and reports shares', () => {
  const f = computeLeadFunnel(model, mapping, ctx());
  // Lead Kanban: every lead in each status, any age (14 is Unassigned → excluded).
  assert.equal(f.total, 5); // 10, 11, 15 hot; 12 converted; 13 cold
  assert.equal(f.forward.find((s) => s.key === 'hot').count, 3);
  assert.equal(f.forward.find((s) => s.key === 'hot').share, 0.6);
  assert.equal(f.disqualified.find((s) => s.key === 'cold').count, 1);
});

test('deal funnel stage-to-stage conversion', () => {
  const f = computeDealFunnel(model, mapping, ctx());
  const byKey = Object.fromEntries(f.stages.map((s) => [s.key, s]));
  // Open columns: deals 1, 5, 6 at proposal; deal 2 at negotiation.
  // Closed in period: deal 3 won, deal 4 lost.
  assert.equal(byKey.proposal.count, 3);
  assert.equal(byKey.proposal.reached, 5);
  assert.equal(byKey.proposal.conversion, null);
  assert.equal(byKey.revised.reached, 2);
  assert.equal(byKey.revised.conversion, 2 / 5);
  assert.equal(byKey.negotiation.count, 1);
  assert.equal(byKey.negotiation.conversion, 1);
  assert.equal(byKey.won.count, 1);
  assert.equal(byKey.won.conversion, 0.5);
  assert.equal(byKey.po, undefined);
  assert.deepEqual(f.stages.map((x) => x.key), ['proposal', 'revised', 'negotiation', 'won']);
  assert.ok(f.stages.every((s) => s.conversion == null || s.conversion <= 1));
  assert.equal(f.lost.count, 1);
});

test('lead sources: merged, ranked, excluded', () => {
  const s = computeLeadSources(model, mapping, ctx());
  assert.deepEqual(s.map((x) => x.source), ['Website Enquiry']);
  assert.equal(s[0].leads, 4);
  assert.equal(s[0].converted, 1);
});

test('pipeline breakdown nests Sales variants and totals', () => {
  const b = computePipelineBreakdown(model, mapping, ctx());
  const sales = b.rows.find((r) => r.family === 'sales');
  assert.equal(sales.variants.length, 1);
  assert.equal(sales.openValue, 4_000_000);
  const assets = b.rows.find((r) => r.family === 'assets');
  assert.equal(assets.openValue, 400_000); // deal 6 is open on the board despite its age
  assert.equal(assets.lostValue, 200_000);
  assert.equal(b.total.openDeals, 4);
  assert.equal(computePipelineBreakdown(model, mapping, ctx('sales')).total, null);
});

test('won vs lost trend buckets by close month', () => {
  const t = computeTrend(model, ctx());
  assert.equal(t.at(-1).won, 1);
  assert.equal(t.at(-1).lost, 1);
});

test('deals at risk severity thresholds', () => {
  const r = computeDealsAtRisk(model, mapping, ctx());
  assert.equal(r.available, true);
  assert.equal(r.openDeals, 4);
  assert.deepEqual(r.rows.map((x) => [x.id, x.severity]), [['5', 'high'], ['1', 'watch']]);
});

test('deals at risk follows the pipeline filter, matching its KPI tile', () => {
  for (const p of ['all', 'sales', 'assets', 'custom']) {
    assert.equal(computeDealsAtRisk(model, mapping, ctx(p)).rows.length, computeKpis(model, mapping, ctx(p)).dealsAtRisk, p);
  }
  assert.deepEqual(computeDealsAtRisk(model, mapping, ctx('sales')).rows.map((x) => x.id), ['1']);
});

test('missing value rows mark untagged deals', () => {
  const rows = missingValueRows(model, mapping, 'all');
  assert.equal(rows.find((r) => r.id === '5').pipeline, null);
  assert.equal(rows.find((r) => r.id === '10').pipeline, 'Nural Sales - DMS');
});

test('Error List flags no value and no customer name, one row per record', () => {
  const cfg = portalMapping.missingValue;
  assert.deepEqual([cfg.includeLeads, cfg.checkValue, cfg.checkCustomer], [true, true, true]);
  // Give two leads a customer; deals in this portal have none.
  const m = { ...model, leads: model.leads.map((l) => (l.id === '10' || l.id === '11' ? { ...l, customer: 'Named Person' } : l)) };
  const rows = missingValueRows(m, portalMapping, 'all', { portal: 'https://x.bitrix24.in' });
  const byId = Object.fromEntries(rows.map((r) => [`${r.type}-${r.id}`, r.issues]));
  assert.deepEqual(byId['deal-5'], ['value', 'customer']); // both errors, still one row
  assert.deepEqual(byId['deal-1'], ['customer']); // valued deal, no customer
  assert.deepEqual(byId['lead-10'], ['value']); // has customer, no value
  assert.equal(byId['lead-11'], undefined); // has customer and value
  assert.equal(rows.find((r) => r.id === '5').link, 'https://x.bitrix24.in/crm/deal/details/5/');
  const k = computeKpis(m, portalMapping, ctx());
  assert.equal(k.missingValue, rows.length);
  assert.equal(k.errorsNoValue, rows.filter((r) => r.issues.includes('value')).length);
  assert.equal(k.errorsNoCustomer, rows.filter((r) => r.issues.includes('customer')).length);
});

test('Error List checks can be switched off in config', () => {
  const off = (patch) => ({ ...portalMapping, missingValue: { ...portalMapping.missingValue, ...patch } });
  assert.ok(missingValueRows(model, off({ checkCustomer: false }), 'all').every((r) => r.issues.join() === 'value'));
  assert.ok(missingValueRows(model, off({ includeLeads: false }), 'all').every((r) => r.type === 'deal'));
  assert.deepEqual(missingValueRows(model, off({ checkValue: false, checkCustomer: false }), 'all'), []);
});

test('lead sources are dynamic: new sources appear, zero-lead ones drop, capped at top 6', () => {
  const sources = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Brand New Source'];
  const raw = {
    categories: [{ ID: '0', NAME: 'General' }],
    statuses: [
      ...sources.map((name, i) => ({ ENTITY_ID: 'SOURCE', STATUS_ID: `S${i}`, NAME: name })),
      { ENTITY_ID: 'SOURCE', STATUS_ID: 'EMPTY', NAME: 'Never Used' },
      { ENTITY_ID: 'STATUS', STATUS_ID: 'UC_HOT', NAME: 'Hot' },
      { ENTITY_ID: 'STATUS', STATUS_ID: 'CONVERTED', NAME: 'Lead Completed' },
    ],
    deals: [],
    // Source i gets i+1 leads; "Brand New Source" (index 7) gets the most.
    leads: sources.flatMap((_, i) => Array.from({ length: i + 1 }, (_, n) => ({
      ID: `${i}-${n}`, STATUS_ID: n === 0 ? 'CONVERTED' : 'UC_HOT', SOURCE_ID: `S${i}`, DATE_CREATE: new Date(NOW - DAY).toISOString(),
    }))),
    users: [],
  };
  const s = computeLeadSources(normalize(raw, mapping, {}), mapping, ctx());
  assert.deepEqual(s.map((x) => x.source), ['Brand New Source', 'Golf', 'Foxtrot', 'Echo', 'Delta', 'Charlie']);
  assert.deepEqual([s[0].leads, s[0].converted, s[0].conversion], [8, 1, 1 / 8]);
  assert.ok(!s.some((x) => x.source === 'Never Used'));
});

test('drill-down lists contain exactly the records behind each card', async () => {
  const { computeRecords } = await import('../src/metrics/records.js');
  const list = (pipeline, q) => computeRecords(model, mapping, { ...ctx(pipeline), portal: 'https://x.bitrix24.in' }, q);
  for (const p of ['all', 'sales', 'assets', 'custom']) {
    const k = computeKpis(model, mapping, ctx(p));
    assert.equal(list(p, { view: 'open-deals' }).count, k.openDeals, `open-deals ${p}`);
    assert.equal(list(p, { view: 'at-risk' }).count, k.dealsAtRisk, `at-risk ${p}`);
  }
  const df = computeDealFunnel(model, mapping, ctx());
  for (const s of [...df.stages, df.lost]) assert.equal(list('all', { view: 'deal-stage', bucket: s.key }).count, s.count, s.key);
  const lf = computeLeadFunnel(model, mapping, ctx());
  for (const s of [...lf.forward, ...lf.disqualified]) assert.equal(list('all', { view: 'lead-stage', bucket: s.key }).count, s.count, s.key);
  const b = computePipelineBreakdown(model, mapping, ctx());
  for (const r of b.rows) {
    assert.equal(list('all', { view: 'pipeline', family: r.family }).count, r.openDeals, r.family);
    for (const v of r.variants) assert.equal(list('all', { view: 'pipeline', family: r.family, categoryId: v.categoryId }).count, v.openDeals, v.label);
  }
  const row = list('all', { view: 'open-deals' }).rows.find((r) => r.id === '2');
  assert.deepEqual(
    [row.company, row.product, row.stage, row.value, row.owner, row.link],
    ['Deal 2', 'Nural Sales - DMS', 'Negotiation', 3_000_000, 'Asha K', 'https://x.bitrix24.in/crm/deal/details/2/'],
  );
  assert.equal(row.ageDays, 10);
  assert.throws(() => list('all', { view: 'nope' }), /Unknown list/);
});
