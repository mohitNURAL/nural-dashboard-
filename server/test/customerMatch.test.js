import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { companyKey, suggestCustomer } from '../src/customerMatch.js';

// Keep the audit log out of the real server/data.
process.env.NURAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nural-cust-'));
const { applyDealCustomer } = await import('../src/writeback.js');

const DAY = 86_400_000;
const lead = (id, company, personName, bucket = 'warm', daysAgo = 10, titleName = null) =>
  ({ id, company, title: company, personName, titleName, bucket, createdAt: Date.now() - daysAgo * DAY });

const model = {
  leads: [
    lead('4626', 'Europa Locks', 'Hiren Vyas', 'unassigned', 5),
    lead('6280', 'Europa Locks', 'Gopal Narwade', 'converted', 30),
    lead('4754', 'Reicuri Private Limited', 'Shrikanth Rao'),
    lead('6342', 'Grundfos Pumps India Private Ltd.', null, 'converted'),
    lead('7001', 'Linked Co', 'Linked Person'),
    lead('6388', 'Auroglobal Comtrade Pvt. Ltd.', null, 'warm', 89, 'Rahul Sharma'), // name only in the title
  ],
};
const deal = (id, company, leadId = null) => ({ id, company, leadId, customer: null });

test('company names match across legal suffixes and punctuation', () => {
  assert.equal(companyKey('Reicuri Pvt. Ltd.'), companyKey('Reicuri Private Limited'));
  assert.equal(companyKey('Grundfos Pumps India Private Ltd.'), 'grundfospumps');
  assert.notEqual(companyKey('Europa Locks'), companyKey('Europa Lock Systems'));
});

test('suggestion prefers the linked lead, then the converted lead, then the newest', () => {
  assert.deepEqual(suggestCustomer(deal('1', 'Anything', '7001'), model), { leadId: '7001', name: 'Linked Person', reason: 'linked lead', alternatives: 0, fromTitle: false });
  // Europa Locks: converted lead wins over a newer unassigned one; the other name is reported.
  assert.deepEqual(suggestCustomer(deal('10', 'Europa Locks'), model), { leadId: '6280', name: 'Gopal Narwade', reason: 'same company', alternatives: 1, fromTitle: false });
  assert.equal(suggestCustomer(deal('22', 'Reicuri Pvt. Ltd.', '6340'), model).name, 'Shrikanth Rao'); // linked lead deleted
  assert.equal(suggestCustomer(deal('40', 'Grundfos Pumps India Private Ltd.', '6342'), model), null); // lead has no name
  assert.equal(suggestCustomer(deal('94', 'IceWarp Technologies Pvt Ltd'), model), null);
  // A name only in a lead title is still offered — flagged so it is never applied.
  assert.deepEqual(suggestCustomer(deal('96', 'Auroglobal Comtrade Pvt. Ltd.'), model),
    { leadId: '6388', name: 'Rahul Sharma', reason: 'same company', alternatives: 0, fromTitle: true });
});

test('Apply refuses a name that only comes from a lead title', async () => {
  const sync = { model: { deals: [{ ...deal('96', 'Auroglobal Comtrade Pvt. Ltd.') }], leads: model.leads }, rawRecord: () => ({}) };
  const calls = [];
  const client = { listAll: async (...a) => { calls.push(a); return []; }, call: async (...a) => { calls.push(a); } };
  await assert.rejects(applyDealCustomer({ client, sync, user: { name: 'Deepak' }, id: '96', body: { leadId: '6388' } }), /only in lead #6388.s title/);
  assert.equal(calls.length, 0);
});

function fixture({ existingContacts = [] } = {}) {
  const calls = [];
  const raw = {
    deal: { 10: { ID: '10', ASSIGNED_BY_ID: '7', CONTACT_ID: null } },
    lead: { 6280: { ID: '6280', NAME: 'Gopal', LAST_NAME: 'Narwade', SOURCE_ID: 'WEB', PHONE: [{ VALUE: '+91 98', VALUE_TYPE: 'WORK' }], EMAIL: [] } },
  };
  const patched = [];
  const sync = {
    model: { deals: [{ ...deal('10', 'Europa Locks'), id: '10' }], leads: model.leads },
    rawRecord: (entity, id) => raw[entity][id],
    upsertRaw: (c, row) => patched.push([c, row]),
    patchRaw: (e, id, fields) => patched.push([e, id, fields]),
  };
  const client = {
    listAll: async (m, p) => { calls.push([m, p]); return existingContacts; },
    call: async (m, p) => { calls.push([m, p]); return m === 'crm.contact.add' ? 555 : true; },
  };
  return { calls, patched, sync, client };
}

test('Apply creates a contact from the lead and links it to the deal', async () => {
  const { calls, patched, sync, client } = fixture();
  const res = await applyDealCustomer({ client, sync, user: { name: 'Deepak' }, id: '10', body: { leadId: '6280' } });
  assert.deepEqual(res, { ok: true, contactId: '555', created: true });
  const add = calls.find(([m]) => m === 'crm.contact.add')[1].fields;
  assert.deepEqual([add.NAME, add.LAST_NAME, add.ASSIGNED_BY_ID, add.PHONE], ['Gopal', 'Narwade', '7', [{ VALUE: '+91 98', VALUE_TYPE: 'WORK' }]]);
  assert.deepEqual(calls.at(-1), ['crm.deal.update', { id: 10, fields: { CONTACT_ID: '555' } }]);
  assert.deepEqual(patched.at(-1), ['deal', '10', { CONTACT_ID: '555' }]);
});

test('Apply reuses an existing contact with the same name instead of duplicating', async () => {
  const { calls, sync, client } = fixture({ existingContacts: [{ ID: '321', NAME: 'Gopal', LAST_NAME: 'Narwade' }] });
  const res = await applyDealCustomer({ client, sync, user: { name: 'Deepak' }, id: '10', body: { leadId: '6280' } });
  assert.deepEqual(res, { ok: true, contactId: '321', created: false });
  assert.ok(!calls.some(([m]) => m === 'crm.contact.add'));
});

test('Apply refuses a stale suggestion and writes nothing', async () => {
  const { calls, sync, client } = fixture();
  await assert.rejects(
    applyDealCustomer({ client, sync, user: { name: 'Deepak' }, id: '10', body: { leadId: '4626' } }),
    /suggested customer has changed/,
  );
  assert.equal(calls.length, 0);
});
