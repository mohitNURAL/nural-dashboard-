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

  return {
    async save(userId, t) {
      const s = toStored(t);
      if (s) await write(userId, s);
    },
    async get(userId) {
      const [row] = await db
        .select()
        .from(schema.userTokens)
        .where(eq(schema.userTokens.userId, userId));
      if (!row) return null;
      const current: StoredToken = {
        accessToken: box.open(row.accessToken),
        refreshToken: box.open(row.refreshToken),
        expiresAt: row.expiresAt,
        scope: row.scope,
      };
      if (current.expiresAt > new Date()) return current;
      const renewed = toStored(
        await refreshToken(current.refreshToken, opts.clientId, opts.clientSecret),
      );
      if (!renewed) return null;
      await write(userId, renewed);
      return renewed;
    },
  };
}
