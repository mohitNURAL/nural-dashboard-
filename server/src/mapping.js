// Pure derivation helpers driven by config/mapping.json (SRS §6).
// Kept free of I/O so they can be unit-tested directly (SRS Phase 7).

const lc = (s) => String(s ?? '').trim().toLowerCase();

function matchPattern(patterns, name) {
  for (const { bucket, pattern } of patterns) {
    if (new RegExp(pattern, 'i').test(name)) return bucket;
  }
  return null;
}

/** Category NAME → flagship family (SRS §6.5 item 3). Unmatched → 'custom'. */
export function familyForCategory(mapping, name, id) {
  const override = mapping.pipelineFamilies.byCategoryId?.[id];
  if (override) return override;
  const n = lc(name);
  for (const [family, prefixes] of Object.entries(mapping.pipelineFamilies.prefixes)) {
    if (prefixes.some((p) => n.startsWith(lc(p)))) return family;
  }
  return 'custom';
}

/** Deal stage → canonical funnel bucket (FR-4). */
export function dealStageBucket(mapping, { stageId, name, semantic }) {
  const cfg = mapping.dealStages;
  if (cfg.byStageId[stageId]) return cfg.byStageId[stageId];
  if (semantic === 'S') return 'won';
  if (semantic === 'F') return 'lost';
  return matchPattern(cfg.namePatterns, name || '') || 'unmapped';
}

/** Static stage probability (SRS §6.5 item 1). */
export function stageProbability(mapping, stageId, bucket) {
  const cfg = mapping.stageProbabilities;
  if (cfg.byStageId[stageId] != null) return Number(cfg.byStageId[stageId]);
  if (bucket === 'won') return 1;
  if (bucket === 'lost') return 0;
  return Number(cfg.byBucket[bucket] ?? cfg.byBucket.unmapped ?? 0);
}

/** Lead STATUS_ID → funnel bucket (SRS §6.5 item 5). */
export function leadStatusBucket(mapping, { statusId, name }) {
  const cfg = mapping.leadStatuses;
  if (cfg.byStatusId[statusId]) return cfg.byStatusId[statusId];
  if (cfg.convertedStatusIds.includes(statusId)) return 'converted';
  return matchPattern(cfg.namePatterns, name || '') || 'unmapped';
}

/** Source display name → reporting name, or null if excluded (FR-5). */
export function normalizeLeadSource(mapping, name) {
  const key = lc(name);
  if (!key || mapping.leadSources.exclude.includes(key)) return null;
  return mapping.leadSources.merge[key] || String(name).trim();
}
