// Thin client for the Node backend (SRS §8). The browser never talks to Bitrix24.

const TOKEN_KEY = 'nural.crm.token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

export function filterQuery({ pipeline, period, from, to }) {
  const q = new URLSearchParams({ pipeline, period });
  if (period === 'custom') { q.set('from', from); q.set('to', to); }
  return q.toString();
}

/** Server-Sent Events URL for live updates (EventSource can't send headers). */
export function streamUrl() {
  const token = getToken();
  return token ? `/api/stream?access_token=${encodeURIComponent(token)}` : '/api/stream';
}

export const api = {
  me: () => request('/me'),
  dashboard: (filters, signal) => request(`/dashboard?${filterQuery(filters)}`, { signal }),
  missingValue: (filters) => request(`/dashboard/missing-value?${filterQuery(filters)}`),
  followUps: (filters, window) => request(`/dashboard/follow-ups?${filterQuery(filters)}&window=${window}`),
  records: (filters, query) => request(`/dashboard/records?${filterQuery(filters)}&${new URLSearchParams(query)}`),
  pipelines: () => request('/meta/pipelines'),
  lastSync: () => request('/meta/last-sync'),
  syncNow: () => request('/sync', { method: 'POST' }),
  mappingIssues: () => request('/meta/mapping-issues'),
  updateMapping: (change) => request('/admin/mapping', { method: 'PUT', body: change }),
  applyCustomer: (dealId, leadId) => request(`/deals/${dealId}/customer`, { method: 'POST', body: { leadId } }),
  updateRecord: (type, id, body) => request(`/${type === 'deal' ? 'deals' : 'leads'}/${id}`, { method: 'PATCH', body }),
};
