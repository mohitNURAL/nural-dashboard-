// Browser -> apps/api only. The browser never calls Bitrix24 (SRS 7).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Signed out (SRS 7, Auth). A session that ran out (3 days after sign-in) shows "Your session
 * ended"; either way the sign-in page offers the Pulse account and Sign in with Bitrix24.
 */
export function signInAgain(expired: boolean) {
  window.location.href = expired ? '/api/auth/signin?expired=1' : '/api/auth/signin';
}

async function on401(res: Response) {
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { expired?: boolean } | null;
  signInAgain(!!body?.expired);
}

export async function apiGet<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(qs ? `${path}?${qs}` : path, { signal });
  if (res.status === 401) await on401(res);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** No answer in time (a save waiting on Bitrix24): the form is freed with this message. */
export const SLOW_SAVE =
  'No answer from Bitrix24 in time. The change may still go through: check the task in a minute before trying again.';

/**
 * POST JSON; the error message comes from the API's `error` field. With `timeoutMs`, a request
 * still unanswered by then fails with SLOW_SAVE (2026-11-02), so a save never leaves a form
 * stuck on "Saving".
 */
export async function apiPost<T>(
  path: string,
  body: unknown,
  method = 'POST',
  { timeoutMs }: { timeoutMs?: number } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(timeoutMs && { signal: AbortSignal.timeout(timeoutMs) }),
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError'))
      throw new ApiError(0, SLOW_SAVE);
    throw e;
  }
  if (res.status === 401) await on401(res);
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `${res.status} ${res.statusText}`);
  return data as T;
}
