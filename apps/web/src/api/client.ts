// Browser -> apps/api only. The browser never calls Bitrix24 (SRS 7).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(qs ? `${path}?${qs}` : path, { signal });
  // Signed out or session expired (SRS 7, Auth): go to Sign in with Bitrix24.
  if (res.status === 401) window.location.href = '/api/auth/login';
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
