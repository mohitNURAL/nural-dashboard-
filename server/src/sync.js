// Bitrix sync + cache (SRS §2.1, §7 Freshness/Availability, §9).
//
// Two loops:
//   - quick sync every QUICK_SYNC_SECONDS: only records with DATE_MODIFY since
//     the last check, merged into the cache — near real-time, a few requests.
//   - full sync every SYNC_INTERVAL_MINUTES: re-pulls everything (reference
//     lists, deletions) as a backstop.
// Bitrix event webhooks trigger an immediate quick sync. Subscribers (the
// browser stream) are told after every check, with `version` bumped only when
// the data actually changed.
//
// Raw payloads are persisted so a restart while Bitrix is unreachable still
// serves last-known-good data with its "data as of" timestamp.

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, loadMapping } from './config.js';
import { fetchChanges, fetchRaw } from './bitrix/fetch.js';
import { normalize } from './normalize.js';

const CACHE_FILE = path.join(DATA_DIR, 'raw-cache.json');
const EVENT_DEBOUNCE_MS = 2000;
// Re-read a little before the last check so clock skew between us and the portal can't drop an edit.
const QUICK_OVERLAP_MS = 60_000;

const sourceNamesOf = (statuses = []) =>
  Object.fromEntries(statuses.filter((s) => s.ENTITY_ID === 'SOURCE').map((s) => [s.STATUS_ID, s.NAME]));

/** Upsert rows by ID; returns how many were new or actually different. */
function mergeRows(target, incoming) {
  const index = new Map(target.map((r, i) => [String(r.ID), i]));
  let changed = 0;
  for (const row of incoming) {
    const i = index.get(String(row.ID));
    if (i == null) {
      index.set(String(row.ID), target.push(row) - 1);
      changed++;
    } else if (JSON.stringify(target[i]) !== JSON.stringify(row)) {
      target[i] = row;
      changed++;
    }
  }
  return changed;
}

export function createSyncService({ client, env, log = console }) {
  const state = {
    raw: null,
    model: null,
    mapping: loadMapping(),
    version: 0,
    cursor: null, // start time of the last successful check
    lastSuccessAt: null,
    lastFullAt: null,
    lastChangeAt: null,
    lastAttemptAt: null,
    lastError: null,
  };
  const listeners = new Set();
  const timers = [];
  let queue = Promise.resolve();
  let inFlight = 0;
  let debounce = null;

  function rebuild() {
    state.model = normalize(state.raw, state.mapping, env);
  }

  function loadCache() {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cached.source !== client.mode) return;
      state.raw = cached.raw;
      state.lastSuccessAt = cached.syncedAt;
      rebuild();
      state.version++;
      log.info(`[sync] loaded cached snapshot from ${new Date(cached.syncedAt).toISOString()}`);
    } catch {
      /* no cache yet */
    }
  }

  function persist() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = CACHE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ source: client.mode, syncedAt: state.lastSuccessAt, raw: state.raw }));
    fs.renameSync(tmp, CACHE_FILE);
  }

  function changed() {
    state.version++;
    state.lastChangeAt = Date.now();
  }

  function notify() {
    const s = status();
    for (const fn of listeners) {
      try { fn(s); } catch { /* a dead stream must not break sync */ }
    }
  }

  /** Runs sync jobs one at a time so quick and full syncs never interleave. */
  function exclusive(job) {
    inFlight++;
    const run = queue.then(async () => {
      const startedAt = Date.now();
      state.lastAttemptAt = startedAt;
      try {
        await job();
        state.cursor = startedAt;
        state.lastSuccessAt = Date.now();
        state.lastError = null;
      } catch (err) {
        // §9: keep serving the previous snapshot; surface the failure via status.
        state.lastError = err.message;
        log.error(`[sync] failed: ${err.message}`);
      } finally {
        inFlight--;
        notify();
      }
    });
    queue = run;
    return run;
  }

  const fullSync = () => exclusive(async () => {
    const raw = await fetchRaw(client, env);
    // FR-5: a source deleted in Bitrix24 keeps its last known name, since its leads still point to it.
    raw.sourceNames = { ...state.raw?.sourceNames, ...sourceNamesOf(state.raw?.statuses), ...sourceNamesOf(raw.statuses) };
    state.mapping = loadMapping();
    state.raw = raw;
    rebuild();
    state.lastFullAt = Date.now();
    changed();
    state.lastSuccessAt = Date.now();
    persist();
    log.info(`[sync] full — ${raw.deals.length} deals, ${raw.leads.length} leads`);
  });

  const quickSync = () => {
    if (!state.raw || !state.cursor) return fullSync();
    return exclusive(async () => {
      const since = new Date(state.cursor - QUICK_OVERLAP_MS).toISOString();
      const ids = (rows = []) => new Set(rows.map((r) => String(r.ID)));
      const knownParties = { companies: ids(state.raw.companies), contacts: ids(state.raw.contacts) };
      const delta = await fetchChanges(client, env, since, ids(state.raw.users), knownParties);
      const n = mergeRows(state.raw.deals, delta.deals) + mergeRows(state.raw.leads, delta.leads)
        + mergeRows((state.raw.activities ??= []), delta.activities);
      if (delta.users.length) mergeRows(state.raw.users, delta.users);
      if (delta.companies.length) mergeRows((state.raw.companies ??= []), delta.companies);
      if (delta.contacts.length) mergeRows((state.raw.contacts ??= []), delta.contacts);
      if (n > 0) {
        rebuild();
        changed();
        state.lastSuccessAt = Date.now();
        persist();
        log.info(`[sync] quick — ${n} record${n === 1 ? '' : 's'} changed`);
      }
    });
  };

  function status() {
    const staleAfter = Math.max(env.quickSyncSeconds * 4 * 1000, 120_000);
    return {
      source: client.mode,
      version: state.version,
      lastSuccessAt: state.lastSuccessAt,
      lastFullAt: state.lastFullAt,
      lastChangeAt: state.lastChangeAt,
      lastAttemptAt: state.lastAttemptAt,
      lastError: state.lastError,
      syncing: inFlight > 0,
      quickSyncSeconds: env.quickSyncSeconds,
      fullSyncMinutes: env.syncIntervalMinutes,
      stale: !state.lastSuccessAt || Date.now() - state.lastSuccessAt > staleAfter || Boolean(state.lastError),
    };
  }

  return {
    async start() {
      loadCache();
      const first = fullSync();
      if (!state.model) await first;
      const every = (ms, fn) => {
        const t = setInterval(() => { if (!inFlight) fn(); }, ms);
        t.unref?.();
        timers.push(t);
      };
      every(env.quickSyncSeconds * 1000, quickSync);
      every(env.syncIntervalMinutes * 60_000, fullSync);
    },
    stop() {
      timers.forEach(clearInterval);
      clearTimeout(debounce);
    },
    syncNow: fullSync,
    quickSync,
    /** Bitrix event webhooks arrive in bursts; coalesce them into one quick sync. */
    requestSync() {
      clearTimeout(debounce);
      debounce = setTimeout(quickSync, EVENT_DEBOUNCE_MS);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get model() {
      return state.model;
    },
    get raw() {
      return state.raw;
    },
    get mapping() {
      return state.mapping;
    },
    reloadMapping() {
      state.mapping = loadMapping();
      if (state.raw) rebuild();
      changed();
      notify();
    },
    /** Apply a confirmed Bitrix write to the cache immediately (FR-7 cache invalidation). */
    patchRaw(entity, id, fields) {
      const rows = entity === 'deal' ? state.raw.deals : state.raw.leads;
      const row = rows.find((r) => String(r.ID) === String(id));
      if (row) Object.assign(row, fields);
      rebuild();
      changed();
      persist();
      notify();
    },
    /** Add or replace a row in a raw reference list (e.g. a contact just created in Bitrix24). */
    upsertRaw(collection, row) {
      mergeRows((state.raw[collection] ??= []), [row]);
    },
    rawRecord(entity, id) {
      const rows = entity === 'deal' ? state.raw?.deals : state.raw?.leads;
      return rows?.find((r) => String(r.ID) === String(id)) ?? null;
    },
    status,
  };
}
