import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = process.env.NURAL_DATA_DIR || path.join(ROOT, 'data');
export const MAPPING_PATH = path.join(ROOT, 'config', 'mapping.json');

// Load server/.env when present (works on every supported Node version,
// unlike the --env-file-if-exists CLI flag). Real env vars take precedence.
const ENV_PATH = path.join(ROOT, '.env');
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

function parseUsers(raw) {
  if (!raw || !raw.trim()) return null;
  const users = JSON.parse(raw);
  if (!Array.isArray(users)) throw new Error('DASHBOARD_USERS must be a JSON array');
  return users;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  webhookUrl: (process.env.BITRIX_WEBHOOK_URL || '').trim(),
  eventToken: (process.env.BITRIX_EVENT_TOKEN || '').trim(),
  // Full re-pull (also catches deletions).
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES || 10),
  // Incremental pull of records modified since the last check (near real-time).
  quickSyncSeconds: Math.max(5, Number(process.env.QUICK_SYNC_SECONDS || 15)),
  // Where a deal's reporting pipeline comes from. Empty: the Bitrix deal pipeline
  // (CATEGORY_ID). Set to a list field (e.g. the "Product" UF_CRM_…) when the portal
  // keeps every deal on one Kanban board and tracks the product line in a field.
  dealPipelineField: (process.env.DEAL_PIPELINE_FIELD || '').trim(),
  leadPipelineField: (process.env.LEAD_PIPELINE_FIELD || '').trim(),
  users: parseUsers(process.env.DASHBOARD_USERS),
};

export const isMock = !env.webhookUrl;

// The mock portal uses real deal pipelines plus its own lead pipeline field, so
// portal-specific field settings are ignored when running on mock data.
if (isMock) {
  env.dealPipelineField = '';
  env.leadPipelineField = 'UF_CRM_NURAL_PIPELINE';
}

export function loadMapping() {
  return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
}

export function saveMapping(mapping) {
  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2) + '\n');
}
