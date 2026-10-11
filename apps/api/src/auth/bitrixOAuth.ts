// Sign in with Bitrix24 (SRS 7, Auth): the OAuth 2.0 authorization-code flow of a Bitrix24 local
// app. The user comes from our own users table. The tokens are kept (encrypted, tokens.ts) only
// for task actions the person makes from the dashboard (move stage, change status).

export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  /** e.g. "task,user". */
  scope?: string;
  user_id?: number | string;
  /** The portal's REST endpoint, e.g. https://nural.bitrix24.in/rest/ */
  client_endpoint?: string;
  error?: string;
}

/**
 * Where the browser goes to sign in. Without `redirect_uri` Bitrix24 returns to the local app's
 * handler path (the site root), so the callback URL is always given; it must be on the handler's
 * domain.
 */
export function authorizeUrl(
  portalOrigin: string,
  clientId: string,
  state: string,
  redirectUri?: string,
): string {
  const u = new URL('/oauth/authorize/', portalOrigin);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('state', state);
  if (redirectUri) u.searchParams.set('redirect_uri', redirectUri);
  return u.toString();
}

/** Exchanges the one-time code at Bitrix24's OAuth server. */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  doFetch: typeof fetch = fetch,
): Promise<TokenResponse> {
  const u = new URL('https://oauth.bitrix.info/oauth/token/');
  u.searchParams.set('grant_type', 'authorization_code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('client_secret', clientSecret);
  u.searchParams.set('code', code);
  const res = await doFetch(u, { signal: AbortSignal.timeout(10_000) });
  return (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as TokenResponse;
}

/** The signed-in Bitrix24 user ID, if the token belongs to our portal; else null. */
export function portalUserId(token: TokenResponse, portalOrigin: string): number | null {
  if (token.error || !token.client_endpoint) return null;
  let origin: string;
  try {
    origin = new URL(token.client_endpoint).origin;
  } catch {
    return null;
  }
  const id = Number(token.user_id);
  return origin === portalOrigin && Number.isInteger(id) && id > 0 ? id : null;
}
