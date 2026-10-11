// Per-person settings: sign-in count, layout and tour state; each person only their own.
import { afterEach, describe, expect, it } from 'vitest';
import type { TokenResponse } from '../auth/bitrixOAuth';
import { sign, SESSION_COOKIE, STATE_COOKIE } from '../auth/session';
import type { DatasetProvider } from '../data/dataset';
import { buildServer } from '../server';
import { memoryPrefsStore } from './prefs';

const SECRET = 'p'.repeat(40);
const PORTAL = 'https://portal.example';
const dataset = (async () => ({
  tasks: [],
  byId: new Map(),
  testers: new Set(),
  users: new Map([
    [7, { id: 7, name: 'Neha', active: true, deptGroup: 'Other' }],
    [8, { id: 8, name: 'Vijay', active: true, deptGroup: 'Other' }],
  ]),
  projects: new Map(),
  portalOrigin: PORTAL,
  loadedAt: new Date(),
})) as unknown as DatasetProvider;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server() {
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    prefs: memoryPrefsStore(),
    roles: { admins: [], pms: [], teamLeads: [], productOwners: [] },
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 's',
      sessionSecret: SECRET,
      portalOrigin: PORTAL,
      secure: true,
      exchange: async (): Promise<TokenResponse> => ({
        user_id: '7',
        client_endpoint: `${PORTAL}/rest/`,
      }),
    },
  });
  return app;
}

const cookie = (uid: number) =>
  `${SESSION_COOKIE}=${sign({ userId: uid, name: 'x', exp: Date.now() + 60_000 }, SECRET)}`;
const get = (uid: number) => app!.inject({ url: '/api/prefs', headers: { cookie: cookie(uid) } });
const put = (uid: number, payload: unknown) =>
  app!.inject({
    method: 'PUT',
    url: '/api/prefs',
    headers: { cookie: cookie(uid) },
    payload: payload as Record<string, unknown>,
  });

describe('per-person settings', () => {
  it('counts each sign-in', async () => {
    const a = await server();
    for (let i = 0; i < 2; i++) {
      await a.inject({
        url: '/api/auth/callback?code=c&state=s',
        headers: { cookie: `${STATE_COOKIE}=${sign({ state: 's' }, SECRET)}` },
      });
    }
    expect((await get(7)).json().loginCount).toBe(2);
    expect((await get(8)).json().loginCount).toBe(0);
  });

  it('each person reads and writes only their own', async () => {
    await server();
    const layout = { 'dev.tiles': ['overdue', 'total'] };
    const tour = { voice: true, shown: { dev: 1 }, seen: ['support-tab'] };
    expect((await put(7, { layout, tour })).statusCode).toBe(200);
    expect((await get(7)).json()).toMatchObject({ layout, tour });
    expect((await get(8)).json()).toEqual({ loginCount: 0, layout: {}, tour: {} });
    // Saving one field keeps the other.
    await put(7, { tour: { voice: false } });
    expect((await get(7)).json()).toMatchObject({ layout, tour: { voice: false } });
  });

  it('refuses bad input and needs a session', async () => {
    await server();
    expect((await put(7, { layout: { 'Bad Group': ['x'] } })).statusCode).toBe(400);
    expect((await put(7, { layout: { 'dev.tiles': ['<script>'] } })).statusCode).toBe(400);
    expect((await put(7, { tour: { shown: { dev: -1 } } })).statusCode).toBe(400);
    expect((await put(7, { userId: 8 })).statusCode).toBe(400);
    expect((await app!.inject({ url: '/api/prefs' })).statusCode).toBe(401);
  });
});
