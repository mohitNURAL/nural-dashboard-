import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMockClient, generateMockPortal, simulateActivity } from '../src/bitrix/mock.js';
import { fetchChanges } from '../src/bitrix/fetch.js';

const env = { leadPipelineField: 'UF_TAG', quickSyncSeconds: 15, syncIntervalMinutes: 10 };
const quiet = { info() {}, warn() {}, error() {} };

test('mock portal has no Purchase Order stage', () => {
  const portal = generateMockPortal({ leadPipelineField: 'UF_TAG' });
  assert.ok(!portal.statuses.some((s) => /purchase order/i.test(s.NAME)));
});

test('simulated activity stamps DATE_MODIFY so quick sync can find it', () => {
  const portal = generateMockPortal({ leadPipelineField: 'UF_TAG' });
  const now = Date.now();
  const before = { deals: portal.deals.length, leads: portal.leads.length };
  const changes = simulateActivity(portal, { now, leadPipelineField: 'UF_TAG' });
  assert.ok(changes.length >= 2);
  assert.ok(portal.leads.length > before.leads);
  const touched = [...portal.deals, ...portal.leads].filter((r) => Date.parse(r.DATE_MODIFY) >= now - 1000);
  assert.equal(touched.length, changes.length);
});

test('fetchChanges returns only records modified after the cursor', async () => {
  const client = createMockClient({ leadPipelineField: 'UF_TAG', simulateActivity: false, log: quiet });
  // Bitrix (and the mock) store DATE_MODIFY to the second, hence the margin.
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.deepEqual((await fetchChanges(client, env, future, new Set())).deals, []);
  const since = new Date(Date.now() - 2000).toISOString();
  const before = (await fetchChanges(client, env, since, new Set())).deals.map((d) => d.ID);
  assert.ok(!before.includes('1001'));
  await client.call('crm.deal.update', { id: 1001, fields: { OPPORTUNITY: '123000.00' } });
  const delta = await fetchChanges(client, env, since, new Set());
  assert.ok(delta.deals.some((d) => d.ID === '1001' && d.OPPORTUNITY === '123000.00'));
});

test('quick sync merges changes, bumps version only on real change, notifies subscribers', async (t) => {
  // Keep the cache file out of the real server/data (config reads this at import).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nural-sync-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  process.env.NURAL_DATA_DIR = tmp;
  const { createSyncService } = await import('../src/sync.js');
  const client = createMockClient({ leadPipelineField: 'UF_TAG', simulateActivity: false, log: quiet });
  const sync = createSyncService({ client, env, log: quiet });
  const events = [];
  sync.subscribe((s) => events.push(s));

  await sync.syncNow();
  const v1 = sync.status().version;
  const deal = sync.model.deals.find((d) => d.id === '1002');

  await sync.quickSync(); // nothing changed in the portal
  assert.equal(sync.status().version, v1);

  await new Promise((r) => setTimeout(r, 5));
  await client.call('crm.deal.update', { id: 1002, fields: { OPPORTUNITY: String(deal.opportunity + 100000) } });
  await sync.quickSync();
  assert.equal(sync.status().version, v1 + 1);
  assert.equal(sync.model.deals.find((d) => d.id === '1002').opportunity, deal.opportunity + 100000);
  assert.ok(events.length >= 3);
  assert.equal(events.at(-1).version, v1 + 1);
  sync.stop();
});

test('a source deleted in Bitrix24 keeps its last known name on the next full sync', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nural-src-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  process.env.NURAL_DATA_DIR = tmp;
  const { createSyncService } = await import('../src/sync.js');

  // Minimal portal whose source list loses "Direct Lead" between syncs.
  let sources = [{ ENTITY_ID: 'SOURCE', STATUS_ID: 'S1', NAME: 'Direct Lead' }, { ENTITY_ID: 'SOURCE', STATUS_ID: 'S2', NAME: 'Cold Call' }];
  const lists = {
    'crm.status.list': () => [...sources, { ENTITY_ID: 'STATUS', STATUS_ID: 'UC_HOT', NAME: 'Hot' }],
    'crm.deal.list': () => [],
    'crm.lead.list': () => [{ ID: '1', STATUS_ID: 'UC_HOT', SOURCE_ID: 'S1', DATE_CREATE: new Date().toISOString() }],
    'crm.activity.list': () => [],
    'user.get': () => [],
  };
  const client = {
    mode: 'fake',
    batch: async () => ({ categories: [], defaultCategory: { NAME: 'General' } }),
    listAll: async (m) => structuredClone(lists[m]()),
    call: async () => null,
  };
  const sync = createSyncService({ client, env: { ...env, leadPipelineField: '' }, log: quiet });
  await sync.syncNow();
  assert.equal(sync.model.leads[0].source, 'Direct Lead');
  sources = sources.filter((s) => s.STATUS_ID !== 'S1'); // deleted in Bitrix24
  await sync.syncNow();
  assert.equal(sync.model.leads[0].source, 'Direct Lead');
  sync.stop();
});
