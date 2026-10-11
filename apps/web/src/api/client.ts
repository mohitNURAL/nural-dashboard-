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
 * ended" with a Sign in button; without one, go straight to Sign in with Bitrix24.
 */
export function signInAgain(expired: boolean) {
  window.location.href = expired ? '/api/auth/signed-out?expired=1' : '/api/auth/login';
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

/** POST JSON; the error message comes from the API's `error` field. */
export async function apiPost<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) await on401(res);
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `${res.status} ${res.statusText}`);
  return data as T;
}
