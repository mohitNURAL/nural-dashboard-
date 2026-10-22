// Append-only audit log of outbound writes (SRS §7 Auditability):
// who, which record, old value, new value, when.

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');

export function writeAudit(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(AUDIT_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

export function readAudit(limit = 200) {
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n');
    return lines.slice(-limit).reverse().map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
