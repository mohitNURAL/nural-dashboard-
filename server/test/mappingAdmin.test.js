import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMapping } from '../src/config.js';
import { generateMockPortal } from '../src/bitrix/mock.js';
import { normalize } from '../src/normalize.js';
import { applyMappingChange, computeMappingIssues } from '../src/mappingAdmin.js';

const env = { leadPipelineField: 'UF_TAG' };
const base = loadMapping();
const raw = generateMockPortal({ leadPipelineField: 'UF_TAG' });
const model = (mapping = base) => normalize(raw, mapping, env);

test('finds unmapped Kanban stage, lead status and catch-all pipelines', () => {
  const { summary, items } = computeMappingIssues(model(), base);
  assert.deepEqual(items.dealStage.map((i) => [i.id, i.status]), [['C1:UC_DEMO', 'unmapped']]);
  assert.equal(items.dealStage[0].count, 5);
  assert.deepEqual(items.leadStatus.map((i) => [i.id, i.status]), [['UC_FOLLOW', 'unmapped']]);
  assert.deepEqual(items.pipeline.map((i) => i.name).sort(), ['Bespoke Development', 'Partner Channel']);
  assert.ok(items.pipeline.every((i) => i.status === 'unconfirmed'));
  assert.equal(summary.unmapped, 2);
  assert.equal(summary.affectedDeals, 5);
  assert.equal(summary.affectedLeads, 6);
});

test('mapping a stage moves its deals into the funnel bar', () => {
  const { mapping, old } = applyMappingChange(base, model(), { kind: 'dealStage', id: 'C1:UC_DEMO', value: 'proposal' });
  assert.equal(old, null);
  assert.equal(base.dealStages.byStageId['C1:UC_DEMO'], undefined, 'input mapping is not mutated');
  const m = model(mapping);
  assert.ok(m.deals.filter((d) => d.stageId === 'C1:UC_DEMO').every((d) => d.bucket === 'proposal'));
  const issues = computeMappingIssues(m, mapping);
  assert.equal(issues.summary.unmapped, 1); // only the lead status left
  assert.deepEqual(issues.items.dealStage.map((i) => [i.status, i.current]), [['manual', 'proposal']]);
});

test('confirming or moving a pipeline, then resetting', () => {
  const partner = model().categories.find((c) => c.name === 'Partner Channel');
  const { mapping } = applyMappingChange(base, model(), { kind: 'pipeline', id: partner.id, value: 'sales' });
  assert.equal(model(mapping).categories.find((c) => c.id === partner.id).family, 'sales');
  const reset = applyMappingChange(mapping, model(mapping), { kind: 'pipeline', id: partner.id, value: null });
  assert.equal(reset.old, 'sales');
  assert.equal(model(reset.mapping).categories.find((c) => c.id === partner.id).family, 'custom');
});

test('rejects unknown ids, invalid choices and won/lost columns', () => {
  assert.throws(() => applyMappingChange(base, model(), { kind: 'dealStage', id: 'C1:NOPE', value: 'proposal' }), /not a current deal stage/);
  assert.throws(() => applyMappingChange(base, model(), { kind: 'dealStage', id: 'C1:UC_DEMO', value: 'won' }), /not a valid choice/);
  assert.throws(() => applyMappingChange(base, model(), { kind: 'dealStage', id: 'C1:WON', value: 'proposal' }), /mapped automatically/);
  assert.throws(() => applyMappingChange(base, model(), { kind: 'leadStatus', id: 'UC_FOLLOW', value: 'nonsense' }), /not a valid choice/);
  assert.throws(() => applyMappingChange(base, model(), { kind: 'other', id: 'x', value: 'y' }), /Unknown mapping kind/);
});
