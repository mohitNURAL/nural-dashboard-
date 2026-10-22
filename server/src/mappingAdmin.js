// Data Mapping section: finds Kanban stages, lead statuses and pipelines the
// mapping config doesn't place, and applies admin choices to config/mapping.json.
// Mapping lives only in this app — nothing is written to Bitrix24.

import { dealStageBucket, familyForCategory, leadStatusBucket } from './mapping.js';

export class MappingError extends Error {}

const KINDS = {
  dealStage: { section: 'dealStages', key: 'byStageId' },
  leadStatus: { section: 'leadStatuses', key: 'byStatusId' },
  pipeline: { section: 'pipelineFamilies', key: 'byCategoryId' },
};

export function mappingOptions(mapping) {
  const { dealStages: ds, leadStatuses: ls, pipelineFamilies: pf } = mapping;
  return {
    dealStage: ds.order.filter((k) => k !== 'won' && k !== 'lost').map((key) => ({ key, label: ds.labels[key] })),
    leadStatus: [...ls.forward, ...ls.disqualified, ...ls.excluded].map((key) => ({ key, label: ls.labels[key] ?? key })),
    pipeline: pf.order.map((key) => ({ key, label: pf.labels[key] })),
  };
}

/** Same rules as the dashboard, minus any manual override — what the name alone would give. */
function withoutOverride(mapping, kind, id) {
  const { section, key } = KINDS[kind];
  return { ...mapping, [section]: { ...mapping[section], [key]: { ...mapping[section][key], [id]: undefined } } };
}

export function computeMappingIssues(model, mapping) {
  const items = { dealStage: [], leadStatus: [], pipeline: [] };
  const labelOf = (kind, key) => mappingOptions(mapping)[kind].find((o) => o.key === key)?.label ?? key;

  const dealsByStage = new Map();
  for (const d of model.deals) {
    const s = dealsByStage.get(d.stageId) ?? { count: 0, openValue: 0 };
    s.count++;
    if (d.semantic === 'P') s.openValue += d.opportunity;
    dealsByStage.set(d.stageId, s);
  }
  const boardName = new Map((model.kanbans ?? model.categories).map((c) => [c.id, c.name]));
  for (const s of model.stages.values()) {
    if (s.semantic !== 'P') continue; // won/lost columns always map by Bitrix semantics
    const manual = mapping.dealStages.byStageId[s.id];
    const auto = dealStageBucket(withoutOverride(mapping, 'dealStage', s.id), { stageId: s.id, name: s.name, semantic: 'P' });
    if (!manual && auto !== 'unmapped') continue;
    const stats = dealsByStage.get(s.id) ?? { count: 0, openValue: 0 };
    items.dealStage.push({
      kind: 'dealStage', id: s.id, name: s.name, context: `${boardName.get(s.categoryId) ?? `Board ${s.categoryId}`} Kanban`,
      count: stats.count, value: stats.openValue,
      status: manual ? 'manual' : 'unmapped', current: manual ?? null, currentLabel: manual ? labelOf('dealStage', manual) : null,
    });
  }

  const leadsByStatus = new Map();
  for (const l of model.leads) leadsByStatus.set(l.statusId, (leadsByStatus.get(l.statusId) || 0) + 1);
  for (const s of model.leadStatuses.values()) {
    const manual = mapping.leadStatuses.byStatusId[s.id];
    const auto = leadStatusBucket(withoutOverride(mapping, 'leadStatus', s.id), { statusId: s.id, name: s.name });
    if (!manual && auto !== 'unmapped') continue;
    items.leadStatus.push({
      kind: 'leadStatus', id: s.id, name: s.name, context: 'Lead Kanban',
      count: leadsByStatus.get(s.id) || 0,
      status: manual ? 'manual' : 'unmapped', current: manual ?? null, currentLabel: manual ? labelOf('leadStatus', manual) : null,
    });
  }

  const dealsByCategory = new Map();
  for (const d of model.deals) dealsByCategory.set(d.categoryId, (dealsByCategory.get(d.categoryId) || 0) + 1);
  for (const c of model.categories) {
    const manual = mapping.pipelineFamilies.byCategoryId?.[c.id];
    const auto = familyForCategory(withoutOverride(mapping, 'pipeline', c.id), c.name, c.id);
    // A pipeline that only landed in Nural Custom because no prefix matched needs a human to confirm.
    if (!manual && (auto !== 'custom' || c.untagged)) continue;
    items.pipeline.push({
      kind: 'pipeline', id: c.id, name: c.name, context: 'Deal pipeline',
      count: dealsByCategory.get(c.id) || 0,
      status: manual ? 'manual' : 'unconfirmed', current: manual ?? 'custom', currentLabel: labelOf('pipeline', manual ?? 'custom'),
    });
  }

  const all = Object.values(items).flat();
  return {
    summary: {
      unmapped: all.filter((i) => i.status === 'unmapped').length,
      unconfirmed: all.filter((i) => i.status === 'unconfirmed').length,
      manual: all.filter((i) => i.status === 'manual').length,
      affectedDeals: items.dealStage.filter((i) => i.status === 'unmapped').reduce((s, i) => s + i.count, 0),
      affectedLeads: items.leadStatus.filter((i) => i.status === 'unmapped').reduce((s, i) => s + i.count, 0),
    },
    items,
    options: mappingOptions(mapping),
  };
}

/**
 * Returns a new mapping with one override set (value) or removed (value null).
 * @returns {{ mapping: object, old: string|null }}
 */
export function applyMappingChange(mapping, model, { kind, id, value }) {
  const spec = KINDS[kind];
  if (!spec) throw new MappingError(`Unknown mapping kind "${kind}"`);
  id = String(id ?? '');
  const exists = kind === 'dealStage' ? model.stages.has(id) : kind === 'leadStatus' ? model.leadStatuses.has(id) : model.categories.some((c) => c.id === id);
  if (!exists) throw new MappingError(`${id} is not a current ${kind === 'dealStage' ? 'deal stage' : kind === 'leadStatus' ? 'lead status' : 'pipeline'} on the portal`);
  if (kind === 'dealStage' && model.stages.get(id).semantic !== 'P') throw new MappingError('Won and lost columns are mapped automatically');
  if (value != null && !mappingOptions(mapping)[kind].some((o) => o.key === value)) throw new MappingError(`"${value}" is not a valid choice`);

  const next = structuredClone(mapping);
  const table = (next[spec.section][spec.key] ??= {});
  const old = table[id] ?? null;
  if (value == null) delete table[id];
  else table[id] = value;
  return { mapping: next, old };
}
