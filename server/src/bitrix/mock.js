// In-memory stand-in for a Bitrix24 portal, used when BITRIX_WEBHOOK_URL is
// empty. It returns the same raw payload shapes as the real REST API, so the
// whole sync → mapping → metrics → write-back path runs unchanged.

const DAY = 86_400_000;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms) => {
  // Bitrix returns portal-local time with offset; the portal runs on IST.
  const d = new Date(ms + 330 * 60_000);
  return d.toISOString().slice(0, 19) + '+05:30';
};

const CATEGORIES = [
  { ID: '1', NAME: 'Nural Sales - DMS', SORT: 10 },
  { ID: '2', NAME: 'Nural Sales - DMS+SFA', SORT: 20 },
  { ID: '3', NAME: 'Nural Sales - DMS+SFA+ISP', SORT: 30 },
  { ID: '4', NAME: 'Nural Schemes', SORT: 40 },
  { ID: '5', NAME: 'Nural Service', SORT: 50 },
  { ID: '6', NAME: 'Nural Assets', SORT: 60 },
  { ID: '7', NAME: 'Bespoke Development', SORT: 70 },
];

const STAGE_TEMPLATE = [
  ['NEW', 'Proposal/Quote', 'process'],
  ['PREPARATION', 'Revised Proposal Sent', 'process'],
  ['EXECUTING', 'Negotiation', 'process'],
  ['WON', 'Closed Won', 'success'],
  ['LOSE', 'Closed Lost', 'failure'],
];

const WON_IDX = STAGE_TEMPLATE.findIndex(([code]) => code === 'WON');
const LOST_IDX = STAGE_TEMPLATE.findIndex(([code]) => code === 'LOSE');

const LEAD_STATUSES = [
  ['NEW', 'Unassigned', 'process'],
  ['IN_PROCESS', 'In Progress', 'process'],
  ['UC_HOT01', 'Hot', 'process'],
  ['UC_WARM02', 'Warm', 'process'],
  ['UC_COLD03', 'Cold', 'process'],
  ['CONVERTED', 'Lead Completed', 'success'],
  ['JUNK', 'Junk Lead', 'failure'],
  ['UC_LOST04', 'Lost', 'failure'],
];

const SOURCES = [
  ['UC_EXIST', 'Existing Client', 22], ['CALL', 'Call', 16], ['EMAIL', 'E-Mail', 13], ['WEB', 'Website', 11],
  ['UC_COLDC', 'Cold Call', 9], ['UC_DIRREF', 'Director Referral', 7], ['PARTNER', 'External Referral', 4],
  ['UC_WA', "What's App", 3], ['ADVERTISING', 'Advertising', 3], ['RECOMMENDATION', 'Employee Referral', 2],
  ['UC_CHAT', 'ChatBot', 0], ['UC_BREVO', 'Brevo', 0],
];

const USERS = [
  { ID: '11', NAME: 'Ananya', LAST_NAME: 'Rao' },
  { ID: '12', NAME: 'Vikram', LAST_NAME: 'Mehta' },
  { ID: '13', NAME: 'Priya', LAST_NAME: 'Nair' },
  { ID: '14', NAME: 'Rohit', LAST_NAME: 'Kulkarni' },
  { ID: '15', NAME: 'Sana', LAST_NAME: 'Iqbal' },
];

const COMPANIES = [
  'Acme Infra', 'Kiran Textiles', 'Vantage Logistics', 'Orbit Retail', 'Prithvi Builders', 'Sahana Foods',
  'Meridian Pharma', 'Zenith Motors', 'Coastal Beverages', 'Lotus Paints', 'Indus Electricals', 'Tara Cosmetics',
  'Sterling Tyres', 'Nilgiri Dairy', 'Apex Agro', 'Bharat Cables', 'Crescent FMCG', 'Deccan Steel',
  'Everest Spices', 'Falcon Appliances', 'Ganga Mills', 'Horizon Telecom', 'Ivory Ceramics', 'Jaya Footwear',
];
const FIRST = ['Arjun', 'Meera', 'Karan', 'Divya', 'Rahul', 'Sneha', 'Imran', 'Kavya', 'Nikhil', 'Pooja'];
const LAST = ['Sharma', 'Iyer', 'Patel', 'Reddy', 'Gupta', 'Menon', 'Khan', 'Joshi'];
const DEAL_TOPICS = ['DMS Rollout', 'Server Upgrade', 'Renewal', 'Custom Integration', 'POS Rollout', 'SFA Add-on',
  'ISP Expansion', 'Scheme Engine', 'Asset Tracking', 'Service Desk', 'Distributor Onboarding', 'Analytics Pack'];
const LEAD_TOPICS = ['Inbound Enquiry', 'Referral', 'Demo Request', 'Pricing Query', 'Webinar Follow-up', 'Trade Show'];

export function generateMockPortal({ seed = 20261021, now = Date.now(), leadPipelineField } = {}) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const lakh = (lo, hi) => Math.round((lo + r() * (hi - lo)) * 100) * 1000;

  const categories = [{ ID: '0', NAME: 'General', SORT: 0 }, ...CATEGORIES];
  const statuses = [];
  for (const c of categories) {
    const entity = c.ID === '0' ? 'DEAL_STAGE' : `DEAL_STAGE_${c.ID}`;
    STAGE_TEMPLATE.forEach(([code, name, semantics], i) =>
      statuses.push({ ENTITY_ID: entity, STATUS_ID: c.ID === '0' ? code : `C${c.ID}:${code}`, NAME: name,
        SORT: (i + 1) * 10, CATEGORY_ID: c.ID, EXTRA: { SEMANTICS: semantics } }));
  }
  LEAD_STATUSES.forEach(([id, name, semantics], i) =>
    statuses.push({ ENTITY_ID: 'STATUS', STATUS_ID: id, NAME: name, SORT: (i + 1) * 10, EXTRA: { SEMANTICS: semantics } }));
  SOURCES.forEach(([id, name], i) => statuses.push({ ENTITY_ID: 'SOURCE', STATUS_ID: id, NAME: name, SORT: (i + 1) * 10 }));

  // Category weights: Sales-heavy, with a few untagged deals in the default pipeline.
  const catWeights = [['0', 4], ['1', 30], ['2', 12], ['3', 6], ['4', 6], ['5', 8], ['6', 10], ['7', 8]];
  const weightedCat = () => {
    let x = r() * catWeights.reduce((s, [, w]) => s + w, 0);
    for (const [id, w] of catWeights) if ((x -= w) < 0) return id;
    return '1';
  };

  const deals = [];
  for (let i = 1; i <= 140; i++) {
    const cat = weightedCat();
    const created = now - Math.floor(r() * 240) * DAY - Math.floor(r() * DAY);
    const age = (now - created) / DAY;
    // Older deals are more likely to have closed.
    const roll = r();
    let stageIdx;
    if (age > 45 && roll < 0.55) stageIdx = r() < 0.3 ? WON_IDX : LOST_IDX;
    else stageIdx = Math.min(WON_IDX - 1, Math.floor(r() * r() * 4));
    const [code] = STAGE_TEMPLATE[stageIdx];
    const closed = stageIdx >= WON_IDX;
    const moved = closed
      ? created + Math.floor(r() * Math.max(1, age - 1)) * DAY
      : Math.max(created, now - Math.floor(r() * r() * 40) * DAY - Math.floor(r() * DAY));
    const valueMissing = r() < 0.08;
    deals.push({
      ID: String(1000 + i),
      TITLE: `${pick(COMPANIES)} — ${pick(DEAL_TOPICS)}`,
      CATEGORY_ID: cat,
      STAGE_ID: cat === '0' ? code : `C${cat}:${code}`,
      STAGE_SEMANTIC_ID: stageIdx === WON_IDX ? 'S' : stageIdx === LOST_IDX ? 'F' : 'P',
      OPPORTUNITY: valueMissing ? '0.00' : String(lakh(0.8, 30)) + '.00',
      CURRENCY_ID: 'INR',
      DATE_CREATE: iso(created),
      CLOSEDATE: closed ? iso(moved) : iso(created + 60 * DAY),
      MOVED_TIME: iso(moved),
      DATE_MODIFY: iso(moved),
      ASSIGNED_BY_ID: pick(USERS).ID,
      SOURCE_ID: pick(['CALL', 'WEB', 'EMAIL', 'UC_DIRREF', 'UC_COLDC']),
    });
  }

  const sourceBag = SOURCES.flatMap(([id, , w]) => Array(w).fill(id));
  const statusBag = [
    ...Array(6).fill('NEW'), ...Array(9).fill('IN_PROCESS'), ...Array(10).fill('UC_HOT01'),
    ...Array(22).fill('UC_WARM02'), ...Array(30).fill('UC_COLD03'), ...Array(12).fill('CONVERTED'),
    ...Array(5).fill('JUNK'), ...Array(8).fill('UC_LOST04'),
  ];
  const tagCats = ['1', '2', '4', '5', '6', '7'];
  const leads = [];
  for (let i = 1; i <= 190; i++) {
    const status = pick(statusBag);
    const created = now - Math.floor(r() * r() * 220) * DAY - Math.floor(r() * DAY);
    const forward = ['IN_PROCESS', 'UC_HOT01', 'UC_WARM02'].includes(status);
    const lead = {
      ID: String(5000 + i),
      TITLE: `${pick(COMPANIES)} — ${pick(LEAD_TOPICS)}`,
      STATUS_ID: status,
      SOURCE_ID: pick(sourceBag),
      OPPORTUNITY: forward && r() < 0.1 ? '0.00' : String(lakh(0.5, 12)) + '.00',
      CURRENCY_ID: 'INR',
      DATE_CREATE: iso(created),
      DATE_MODIFY: iso(created),
      ASSIGNED_BY_ID: pick(USERS).ID,
      NAME: pick(FIRST),
      LAST_NAME: pick(LAST),
    };
    lead.COMPANY_TITLE = lead.TITLE.split(' — ')[0];
    if (leadPipelineField) lead[leadPipelineField] = r() < 0.75 ? pick(tagCats) : '';
    leads.push(lead);
  }

  addUnmappedExamples({ categories, statuses, deals, leads });

  // Open follow-ups (CRM activities) spread over overdue / today / this week / this month / no date.
  const SUBJECTS = ['Follow up on proposal', 'Share revised quote', 'Demo call', 'Pricing discussion', 'Check decision status'];
  const offsets = [-20, -9, -3, -1, 0, 0, 0, 1, 2, 4, 6, 10, 15, 22, null, null];
  const openDeals = deals.filter((d) => d.STAGE_SEMANTIC_ID === 'P');
  const activeLeads = leads.filter((l) => ['IN_PROCESS', 'UC_HOT01', 'UC_WARM02'].includes(l.STATUS_ID));
  const activities = offsets.map((days, i) => {
    const onDeal = i % 3 === 0;
    const owner = onDeal ? openDeals[i % openDeals.length] : activeLeads[i % activeLeads.length];
    const due = days == null ? '9999-12-31T23:59:59+05:30' : iso(now + days * DAY + (11 + (i % 6)) * 3_600_000 - (now % DAY));
    return {
      ID: String(70000 + i), OWNER_TYPE_ID: onDeal ? '2' : '1', OWNER_ID: owner.ID, PROVIDER_ID: i % 4 === 0 ? 'CRM_TASKS_TASK' : 'CRM_TODO',
      SUBJECT: SUBJECTS[i % SUBJECTS.length], DEADLINE: due, COMPLETED: 'N', RESPONSIBLE_ID: owner.ASSIGNED_BY_ID, LAST_UPDATED: iso(now - DAY),
    };
  });
  return { categories, statuses, deals, leads, activities, users: USERS };
}

/**
 * A real portal always has a few columns the default name rules don't know.
 * These give the dashboard's Data Mapping section something to show in mock mode.
 */
function addUnmappedExamples({ categories, statuses, deals, leads }) {
  statuses.push({ ENTITY_ID: 'DEAL_STAGE_1', STATUS_ID: 'C1:UC_DEMO', NAME: 'Demo Scheduled', SORT: 15, CATEGORY_ID: '1', EXTRA: { SEMANTICS: 'process' } });
  deals.filter((d) => d.STAGE_ID === 'C1:NEW').slice(0, 5).forEach((d) => { d.STAGE_ID = 'C1:UC_DEMO'; });

  statuses.push({ ENTITY_ID: 'STATUS', STATUS_ID: 'UC_FOLLOW', NAME: 'Follow-up Later', SORT: 55, EXTRA: { SEMANTICS: 'process' } });
  leads.filter((l) => l.STATUS_ID === 'UC_COLD03').slice(0, 6).forEach((l) => { l.STATUS_ID = 'UC_FOLLOW'; });

  categories.push({ ID: '8', NAME: 'Partner Channel', SORT: 80 });
  STAGE_TEMPLATE.forEach(([code, name, semantics], i) =>
    statuses.push({ ENTITY_ID: 'DEAL_STAGE_8', STATUS_ID: `C8:${code}`, NAME: name, SORT: (i + 1) * 10, CATEGORY_ID: '8', EXTRA: { SEMANTICS: semantics } }));
  deals.filter((d) => d.CATEGORY_ID === '7').slice(0, 4).forEach((d) => {
    d.CATEGORY_ID = '8';
    d.STAGE_ID = d.STAGE_ID.replace('C7:', 'C8:');
  });
}

/**
 * Simulates a few minutes of CRM activity so every sync in mock mode returns
 * slightly different data, the way a live portal would: new leads arrive,
 * open deals move stage, some close as won or lost, and a new deal appears.
 */
export function simulateActivity(portal, { now = Date.now(), r = Math.random, leadPipelineField } = {}) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const nextId = (rows) => String(Math.max(...rows.map((x) => Number(x.ID))) + 1);
  const stageCode = (catId, code) => (catId === '0' ? code : `C${catId}:${code}`);
  const changes = [];

  for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
    const lead = {
      ID: nextId(portal.leads),
      TITLE: `${pick(COMPANIES)} — ${pick(LEAD_TOPICS)}`,
      STATUS_ID: pick(['IN_PROCESS', 'UC_HOT01', 'UC_WARM02', 'UC_WARM02', 'NEW']),
      SOURCE_ID: pick(['CALL', 'WEB', 'EMAIL', 'UC_DIRREF', 'UC_COLDC']),
      OPPORTUNITY: r() < 0.3 ? '0.00' : `${Math.round((0.5 + r() * 8) * 100) * 1000}.00`,
      CURRENCY_ID: 'INR',
      DATE_CREATE: iso(now),
      DATE_MODIFY: iso(now),
      ASSIGNED_BY_ID: pick(USERS).ID,
    };
    if (leadPipelineField) lead[leadPipelineField] = pick(['1', '2', '5', '6', '']);
    portal.leads.push(lead);
    changes.push(`new lead ${lead.ID}`);
  }

  const open = portal.deals.filter((d) => d.STAGE_SEMANTIC_ID === 'P');
  for (let i = 0, n = 1 + Math.floor(r() * 2); i < n && open.length; i++) {
    const deal = open.splice(Math.floor(r() * open.length), 1)[0];
    const idx = STAGE_TEMPLATE.findIndex(([code]) => deal.STAGE_ID.endsWith(code));
    const closing = idx >= WON_IDX - 1 || r() < 0.25;
    const target = closing ? (r() < 0.45 ? WON_IDX : LOST_IDX) : idx + 1;
    deal.STAGE_ID = stageCode(deal.CATEGORY_ID, STAGE_TEMPLATE[target][0]);
    deal.STAGE_SEMANTIC_ID = target === WON_IDX ? 'S' : target === LOST_IDX ? 'F' : 'P';
    deal.MOVED_TIME = iso(now);
    deal.DATE_MODIFY = iso(now);
    if (closing) deal.CLOSEDATE = iso(now);
    changes.push(`deal ${deal.ID} → ${STAGE_TEMPLATE[target][1]}`);
  }

  if (r() < 0.6) {
    const cat = pick(['1', '1', '2', '4', '5', '6', '7']);
    const deal = {
      ID: nextId(portal.deals),
      TITLE: `${pick(COMPANIES)} — ${pick(DEAL_TOPICS)}`,
      CATEGORY_ID: cat,
      STAGE_ID: stageCode(cat, 'NEW'),
      STAGE_SEMANTIC_ID: 'P',
      OPPORTUNITY: `${Math.round((1 + r() * 20) * 100) * 1000}.00`,
      CURRENCY_ID: 'INR',
      DATE_CREATE: iso(now),
      CLOSEDATE: iso(now + 60 * DAY),
      MOVED_TIME: iso(now),
      DATE_MODIFY: iso(now),
      ASSIGNED_BY_ID: pick(USERS).ID,
    };
    portal.deals.push(deal);
    changes.push(`new deal ${deal.ID}`);
  }
  return changes;
}

export function createMockClient(opts = {}) {
  const portal = generateMockPortal(opts);
  const byId = (rows, id) => rows.find((x) => String(x.ID) === String(id));
  const log = opts.log ?? console;
  // Simulated activity at most this often, however frequently the server polls.
  const ACTIVITY_EVERY_MS = 30_000;
  let lastActivityAt = Date.now();

  const read = {
    'crm.dealcategory.list': () => portal.categories.filter((c) => c.ID !== '0'),
    'crm.dealcategory.default.get': () => ({ ID: '0', NAME: portal.categories[0].NAME }),
    'crm.status.list': () => portal.statuses,
    // crm.deal.list is read once per sync; mimic live activity between reads.
    'crm.deal.list': () => {
      if (opts.simulateActivity !== false && Date.now() - lastActivityAt >= ACTIVITY_EVERY_MS) {
        lastActivityAt = Date.now();
        const changes = simulateActivity(portal, { leadPipelineField: opts.leadPipelineField });
        log.info?.(`[mock] simulated CRM activity: ${changes.join(', ')}`);
      }
      return portal.deals;
    },
    'crm.lead.list': () => portal.leads,
    'user.get': () => portal.users,
    'crm.activity.list': () => portal.activities,
    'crm.company.list': () => [],
    'crm.contact.list': (p) => (portal.contacts ??= []).filter((c) =>
      Object.entries(p.filter ?? {}).every(([k, v]) => (Array.isArray(v) ? v.map(String).includes(String(c[k])) : String(c[k] ?? '').toLowerCase() === String(v).toLowerCase()))),
  };

  async function call(method, params = {}) {
    if (read[method]) {
      let rows = read[method](params);
      const since = params.filter?.[">DATE_MODIFY"];
      if (since && Array.isArray(rows)) rows = rows.filter((x) => Date.parse(x.DATE_MODIFY) > Date.parse(since));
      return structuredClone(rows);
    }
    if (method === 'crm.deal.update' || method === 'crm.lead.update') {
      const rows = method === 'crm.deal.update' ? portal.deals : portal.leads;
      const row = byId(rows, params.id);
      if (!row) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
      Object.assign(row, params.fields, { DATE_MODIFY: iso(Date.now()) });
      return true;
    }
    if (method === 'crm.contact.add') {
      const contacts = (portal.contacts ??= []);
      const id = String(9000 + contacts.length + 1);
      contacts.push({ ID: id, ...params.fields });
      return Number(id);
    }
    if (method === 'crm.item.update') {
      const row = byId(portal.deals, params.id);
      if (!row) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
      const f = params.fields;
      if (f.categoryId != null) row.CATEGORY_ID = String(f.categoryId);
      if (f.stageId != null) { row.STAGE_ID = f.stageId; row.MOVED_TIME = iso(Date.now()); }
      if (f.opportunity != null) row.OPPORTUNITY = String(f.opportunity);
      if (f.currencyId != null) row.CURRENCY_ID = f.currencyId;
      row.DATE_MODIFY = iso(Date.now());
      return { item: { id: Number(row.ID) } };
    }
    throw new Error(`Mock Bitrix: method ${method} not implemented`);
  }

  return {
    mode: 'mock',
    call,
    listAll: (method, params) => call(method, params),
    batch: async (cmd) => {
      const out = {};
      for (const [k, q] of Object.entries(cmd)) out[k] = await call(q.split('?')[0]);
      return out;
    },
  };
}
