// Token renewal (2026-10-29): requests arriving together share one renewal, since Bitrix24's
// refresh token works only once; a refused renewal is reported, never with a token.
import { afterEach, describe, expect, it, vi } from 'vitest';

// user_tokens in memory: select().from().where() and insert().values().onConflictDoUpdate().
const rows = new Map<number, Record<string, unknown>>();
vi.mock('../db/client', () => ({
  schema: { userTokens: { userId: 'userId' } },
  db: {
    select: () => ({ from: () => ({ where: async () => [...rows.values()] }) }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => void rows.set(row.userId as number, row),
      }),
    }),
  },
}));

const { dbTokenStore, sealer } = await import('./tokens');
const SECRET = 'test-secret';

function storeExpired() {
  const box = sealer(SECRET);
  rows.set(158, {
    userId: 158,
    accessToken: box.seal('old-access'),
    refreshToken: box.seal('r1'),
    expiresAt: new Date(Date.now() - 1000),
    scope: 'task',
  });
}

afterEach(() => {
  rows.clear();
  vi.unstubAllGlobals();
});

describe('token renewal', () => {
  it('two requests at once renew once and both get the new token', async () => {
    storeExpired();
    const used = new Set<string>();
    const fetch = vi.fn(async (u: URL) => {
      const r = u.searchParams.get('refresh_token')!;
      // Bitrix24: a refresh token works once.
      const body = used.has(r)
        ? { error: 'invalid_grant' }
        : { access_token: `a-${r}`, refresh_token: `${r}x`, expires_in: 3600 };
      used.add(r);
      return new Response(JSON.stringify(body));
    });
    vi.stubGlobal('fetch', fetch);
    const store = await dbTokenStore({ secret: SECRET, clientId: 'c', clientSecret: 's' });
    const [a, b] = await Promise.all([store.get(158), store.get(158)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a?.accessToken).toBe('a-r1');
    expect(b?.accessToken).toBe('a-r1');
    expect(sealer(SECRET).open(rows.get(158)!.refreshToken as string)).toBe('r1x');
  });

  it('a refused renewal is reported with Bitrix24’s code and asks to sign in again', async () => {
    storeExpired();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'invalid_grant' })));
    const failed: [number, string][] = [];
    const store = await dbTokenStore({
      secret: SECRET,
      clientId: 'c',
      clientSecret: 's',
      onRefreshFail: (u, reason) => void failed.push([u, reason]),
    });
    expect(await store.get(158)).toBeNull();
    expect(failed).toEqual([[158, 'invalid_grant']]);
  });

  it('a network failure is reported without the request (it carries the secret)', async () => {
    storeExpired();
    vi.stubGlobal('fetch', async () => {
      throw new Error('fetch failed https://oauth.bitrix.info/?client_secret=s&refresh_token=r1');
    });
    const failed: string[] = [];
    const store = await dbTokenStore({
      secret: SECRET,
      clientId: 'c',
      clientSecret: 's',
      onRefreshFail: (_u, reason) => void failed.push(reason),
    });
    expect(await store.get(158)).toBeNull();
    expect(failed).toEqual(['network error']);
  });
});
