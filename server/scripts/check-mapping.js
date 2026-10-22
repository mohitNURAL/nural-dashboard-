// Lists every Kanban board and column, reporting pipeline, lead status and
// source on the portal, and shows where each lands on the dashboard (SRS Phase 0). Read-only.
//
//   npm run check-mapping            (from the project root)
//
// Anything marked UNMAPPED can be fixed in the dashboard's Data Mapping
// section, or in config/mapping.json using the snippet printed at the end.

import { env, isMock, loadMapping } from '../src/config.js';
import { createBitrixClient } from '../src/bitrix/client.js';
import { createMockClient } from '../src/bitrix/mock.js';
import { fetchRaw } from '../src/bitrix/fetch.js';
import { normalize } from '../src/normalize.js';
import { dealStageBucket, normalizeLeadSource } from '../src/mapping.js';
import { computeMappingIssues } from '../src/mappingAdmin.js';

const quiet = { info() {}, warn: console.warn, error: console.error };
const client = isMock
  ? createMockClient({ leadPipelineField: env.leadPipelineField, simulateActivity: false, log: quiet })
  : createBitrixClient(env.webhookUrl, { log: quiet });

const mapping = loadMapping();
console.log(isMock
  ? '\nMOCK MODE — BITRIX_WEBHOOK_URL is empty in server/.env, so this lists the sample portal.\n'
  : `\nConnected to ${new URL(env.webhookUrl).host}\n`);

let raw;
try {
  raw = await fetchRaw(client, env);
} catch (err) {
  console.error(`Could not read from Bitrix24: ${err.message}`);
  if (/insufficient_scope|ACCESS_DENIED/i.test(err.message)) console.error('The webhook needs the CRM (crm) and Users (user) permissions.');
  if (/NO_AUTH|invalid_token|expired/i.test(err.message)) console.error('The webhook URL looks wrong or was revoked — copy it again from Bitrix24.');
  process.exit(1);
}
const model = normalize(raw, mapping, env);
const issues = computeMappingIssues(model, mapping);

const pad = (s, n) => String(s).padEnd(n);
const count = (rows, key) => rows.reduce((m, r) => m.set(r[key], (m.get(r[key]) || 0) + 1), new Map());
const dealsByStage = count(model.deals, 'stageId');
const dealsByPipeline = count(model.deals, 'categoryId');
const unmappedStage = new Set(issues.items.dealStage.filter((i) => i.status === 'unmapped').map((i) => i.id));
const unmappedStatus = new Set(issues.items.leadStatus.filter((i) => i.status === 'unmapped').map((i) => i.id));

console.log('KANBAN BOARDS AND COLUMNS (deal stages)');
for (const k of model.kanbans) {
  console.log(`\n  ${k.name}  [board ${k.id}]`);
  const stages = [...model.stages.values()].filter((s) => s.categoryId === k.id).sort((a, b) => a.sort - b.sort);
  for (const s of stages) {
    const bucket = dealStageBucket(mapping, { stageId: s.id, name: s.name, semantic: s.semantic });
    const label = mapping.dealStages.labels[bucket];
    console.log(`    ${pad(s.name, 28)} ${pad(s.id, 20)} -> ${pad(label, 18)} ${pad(`${dealsByStage.get(s.id) || 0} deals`, 10)}${bucket === 'unmapped' ? '  <-- UNMAPPED' : ''}`);
  }
}

console.log(`\nREPORTING PIPELINES (${model.fieldMode ? `from deal field ${env.dealPipelineField}` : 'Bitrix deal pipelines'})`);
for (const c of model.categories) {
  const where = c.untagged ? 'untagged' : mapping.pipelineFamilies.labels[c.family];
  console.log(`    ${pad(c.name, 34)} ${pad(c.id, 8)} -> ${pad(where, 16)} ${dealsByPipeline.get(c.id) || 0} deals`);
}
const noPipeline = model.deals.filter((d) => d.categoryId == null).length;
if (noPipeline) console.log(`    ${pad('(no value set)', 34)} ${pad('', 8)} -> ${pad('Nural Custom', 16)} ${noPipeline} deals`);
if (env.leadPipelineField) {
  const tagged = model.leads.filter((l) => l.categoryId).length;
  console.log(`  Leads with a pipeline (${env.leadPipelineField}): ${tagged} of ${model.leads.length}`);
}

console.log('\nLEAD STATUSES (lead Kanban)');
const leadsByStatus = count(model.leads, 'statusId');
for (const s of model.leadStatuses.values()) {
  const cfg = mapping.leadStatuses;
  const where = unmappedStatus.has(s.id) ? 'Unmapped' : cfg.excluded.includes(s.bucket) ? 'excluded from funnel' : cfg.labels[s.bucket];
  console.log(`    ${pad(s.name, 28)} ${pad(s.id, 20)} -> ${pad(where, 22)} ${pad(`${leadsByStatus.get(s.id) || 0} leads`, 10)}${unmappedStatus.has(s.id) ? '  <-- UNMAPPED' : ''}`);
}

console.log('\nLEAD SOURCES');
const leadsBySource = count(raw.leads, 'SOURCE_ID');
for (const s of raw.statuses.filter((x) => x.ENTITY_ID === 'SOURCE')) {
  const shown = normalizeLeadSource(mapping, s.NAME);
  console.log(`    ${pad(s.NAME, 28)} ${pad(s.STATUS_ID, 20)} -> ${pad(shown ?? 'excluded', 22)} ${leadsBySource.get(s.STATUS_ID) || 0} leads`);
}

const { summary } = issues;
console.log('\nSUMMARY');
console.log(`  ${model.kanbans.length} Kanban board(s), ${model.stages.size} deal stages, ${model.categories.length} reporting pipelines, ${model.deals.length} deals, ${model.leads.length} leads`);
console.log(`  Unmapped: ${summary.unmapped} (${summary.affectedDeals} deals, ${summary.affectedLeads} leads)   Pipelines to confirm: ${summary.unconfirmed}`);
if (summary.unmapped + summary.unconfirmed) console.log('  Fix them in the dashboard\'s Data Mapping section (Pipeline admin), or in config/mapping.json.');
else console.log('  Everything maps to a dashboard bar.');
