// Bitrix24 `batch`: up to 50 commands per request, sent through the limiter.
import { BitrixError, type Params } from './client';
import type { Call } from './limiter';
import { assertReadOnly } from './methods';

export const BATCH_LIMIT = 50;

export interface Command {
  method: string;
  params?: Params;
}

export interface CommandError {
  error: string;
  error_description?: string;
}

export interface BatchResult<T = unknown> {
  result: Record<string, T>;
  errors: Record<string, CommandError>;
  total: Record<string, number>;
  next: Record<string, number>;
}

/** PHP http_build_query-style encoding, which Bitrix24 expects inside batch commands. */
export function toQuery(params: Params): string {
  const parts: string[] = [];
  const push = (key: string, value: string) =>
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  const walk = (value: unknown, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${key}[${i}]`));
    } else if (value instanceof Date) {
      push(key, value.toISOString());
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${key}[${k}]`);
    } else if (typeof value === 'boolean') {
      push(key, value ? '1' : '0');
    } else {
      push(key, String(value));
    }
  };
  for (const [k, v] of Object.entries(params)) walk(v, k);
  return parts.join('&');
}

type MapOrEmpty<T> = Record<string, T> | unknown[] | undefined;

interface RawBatch {
  result?: MapOrEmpty<unknown>;
  result_error?: MapOrEmpty<CommandError>;
  result_total?: MapOrEmpty<number>;
  result_next?: MapOrEmpty<number>;
}

// Bitrix24 (PHP) sends an empty map as [].
const asMap = <T>(v: MapOrEmpty<T>): Record<string, T> => (v && !Array.isArray(v) ? v : {});

export interface BatchOptions {
  /** Return per-command errors in `errors` instead of throwing. */
  allowErrors?: boolean;
}

export async function batch<T = unknown>(
  call: Call,
  commands: Record<string, Command>,
  { allowErrors = false }: BatchOptions = {},
): Promise<BatchResult<T>> {
  const entries = Object.entries(commands);
  for (const [, c] of entries) assertReadOnly(c.method);

  const out: BatchResult<T> = { result: {}, errors: {}, total: {}, next: {} };
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const cmd: Record<string, string> = {};
    for (const [key, c] of entries.slice(i, i + BATCH_LIMIT)) {
      const q = c.params ? toQuery(c.params) : '';
      cmd[key] = q ? `${c.method}?${q}` : c.method;
    }
    const { result } = await call<RawBatch>('batch', { halt: 0, cmd });
    Object.assign(out.result, asMap(result.result) as Record<string, T>);
    Object.assign(out.errors, asMap(result.result_error));
    Object.assign(out.total, asMap(result.result_total));
    Object.assign(out.next, asMap(result.result_next));
  }

  const failed = Object.keys(out.errors);
  if (failed.length && !allowErrors) {
    const first = out.errors[failed[0]!]!;
    throw new BitrixError(
      'batch',
      first.error,
      `${failed.length} command(s) failed: ${failed.join(', ')}`,
      false,
    );
  }
  return out;
}
