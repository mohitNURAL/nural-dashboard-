// Raw HTTP caller for the Bitrix24 inbound webhook. Never call this directly:
// go through limiter.ts so every request respects the 2 calls/s limit.
import { assertReadOnly, assertUserAction } from './methods';

export type Params = Record<string, unknown>;

export interface BitrixResponse<T = unknown> {
  result: T;
  total?: number;
  next?: number;
}

export type RawCall = <T = unknown>(method: string, params?: Params) => Promise<BitrixResponse<T>>;

const RETRYABLE_CODES = new Set([
  'QUERY_LIMIT_EXCEEDED',
  'OPERATION_TIME_LIMIT',
  'INTERNAL_SERVER_ERROR',
]);

export class BitrixError extends Error {
  constructor(
    readonly method: string,
    readonly code: string,
    readonly description: string,
    readonly retryable: boolean,
  ) {
    // Method and code only: the webhook URL holds the secret and must never be in messages.
    super(`${method}: [${code}] ${description}`.trim());
    this.name = 'BitrixError';
  }
}

export interface RawCallerOptions {
  baseUrl: string;
  /**
   * 'read' (default): the inbound webhook, read methods only. 'userAction': the portal's REST
   * endpoint with a person's OAuth token in `params.auth`, task actions only.
   */
  mode?: 'read' | 'userAction';
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface RawBody<T> {
  result?: T;
  total?: number;
  next?: number;
  error?: string;
  error_description?: string;
}

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

export function createRawCaller({
  baseUrl,
  mode = 'read',
  fetch: doFetch = fetch,
  timeoutMs = 30_000,
}: RawCallerOptions): RawCall {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  return async function rawCall<T>(method: string, params: Params = {}) {
    if (mode === 'userAction') {
      assertUserAction(method);
      if (typeof params.auth !== 'string') throw new Error('task action without a user token');
    } else assertReadOnly(method);
    let res: Response;
    try {
      res = await doFetch(new URL(`${method}.json`, base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Only the error name: fetch messages can include the request URL.
      const reason = err instanceof Error ? err.name : 'unknown';
      throw new BitrixError(method, 'NETWORK_ERROR', reason, true);
    }

    let body: RawBody<T>;
    try {
      body = (await res.json()) as RawBody<T>;
    } catch {
      throw new BitrixError(
        method,
        `HTTP_${res.status}`,
        'non-JSON response',
        isRetryableStatus(res.status),
      );
    }

    if (body.error) {
      const retryable = RETRYABLE_CODES.has(body.error) || isRetryableStatus(res.status);
      throw new BitrixError(method, body.error, body.error_description ?? '', retryable);
    }
    if (!res.ok) {
      throw new BitrixError(
        method,
        `HTTP_${res.status}`,
        res.statusText,
        isRetryableStatus(res.status),
      );
    }
    return { result: body.result as T, total: body.total, next: body.next };
  };
}
