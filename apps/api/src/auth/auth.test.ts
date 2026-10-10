import { afterEach, describe, expect, it } from 'vitest';
import type { DatasetProvider } from '../data/dataset';
import { buildServer } from '../server';
import type { TokenResponse } from './bitrixOAuth';
import { readSession, sign, SESSION_COOKIE, STATE_COOKIE } from './session';

const SECRET = 'x'.repeat(40);
const PORTAL = 'https://portal.example';
const users = new Map([
  [7, { id: 7, name: 'Neha Gautam', active: true }],
  [8, { id: 8, name: 'Left Company', active: false }],
]);
const dataset = (async () => ({
  tasks: [],
  byId: new Map(),
  testers: new Set(),
  users,
  projects: new Map(),
  portalOrigin: PORTAL,
  loadedAt: new Date(),
})) as unknown as DatasetProvider;

let token: TokenResponse = {};
let app: Awaited<ReturnType<typeof buildServer>> | undefined;

async function server(mode: 'off' | 'bitrix' = 'bitrix') {
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    auth: {
      mode,
      clientId: 'local.app',
      clientSecret: 'shh',
      sessionSecret: SECRET,
      portalOrigin: PORTAL,
      secure: true,
      callbackUrl: 'https://dash.example/api/auth/callback',
      exchange: async () => token,
    },
  });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Cookie header for a callback whose state matches. */
const stateCookie = (state: string) => `${STATE_COOKIE}=${sign({ state }, SECRET)}`;

describe('Sign in with Bitrix24', () => {
  it('asks for sign-in on /api but not on /health or /api/auth', async () => {
    const a = await server();
    expect((await a.inject('/api/dev/summary')).statusCode).toBe(401);
    expect((await a.inject('/api/auth/me')).statusCode).toBe(401);
    expect((await a.inject('/health')).statusCode).toBe(200);
  });

  it('redirects to the portal authorize page with a state cookie', async () => {
    const res = await (await server()).inject('/api/auth/login');
    expect(res.statusCode).toBe(302);
    const to = new URL(res.headers.location as string);
    expect(to.origin + to.pathname).toBe(`${PORTAL}/oauth/authorize/`);
    expect(to.searchParams.get('client_id')).toBe('local.app');
    // Without it Bitrix24 returns to the app's handler path (the site root) and sign-in loops.
    expect(to.searchParams.get('redirect_uri')).toBe('https://dash.example/api/auth/callback');
    expect(String(res.headers['set-cookie'])).toContain(`${STATE_COOKIE}=`);
  });

  it('signs in an active portal user and opens /api', async () => {
    token = { user_id: '7', client_endpoint: `${PORTAL}/rest/` };
    const a = await server();
    const res = await a.inject({
      url: '/api/auth/callback?code=c1&state=s1',
      headers: { cookie: stateCookie('s1') },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const set = ([] as string[]).concat(res.headers['set-cookie'] as string[]);
    const session = set.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/Secure/);
    const value = session.split(';')[0]!;
    const me = await a.inject({ url: '/api/auth/me', headers: { cookie: value } });
    expect(me.json()).toMatchObject({ id: 7, name: 'Neha Gautam' });
    expect(
      (await a.inject({ url: '/api/dev/summary', headers: { cookie: value } })).statusCode,
    ).toBe(200);
  });

  it.each([
    ['a wrong state', { user_id: 7, client_endpoint: `${PORTAL}/rest/` }, 'other'],
    ['another portal', { user_id: 7, client_endpoint: 'https://evil.example/rest/' }, 's1'],
    ['an inactive user', { user_id: 8, client_endpoint: `${PORTAL}/rest/` }, 's1'],
    ['an unknown user', { user_id: 99, client_endpoint: `${PORTAL}/rest/` }, 's1'],
    ['an OAuth error', { error: 'invalid_grant' }, 's1'],
  ])('refuses %s', async (_why, t, state) => {
    token = t;
    const res = await (
      await server()
    ).inject({
      url: `/api/auth/callback?code=c1&state=${state}`,
      headers: { cookie: stateCookie('s1') },
    });
    expect(res.statusCode).toBe(403);
    expect(String(res.headers['set-cookie'])).not.toContain(`${SESSION_COOKIE}=`);
  });

  it('rejects a tampered or expired session', async () => {
    const a = await server();
    const good = sign({ userId: 7, name: 'Neha', exp: Date.now() + 60_000 }, SECRET);
    const tampered = good.replace(/^./, (c) => (c === 'e' ? 'f' : 'e'));
    const expired = sign({ userId: 7, name: 'Neha', exp: Date.now() - 1 }, SECRET);
    const forged = sign({ userId: 7, name: 'Neha', exp: Date.now() + 60_000 }, 'y'.repeat(40));
    for (const v of [tampered, expired, forged]) {
      const res = await a.inject({
        url: '/api/auth/me',
        headers: { cookie: `${SESSION_COOKIE}=${v}` },
      });
      expect(res.statusCode).toBe(401);
    }
    expect(readSession(good, SECRET)?.userId).toBe(7);
  });

  it('lets everything through with AUTH=off', async () => {
    const a = await server('off');
    expect((await a.inject('/api/dev/summary')).statusCode).toBe(200);
    expect((await a.inject('/api/auth/me')).json()).toMatchObject({ auth: 'off' });
  });
});
