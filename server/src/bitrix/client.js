// Bitrix24 REST client over an inbound webhook (SRS §5.1 option 1, §5.3).
// - Paginates .list methods with `start`, fetching remaining pages through `batch`
//   (up to 50 commands per round trip) instead of one request per page.
// - Throttles to ~2 req/s and retries QUERY_LIMIT_EXCEEDED / 429 / 503 with
//   exponential backoff.

const PAGE_SIZE = 50;
const BATCH_MAX = 50;
const MIN_INTERVAL_MS = 550;
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** PHP http_build_query-style encoding, which `batch` commands require. */
export function toQuery(params, prefix = '') {
  const parts = [];
  for (const [k, v] of Object.entries(params ?? {})) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') parts.push(toQuery(v, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return parts.filter(Boolean).join('&');
}

export class BitrixError extends Error {
  constructor(code, description, status) {
    super(`${code}: ${description || ''}`.trim());
    this.code = code;
    this.status = status;
  }
}

export function createBitrixClient(webhookUrl, { log = console } = {}) {
  // Bitrix24 shows the webhook with an example method appended (".../profile.json");
  // keep only the ".../rest/<user>/<token>/" base.
  const trimmed = webhookUrl.trim().replace(/[^/]+\.json$/, '');
  const base = trimmed.endsWith('/') ? trimmed : trimmed + '/';
  let lastCallAt = 0;

  async function call(method, params = {}) {
    for (let attempt = 0; ; attempt++) {
      const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();

      let res, body;
      try {
        res = await fetch(`${base}${method}.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        body = await res.json().catch(() => ({}));
      } catch (err) {
        if (attempt >= MAX_RETRIES) throw err;
        await sleep(backoff(attempt));
        continue;
      }

      const limited = res.status === 429 || res.status === 503 || body.error === 'QUERY_LIMIT_EXCEEDED';
      if (limited && attempt < MAX_RETRIES) {
        const ms = backoff(attempt);
        log.warn?.(`[bitrix] rate limited on ${method}, retrying in ${ms}ms`);
        await sleep(ms);
        continue;
      }
      if (body.error) throw new BitrixError(body.error, body.error_description, res.status);
      if (!res.ok) throw new BitrixError('HTTP_' + res.status, res.statusText, res.status);
      return body;
    }
  }

  async function batch(cmd) {
    const body = await call('batch', { halt: 0, cmd });
    const { result = {}, result_error: errors = {} } = body.result ?? {};
    const firstError = Object.entries(errors).find(([, e]) => e);
    if (firstError) {
      const [key, e] = firstError;
      throw new BitrixError(e.error || 'BATCH_ERROR', `${key}: ${e.error_description || ''}`);
    }
    return result;
  }

  async function listAll(method, params = {}) {
    const first = await call(method, { ...params, start: 0 });
    const rows = [...(first.result ?? [])];
    const total = first.total ?? rows.length;
    if (first.next == null || rows.length >= total) return rows;

    const starts = [];
    for (let s = first.next; s < total; s += PAGE_SIZE) starts.push(s);
    for (let i = 0; i < starts.length; i += BATCH_MAX) {
      const cmd = {};
      for (const s of starts.slice(i, i + BATCH_MAX)) cmd[`p${s}`] = `${method}?${toQuery({ ...params, start: s })}`;
      const pages = await batch(cmd);
      for (const s of starts.slice(i, i + BATCH_MAX)) rows.push(...(pages[`p${s}`] ?? []));
    }
    return rows;
  }

  return {
    mode: 'bitrix',
    call: async (method, params) => (await call(method, params)).result,
    batch,
    listAll,
  };
}

function backoff(attempt) {
  return Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
