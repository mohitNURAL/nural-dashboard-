import { dealStageBucket, familyForCategory, leadStatusBucket, normalizeLeadSource, stageProbability } from './mapping.js';

const ts = (v) => {
  if (!v) return null;
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
};
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const ACTIVITY_KINDS = {
  CRM_TODO: 'To-do', CRM_TASKS_TASK: 'Task', VOXIMPLANT_CALL: 'Call', CRM_CALL_TRACKER: 'Call',
  CRM_MEETING: 'Meeting', CRM_EMAIL: 'Email', CRM_SMS: 'SMS',
};
const SEMANTIC_CODES = { process: 'P', success: 'S', failure: 'F', P: 'P', S: 'S', F: 'F' };
/** Trims and drops placeholder values such as "." left by imports. */
const clean = (s) => {
  const v = String(s ?? '').trim();
  return /^[.\-\s]*$/.test(v) ? '' : v;
};
const personName = (p) => (p ? [clean(p.NAME), clean(p.LAST_NAME)].filter(Boolean).join(' ') : '');
const nameKey = (s) => String(s ?? '').trim().toLowerCase();
/** List-field values arrive as an option ID (or an array of them for multi-select fields). */
const firstValue = (v) => String((Array.isArray(v) ? v[0] : v) ?? '').trim();

/**
 * In field mode deals and leads carry the pipeline in their own list fields,
 * whose option IDs differ. Leads are matched to the deal option by name.
 */
export function leadPipelineMaps(raw) {
  const dealIdByName = new Map((raw.pipelineField?.deal ?? []).map((i) => [nameKey(i.VALUE), i.ID]));
  const leadOptions = raw.pipelineField?.lead ?? [];
  return {
    toCategory: new Map(leadOptions.map((i) => [i.ID, dealIdByName.get(nameKey(i.VALUE))]).filter(([, id]) => id)),
    toLeadOption: (categoryId, categoryName) => leadOptions.find((i) => nameKey(i.VALUE) === nameKey(categoryName))?.ID ?? null,
  };
}

/** Raw Bitrix payloads → the model every metric is computed from. */
export function normalize(raw, mapping, { dealPipelineField, leadPipelineField } = {}) {
  const pf = mapping.pipelineFamilies;
  const fieldMode = Boolean(raw.pipelineField && dealPipelineField);
  const leadMaps = leadPipelineMaps(raw);

  const categories = raw.categories.map((c) => {
    const id = String(c.ID);
    const family = familyForCategory(mapping, c.NAME, id);
    return {
      id,
      name: c.NAME,
      family,
      sort: num(c.SORT),
      untagged: !fieldMode && pf.untaggedCategoryIds.includes(id) && family === 'custom',
    };
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  // Kanban boards (Bitrix deal pipelines) — the boards whose columns are the stages.
  const kanbans = (raw.kanbans ?? raw.categories).map((c) => ({ id: String(c.ID), name: c.NAME }));

  const stages = new Map();
  const leadStatuses = new Map();
  const sources = new Map();
  for (const s of raw.statuses) {
    const entity = String(s.ENTITY_ID);
    if (entity === 'DEAL_STAGE' || entity.startsWith('DEAL_STAGE_')) {
      const categoryId = entity === 'DEAL_STAGE' ? '0' : entity.slice('DEAL_STAGE_'.length);
      const semantic = SEMANTIC_CODES[s.EXTRA?.SEMANTICS ?? s.SEMANTICS] ?? 'P';
      stages.set(s.STATUS_ID, { id: s.STATUS_ID, name: s.NAME, categoryId, semantic, sort: num(s.SORT) });
    } else if (entity === 'STATUS') {
      leadStatuses.set(s.STATUS_ID, { id: s.STATUS_ID, name: s.NAME, bucket: leadStatusBucket(mapping, { statusId: s.STATUS_ID, name: s.NAME }) });
    } else if (entity === 'SOURCE') {
      sources.set(s.STATUS_ID, s.NAME);
    }
  }

  const users = new Map(raw.users.map((u) => [String(u.ID), [u.NAME, u.LAST_NAME].filter(Boolean).join(' ') || `User ${u.ID}`]));
  const ownerOf = (r) => users.get(String(r.ASSIGNED_BY_ID)) ?? (r.ASSIGNED_BY_ID ? `User ${r.ASSIGNED_BY_ID}` : 'Unassigned');
  const sourceLabel = (id) => (id ? sources.get(id) ?? raw.sourceNames?.[id] ?? id : null);

  // Client details for drill-down lists. Linked company/contact records win;
  // otherwise deals fall back to their title (the company) and the lead they came from.
  const companies = new Map((raw.companies ?? []).map((c) => [String(c.ID), c.TITLE]));
  const contacts = new Map((raw.contacts ?? []).map((c) => [String(c.ID), personName(c)]));
  const rawLeads = new Map(raw.leads.map((l) => [String(l.ID), l]));

  const deals = raw.deals.map((d) => {
    const categoryId = fieldMode ? firstValue(d[dealPipelineField]) || null : String(d.CATEGORY_ID ?? '0');
    const category = categoryId ? categoryById.get(categoryId) : null;
    const stage = stages.get(d.STAGE_ID);
    const semantic = d.STAGE_SEMANTIC_ID || stage?.semantic || 'P';
    const bucket = dealStageBucket(mapping, { stageId: d.STAGE_ID, name: stage?.name, semantic });
    return {
      id: String(d.ID),
      title: d.TITLE || `Deal #${d.ID}`,
      categoryId,
      categoryName: category?.name ?? (categoryId ? `Pipeline ${categoryId}` : 'No product'),
      family: category?.family ?? 'custom',
      // FR-6: deals with no pipeline fall into the Nural Custom catch-all.
      untagged: category ? category.untagged : true,
      kanbanId: String(d.CATEGORY_ID ?? '0'),
      stageId: d.STAGE_ID,
      stageName: stage?.name ?? d.STAGE_ID,
      semantic,
      bucket,
      probability: stageProbability(mapping, d.STAGE_ID, bucket),
      opportunity: num(d.OPPORTUNITY),
      currency: d.CURRENCY_ID || null,
      createdAt: ts(d.DATE_CREATE),
      closedAt: ts(d.CLOSEDATE),
      movedAt: ts(d.MOVED_TIME),
      ownerName: ownerOf(d),
      company: companies.get(String(d.COMPANY_ID)) || d.TITLE || null,
      customer: contacts.get(String(d.CONTACT_ID)) || personName(rawLeads.get(String(d.LEAD_ID))) || null,
      sourceName: sourceLabel(d.SOURCE_ID),
      leadId: d.LEAD_ID && String(d.LEAD_ID) !== '0' ? String(d.LEAD_ID) : null,
    };
  });

  const leads = raw.leads.map((l) => {
    const status = leadStatuses.get(l.STATUS_ID);
    const sourceName = sources.get(l.SOURCE_ID) ?? raw.sourceNames?.[l.SOURCE_ID] ?? l.SOURCE_ID ?? '';
    const tag = leadPipelineField ? firstValue(l[leadPipelineField]) : '';
    const category = tag ? categoryById.get(fieldMode ? leadMaps.toCategory.get(tag) : tag) : null;
    return {
      id: String(l.ID),
      title: l.TITLE || `Lead #${l.ID}`,
      statusId: l.STATUS_ID,
      bucket: status?.bucket ?? leadStatusBucket(mapping, { statusId: l.STATUS_ID, name: '' }),
      source: normalizeLeadSource(mapping, sourceName),
      opportunity: num(l.OPPORTUNITY),
      currency: l.CURRENCY_ID || null,
      createdAt: ts(l.DATE_CREATE),
      categoryId: category ? category.id : null,
      categoryName: category?.name ?? null,
      // FR-6: untagged leads fall into the Nural Custom catch-all.
      family: category?.family ?? 'custom',
      statusName: status?.name ?? l.STATUS_ID,
      ownerName: ownerOf(l),
      company: companies.get(String(l.COMPANY_ID)) || clean(l.COMPANY_TITLE) || null,
      customer: contacts.get(String(l.CONTACT_ID)) || personName(l) || clean(l.TITLE) || null,
      // The lead's own person name only (no title fallback) — used to fill a deal's missing customer.
      personName: personName(l) || null,
      // Many leads carry the person only in the title; kept as a hint when it isn't just the company.
      titleName: !personName(l) && clean(l.TITLE) && nameKey(l.TITLE) !== nameKey(l.COMPANY_TITLE) ? clean(l.TITLE) : null,
      sourceName: sourceLabel(l.SOURCE_ID),
    };
  });

  // Open follow-ups. Bitrix stores "no deadline" as year 9999 — treat it as no date.
  const followUps = (raw.activities ?? [])
    .filter((a) => a.COMPLETED !== 'Y' && (String(a.OWNER_TYPE_ID) === '1' || String(a.OWNER_TYPE_ID) === '2'))
    .map((a) => {
      const due = ts(a.DEADLINE);
      return {
        id: String(a.ID),
        ownerType: String(a.OWNER_TYPE_ID) === '1' ? 'lead' : 'deal',
        ownerId: String(a.OWNER_ID),
        subject: clean(a.SUBJECT) || ACTIVITY_KINDS[a.PROVIDER_ID] || 'Follow-up',
        kind: ACTIVITY_KINDS[a.PROVIDER_ID] ?? 'Activity',
        due: due != null && new Date(due).getUTCFullYear() < 9000 ? due : null,
        responsible: users.get(String(a.RESPONSIBLE_ID)) ?? (a.RESPONSIBLE_ID ? `User ${a.RESPONSIBLE_ID}` : 'Unassigned'),
      };
    });

  return {
    categories: categories.sort((a, b) => a.sort - b.sort),
    kanbans,
    fieldMode,
    stages,
    leadStatuses,
    deals,
    leads,
    followUps,
  };
}
