// Pulls everything the dashboard needs from Bitrix24 (SRS §5.2). Only the
// fields listed here leave Bitrix — the data dictionary in SRS §6 is the source.

export const DEAL_FIELDS = [
  'ID', 'TITLE', 'CATEGORY_ID', 'STAGE_ID', 'STAGE_SEMANTIC_ID', 'OPPORTUNITY', 'CURRENCY_ID',
  'DATE_CREATE', 'DATE_MODIFY', 'CLOSEDATE', 'MOVED_TIME', 'ASSIGNED_BY_ID',
  // Client details for the drill-down lists.
  'SOURCE_ID', 'COMPANY_ID', 'CONTACT_ID', 'LEAD_ID',
];

export const LEAD_FIELDS = [
  'ID', 'TITLE', 'STATUS_ID', 'SOURCE_ID', 'OPPORTUNITY', 'CURRENCY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'ASSIGNED_BY_ID',
  'NAME', 'LAST_NAME', 'COMPANY_TITLE', 'COMPANY_ID', 'CONTACT_ID',
  // Copied onto a Contact when a deal's customer is taken from its lead.
  'PHONE', 'EMAIL',
];

// Open follow-ups: CRM activities (to-dos, tasks, calls, meetings) on leads (1) and deals (2).
export const ACTIVITY_FIELDS = [
  'ID', 'OWNER_TYPE_ID', 'OWNER_ID', 'PROVIDER_ID', 'SUBJECT', 'DEADLINE', 'COMPLETED', 'RESPONSIBLE_ID', 'LAST_UPDATED',
];
const ACTIVITY_OWNERS = [1, 2];

const withField = (fields, extra) => (extra ? [...fields, extra] : fields);
const dealSelect = (env) => withField(DEAL_FIELDS, env.dealPipelineField);
const leadSelect = (env) => withField(LEAD_FIELDS, env.leadPipelineField);

async function fetchUsers(client, rows, known = new Set()) {
  const ids = [...new Set(rows.map((r) => String(r.ASSIGNED_BY_ID ?? r.RESPONSIBLE_ID ?? '')).filter((id) => id && !known.has(id)))];
  return ids.length ? client.listAll('user.get', { FILTER: { ID: ids } }) : [];
}

const ID_CHUNK = 50;
const linkedIds = (rows, field, known) =>
  [...new Set(rows.map((r) => String(r[field] ?? '')).filter((id) => id && id !== '0' && !known.has(id)))];

/** Companies and contacts referenced by deals/leads (deleted ones simply don't come back). */
async function fetchParties(client, rows, known = { companies: new Set(), contacts: new Set() }) {
  const byIds = async (method, ids, select) => {
    const out = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(...await client.listAll(method, { filter: { ID: ids.slice(i, i + ID_CHUNK) }, select }));
    return out;
  };
  return {
    companies: await byIds('crm.company.list', linkedIds(rows, 'COMPANY_ID', known.companies), ['ID', 'TITLE']),
    contacts: await byIds('crm.contact.list', linkedIds(rows, 'CONTACT_ID', known.contacts), ['ID', 'NAME', 'LAST_NAME']),
  };
}

const listItems = (fields, code) => (fields?.[code]?.items ?? []).map((i) => ({ ID: String(i.ID), VALUE: i.VALUE }));

/** Full pull: reference lists plus every deal and lead. */
export async function fetchRaw(client, env) {
  // Small reference lists first, in one round trip.
  const ref = await client.batch({
    categories: 'crm.dealcategory.list?' + 'order[SORT]=ASC',
    defaultCategory: 'crm.dealcategory.default.get',
    ...(env.dealPipelineField ? { dealFields: 'crm.deal.fields', leadFields: 'crm.lead.fields' } : {}),
  });

  const statuses = await client.listAll('crm.status.list', { order: { SORT: 'ASC' } });
  const deals = await client.listAll('crm.deal.list', { order: { ID: 'ASC' }, select: dealSelect(env) });
  const leads = await client.listAll('crm.lead.list', { order: { ID: 'ASC' }, select: leadSelect(env) });
  const activities = await client.listAll('crm.activity.list', {
    order: { ID: 'ASC' }, filter: { COMPLETED: 'N', OWNER_TYPE_ID: ACTIVITY_OWNERS }, select: ACTIVITY_FIELDS,
  });
  const users = await fetchUsers(client, [...deals, ...leads, ...activities]);
  const { companies, contacts } = await fetchParties(client, [...deals, ...leads]);

  const defaultCategory = ref.defaultCategory ?? { NAME: 'General' };
  // Kanban boards (Bitrix deal pipelines): each has its own stage columns.
  const kanbans = [{ ID: '0', NAME: defaultCategory.NAME, SORT: 0 }, ...(ref.categories ?? [])];

  // Reporting pipelines: the Kanban boards themselves, or the options of a list
  // field such as "Product" when the portal tracks product lines that way.
  const pipelineField = env.dealPipelineField
    ? {
        deal: listItems(ref.dealFields, env.dealPipelineField),
        lead: env.leadPipelineField ? listItems(ref.leadFields, env.leadPipelineField) : [],
      }
    : null;
  if (pipelineField && !pipelineField.deal.length) {
    throw new Error(`DEAL_PIPELINE_FIELD ${env.dealPipelineField} is not a list field on deals`);
  }
  const categories = pipelineField
    ? pipelineField.deal.map((i, n) => ({ ID: i.ID, NAME: i.VALUE, SORT: n }))
    : kanbans;

  return { kanbans, categories, pipelineField, statuses, deals, leads, activities, users, companies, contacts };
}

/**
 * Quick pull: only deals and leads modified after `since` (ISO string).
 * Two small list calls per run, so it can poll every few seconds within the
 * REST rate limit. Deletions are picked up by the next full pull.
 */
export async function fetchChanges(client, env, since, knownUserIds, knownParties) {
  const filter = { '>DATE_MODIFY': since };
  const deals = await client.listAll('crm.deal.list', { order: { ID: 'ASC' }, filter, select: dealSelect(env) });
  const leads = await client.listAll('crm.lead.list', { order: { ID: 'ASC' }, filter, select: leadSelect(env) });
  // Any activity touched since the last check — including ones just completed, so they drop out.
  const activities = await client.listAll('crm.activity.list', {
    order: { ID: 'ASC' }, filter: { '>LAST_UPDATED': since, OWNER_TYPE_ID: ACTIVITY_OWNERS }, select: ACTIVITY_FIELDS,
  });
  const users = await fetchUsers(client, [...deals, ...leads, ...activities], knownUserIds);
  const { companies, contacts } = await fetchParties(client, [...deals, ...leads], knownParties);
  return { deals, leads, activities, users, companies, contacts };
}
