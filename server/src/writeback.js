// FR-7 outbound write-back: set pipeline and/or potential value on a deal or
// lead in Bitrix24, then patch the cache only after Bitrix confirms (no
// optimistic success). SRS §6.2 / §6.4.

import { writeAudit } from './audit.js';
import { leadPipelineMaps } from './normalize.js';
import { suggestCustomer } from './customerMatch.js';

export class WriteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseInput(body, model) {
  const out = {};
  if (body.value != null && body.value !== '') {
    const value = Number(body.value);
    if (!Number.isFinite(value) || value <= 0) throw new WriteError(400, 'Potential value must be a positive number');
    out.value = Math.round(value * 100) / 100;
  }
  if (body.categoryId != null && body.categoryId !== '') {
    const categoryId = String(body.categoryId);
    if (!model.categories.some((c) => c.id === categoryId)) throw new WriteError(400, `Unknown pipeline ${categoryId}`);
    out.categoryId = categoryId;
  }
  if (out.value == null && out.categoryId == null) throw new WriteError(400, 'Choose a pipeline or enter a potential value');
  return out;
}

/** First in-process stage of a category — Bitrix rejects a category move without a valid stage. */
function entryStage(model, categoryId) {
  return [...model.stages.values()]
    .filter((s) => s.categoryId === categoryId && s.semantic === 'P')
    .sort((a, b) => a.sort - b.sort)[0];
}

export async function updateDeal({ client, sync, env, user, id, body }) {
  const model = sync.model;
  const raw = sync.rawRecord('deal', id);
  if (!raw) throw new WriteError(404, `Deal ${id} not found`);
  const input = parseInput(body, model);
  const currency = raw.CURRENCY_ID || sync.mapping.currencyId;
  const pipelineField = model.fieldMode ? env.dealPipelineField : null;
  const current = pipelineField ? String((Array.isArray(raw[pipelineField]) ? raw[pipelineField][0] : raw[pipelineField]) ?? '') : String(raw.CATEGORY_ID);
  const moving = input.categoryId != null && input.categoryId !== current;
  const patch = {};

  if (moving && pipelineField) {
    // Pipeline is a list field (e.g. "Product"): one plain update, the deal stays in its Kanban column.
    const fields = { [pipelineField]: input.categoryId };
    if (input.value != null) Object.assign(fields, { OPPORTUNITY: input.value, CURRENCY_ID: currency });
    await client.call('crm.deal.update', { id: Number(id), fields });
    patch[pipelineField] = input.categoryId;
  } else if (moving) {
    const stage = entryStage(model, input.categoryId);
    if (!stage) throw new WriteError(409, 'Target pipeline has no open stage to move the deal into');
    // CATEGORY_ID cannot be changed through crm.deal.update; crm.item.update moves it.
    const fields = { categoryId: Number(input.categoryId), stageId: stage.id };
    if (input.value != null) Object.assign(fields, { opportunity: input.value, currencyId: currency });
    await client.call('crm.item.update', { entityTypeId: 2, id: Number(id), fields });
    Object.assign(patch, { CATEGORY_ID: input.categoryId, STAGE_ID: stage.id, STAGE_SEMANTIC_ID: 'P', MOVED_TIME: new Date().toISOString() });
  } else if (input.value != null) {
    await client.call('crm.deal.update', { id: Number(id), fields: { OPPORTUNITY: input.value, CURRENCY_ID: currency } });
  }
  if (input.value != null) Object.assign(patch, { OPPORTUNITY: String(input.value), CURRENCY_ID: currency });

  writeAudit({
    user: user.name,
    entity: 'deal',
    id,
    old: pipelineField
      ? { [pipelineField]: raw[pipelineField] ?? null, OPPORTUNITY: raw.OPPORTUNITY }
      : { CATEGORY_ID: raw.CATEGORY_ID, STAGE_ID: raw.STAGE_ID, OPPORTUNITY: raw.OPPORTUNITY },
    new: patch,
  });
  sync.patchRaw('deal', id, patch);
  return { ok: true };
}

export async function updateLead({ client, sync, env, user, id, body }) {
  const raw = sync.rawRecord('lead', id);
  if (!raw) throw new WriteError(404, `Lead ${id} not found`);
  const input = parseInput(body, sync.model);
  const field = env.leadPipelineField;
  if (input.categoryId != null && !field) {
    // SRS §6.5 open item 4 — the lead pipeline mechanism is not decided yet.
    throw new WriteError(409, 'Lead pipeline tagging is not configured yet (set LEAD_PIPELINE_FIELD)');
  }
  const fields = {};
  if (input.categoryId != null && sync.model.fieldMode) {
    // Lead and deal "Product" fields have separate option IDs; match the option by name.
    const name = sync.model.categories.find((c) => c.id === input.categoryId)?.name;
    const option = leadPipelineMaps(sync.raw).toLeadOption(input.categoryId, name);
    if (!option) throw new WriteError(409, `The lead field has no "${name}" option to select`);
    fields[field] = option;
  } else if (input.categoryId != null) {
    fields[field] = input.categoryId;
  }
  if (input.value != null) Object.assign(fields, { OPPORTUNITY: String(input.value), CURRENCY_ID: raw.CURRENCY_ID || sync.mapping.currencyId });

  await client.call('crm.lead.update', { id: Number(id), fields });

  writeAudit({
    user: user.name,
    entity: 'lead',
    id,
    old: { ...(field ? { [field]: raw[field] ?? null } : {}), OPPORTUNITY: raw.OPPORTUNITY },
    new: fields,
  });
  sync.patchRaw('lead', id, fields);
  return { ok: true };
}

/**
 * Error List "Apply": give a deal with no customer the person from its lead.
 * Reuses a Contact with the same name if one exists, otherwise creates it
 * (copying the lead's phone/email), then links it to the deal.
 */
export async function applyDealCustomer({ client, sync, user, id, body }) {
  const deal = sync.model.deals.find((d) => d.id === String(id));
  if (!deal) throw new WriteError(404, `Deal ${id} not found`);
  if (deal.customer) throw new WriteError(409, `Deal ${id} already has a customer (${deal.customer})`);
  const suggestion = suggestCustomer(deal, sync.model);
  // The admin confirmed a specific lead; refuse if the data moved on since the list was loaded.
  if (!suggestion || suggestion.leadId !== String(body.leadId ?? '')) {
    throw new WriteError(409, 'The suggested customer has changed — reload the Error List and check again');
  }
  if (suggestion.fromTitle) {
    throw new WriteError(409, `"${suggestion.name}" is only in lead #${suggestion.leadId}'s title — add the customer to the deal in Bitrix24`);
  }
  const lead = sync.rawRecord('lead', suggestion.leadId);
  const rawDeal = sync.rawRecord('deal', id);
  const name = { NAME: String(lead.NAME ?? '').trim(), LAST_NAME: String(lead.LAST_NAME ?? '').trim() };
  const multi = (items) => (Array.isArray(items) ? items.filter((i) => i?.VALUE).map((i) => ({ VALUE: i.VALUE, VALUE_TYPE: i.VALUE_TYPE || 'WORK' })) : []);

  const nameFilter = Object.fromEntries(Object.entries(name).filter(([, v]) => v));
  const existing = await client.listAll('crm.contact.list', { filter: nameFilter, select: ['ID', 'NAME', 'LAST_NAME'] });
  let contactId;
  let created = false;
  if (existing.length === 1) {
    contactId = String(existing[0].ID);
  } else {
    const fields = {
      ...name,
      PHONE: multi(lead.PHONE),
      EMAIL: multi(lead.EMAIL),
      ASSIGNED_BY_ID: rawDeal.ASSIGNED_BY_ID,
      SOURCE_ID: lead.SOURCE_ID,
      SOURCE_DESCRIPTION: `From lead #${suggestion.leadId} via Nural CRM Insights`,
    };
    contactId = String(await client.call('crm.contact.add', { fields }));
    created = true;
  }

  try {
    await client.call('crm.deal.update', { id: Number(id), fields: { CONTACT_ID: contactId } });
  } catch (err) {
    throw new WriteError(502, created
      ? `Contact #${contactId} was created but could not be linked to the deal: ${err.message}`
      : `Could not link contact #${contactId} to the deal: ${err.message}`);
  }

  writeAudit({
    user: user.name,
    entity: 'deal',
    id,
    old: { CONTACT_ID: rawDeal.CONTACT_ID ?? null },
    new: { CONTACT_ID: contactId, contact: `${name.NAME} ${name.LAST_NAME}`.trim(), contactCreated: created, fromLead: suggestion.leadId },
  });
  sync.upsertRaw('contacts', { ID: contactId, ...name });
  sync.patchRaw('deal', id, { CONTACT_ID: contactId });
  return { ok: true, contactId, created };
}
