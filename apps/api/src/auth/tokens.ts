// Bitrix24 OAuth tokens of signed-in people (SRS 7, Task actions): stored encrypted at sign-in,
// renewed with the refresh token when expired, used only for task actions as that person.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { TokenResponse } from './bitrixOAuth';

/** AES-256-GCM with a key derived from SESSION_SECRET: `iv.tag.ciphertext`, base64url. */
export function sealer(secret: string) {
  const key = createHash('sha256').update(`${secret}:user-tokens`).digest();
  return {
    seal(text: string): string {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
      return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
    },
    open(sealed: string): string {
      const [iv, tag, data] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
      const d = createDecipheriv('aes-256-gcm', key, iv!);
      d.setAuthTag(tag!);
      return Buffer.concat([d.update(data!), d.final()]).toString('utf8');
    },
  };
}

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
}

export interface TokenStore {
  save(userId: number, t: TokenResponse): Promise<void>;
  /** A valid access token for this person (renewed if needed), or null if they must sign in. */
  get(userId: number): Promise<StoredToken | null>;
}

/** Renews an access token at Bitrix24's OAuth server. */
export async function refreshToken(
  refresh: string,
  clientId: string,
  clientSecret: string,
  doFetch: typeof fetch = fetch,
): Promise<TokenResponse> {
  const u = new URL('https://oauth.bitrix.info/oauth/token/');
  u.searchParams.set('grant_type', 'refresh_token');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('client_secret', clientSecret);
  u.searchParams.set('refresh_token', refresh);
  const res = await doFetch(u, { signal: AbortSignal.timeout(10_000) });
  return (await res.json().catch(() => ({ error: `HTTP_${res.status}` }))) as TokenResponse;
}

const toStored = (t: TokenResponse): StoredToken | null =>
  t.access_token && t.refresh_token
    ? {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        // A minute early, so a token never expires mid-call.
        expiresAt: new Date(Date.now() + (Number(t.expires_in ?? 3600) - 60) * 1000),
        scope: t.scope ?? null,
      }
    : null;

/** Postgres-backed store (table user_tokens). */
export async function dbTokenStore(opts: {
  secret: string;
  clientId: string;
  clientSecret: string;
  /** A renewal Bitrix24 refused (its error code only, never a token). */
  onRefreshFail?: (userId: number, reason: string) => void;
}): Promise<TokenStore> {
  const { db, schema } = await import('../db/client');
  const box = sealer(opts.secret);

  async function write(userId: number, s: StoredToken) {
    const row = {
      userId,
      accessToken: box.seal(s.accessToken),
      refreshToken: box.seal(s.refreshToken),
      expiresAt: s.expiresAt,
      scope: s.scope,
      updatedAt: new Date(),
    };
    await db
      .insert(schema.userTokens)
      .values(row)
      .onConflictDoUpdate({ target: schema.userTokens.userId, set: row });
  }

  async function read(userId: number): Promise<StoredToken | null> {
    const [row] = await db
      .select()
      .from(schema.userTokens)
      .where(eq(schema.userTokens.userId, userId));
    return row
      ? {
          accessToken: box.open(row.accessToken),
          refreshToken: box.open(row.refreshToken),
          expiresAt: row.expiresAt,
          scope: row.scope,
        }
      : null;
  }

  // One renewal at a time per person (2026-10-29): Bitrix24's refresh token works once, so two
  // requests renewing together spent it twice and could leave a dead one stored (Add task greyed
  // out until signing in again).
  const renewing = new Map<number, Promise<StoredToken | null>>();
  async function renew(userId: number, current: StoredToken) {
    // Never the error's message: the request URL carries the secret and the refresh token.
    const r: TokenResponse = await refreshToken(
      current.refreshToken,
      opts.clientId,
      opts.clientSecret,
    ).catch(() => ({ error: 'network error' }));
    const renewed = toStored(r);
    if (renewed) {
      await write(userId, renewed);
      return renewed;
    }
    // Renewed meanwhile (e.g. by a sign-in): use that one.
    const again = await read(userId);
    if (again && again.expiresAt > new Date()) return again;
    opts.onRefreshFail?.(userId, r.error ?? 'no token returned');
    return null;
  }

  return {
    async save(userId, t) {
      const s = toStored(t);
      if (s) await write(userId, s);
    },
    async get(userId) {
      const current = await read(userId);
      if (!current) return null;
      if (current.expiresAt > new Date()) return current;
      let p = renewing.get(userId);
      if (!p) {
        p = renew(userId, current).finally(() => renewing.delete(userId));
        renewing.set(userId, p);
      }
      return p;
    },
  };
}
