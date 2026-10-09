// Parsing and checking Bitrix24 outbound webhook calls (SRS 8.2). Bitrix24 posts
// form-encoded bodies with bracketed keys, e.g. data[FIELDS_AFTER][ID]=41580.
import { timingSafeEqual } from 'node:crypto';

export const TASK_EVENTS = [
  'ONTASKADD',
  'ONTASKUPDATE',
  'ONTASKDELETE',
  'ONTASKCOMMENTADD',
] as const;
export type TaskEvent = (typeof TASK_EVENTS)[number];

export interface HookEvent {
  event: TaskEvent;
  taskId: number;
}

type Body = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  Array.isArray(v)
    ? str(v[0])
    : typeof v === 'string'
      ? v
      : typeof v === 'number'
        ? String(v)
        : undefined;

/** Reads `a[b][c]` from either a flat form body or a nested (qs-style / JSON) one. */
export function field(body: Body, path: string[]): string | undefined {
  const flat =
    path[0] +
    path
      .slice(1)
      .map((p) => `[${p}]`)
      .join('');
  if (flat in body) return str(body[flat]);
  let cur: unknown = body;
  for (const p of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Body)[p];
  }
  return str(cur);
}

export function applicationToken(body: Body): string | undefined {
  return field(body, ['auth', 'application_token']);
}

/** Constant-time comparison; false when either side is empty. */
export function tokenMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Event name and task ID, or null for anything that is not a task event we handle. */
export function parseHookEvent(body: Body): HookEvent | null {
  const event = str(body.event)?.toUpperCase() as TaskEvent | undefined;
  if (!event || !TASK_EVENTS.includes(event)) return null;
  const raw =
    event === 'ONTASKDELETE'
      ? (field(body, ['data', 'FIELDS_BEFORE', 'ID']) ??
        field(body, ['data', 'FIELDS_AFTER', 'ID']))
      : event === 'ONTASKCOMMENTADD'
        ? (field(body, ['data', 'FIELDS_AFTER', 'TASK_ID']) ??
          field(body, ['data', 'FIELDS_BEFORE', 'TASK_ID']))
        : field(body, ['data', 'FIELDS_AFTER', 'ID']);
  const taskId = Number(raw);
  return Number.isInteger(taskId) && taskId > 0 ? { event, taskId } : null;
}

/** The payload as stored for debugging: everything except the auth block. */
export function redactAuth(body: Body): Body {
  const out: Body = {};
  for (const [k, v] of Object.entries(body)) if (k !== 'auth' && !k.startsWith('auth[')) out[k] = v;
  return out;
}
