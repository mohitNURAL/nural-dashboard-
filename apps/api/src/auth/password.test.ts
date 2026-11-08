import { afterEach, describe, expect, it } from 'vitest';
import type { DatasetProvider } from '../data/dataset';
import { buildServer } from '../server';
import { checkPassword, hashPassword, memoryAccountStore } from './password';
import { readSession, sign, SESSION_COOKIE } from './session';

const SECRET = 'x'.repeat(40);
const users = new Map([
  [7, { id: 7, name: 'Neha Gautam', email: 'Neha@NuralTech.com', active: true }],
  [8, { id: 8, name: 'Left Company', email: 'left@nuraltech.com', active: false }],
  [9, { id: 9, name: 'Outside', email: 'someone@gmail.com', active: true }],
  [1, { id: 1, name: 'Admin Person', email: 'admin@nuraltech.com', active: true }],
]);
const dataset = (async () => ({
  tasks: [],
  byId: new Map(),
  testers: new Set(),
  users,
  projects: new Map(),
  portalOrigin: 'https://portal.example',
  loadedAt: new Date(),
})) as unknown as DatasetProvider;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
let mails: { to: string[]; subject: string; html: string }[] = [];

async function server(connected = true) {
  mails = [];
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    accounts: memoryAccountStore(),
    roles: { admins: [1], pms: [], teamLeads: [], productOwners: [] },
    reports: {
      mailer: { connected, from: 'pulse@nuraltech.com', send: async (m) => void mails.push(m) },
    },
    auth: {
      mode: 'bitrix',
      clientId: 'local.app',
      clientSecret: 'shh',
      sessionSecret: SECRET,
      portalOrigin: 'https://portal.example',
      secure: true,
    },
  });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const post = (url: string, payload: unknown) =>
  app!.inject({ method: 'POST', url, payload: payload as object });
const codeOf = () => /(\d{6}) is your/.exec(mails.at(-1)?.subject ?? '')?.[1] ?? '';
const sessionOf = (res: { headers: Record<string, unknown> }) => {
  const set = ([] as string[]).concat((res.headers['set-cookie'] as string[]) ?? []);
  const raw = set
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split(';')[0]
    ?.split('=')[1];
  return readSession(raw && decodeURIComponent(raw), SECRET);
};

async function register(email = 'neha@nuraltech.com', password = 'a-long-password') {
  expect((await post('/api/auth/code', { email })).statusCode).toBe(200);
  return post('/api/auth/password', { email, code: codeOf(), password });
}

describe('Pulse account (email and password)', () => {
  it('hashes passwords with scrypt and checks them', async () => {
    const h = await hashPassword('correct horse');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(h).not.toContain('correct');
    expect(await checkPassword('correct horse', h)).toBe(true);
    expect(await checkPassword('wrong horse', h)).toBe(false);
  });

  it('serves the sign-in page with both ways in', async () => {
    const res = await (await server()).inject('/api/auth/signin');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Create account');
    expect(res.body).toContain('/api/auth/login');
  });

  it('only accepts @nuraltech.com emails', async () => {
    await server();
    for (const email of ['someone@gmail.com', 'x@nuraltech.com.evil.io', 'nuraltech.com', '']) {
      const res = await post('/api/auth/code', { email });
      expect(res.statusCode, email).toBe(400);
    }
    expect(mails).toHaveLength(0);
  });

  it('mails a code only to an active Bitrix24 user, with the same answer for anyone else', async () => {
    await server();
    const a = await post('/api/auth/code', { email: 'nobody@nuraltech.com' });
    const b = await post('/api/auth/code', { email: 'left@nuraltech.com' });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(mails).toHaveLength(0);
    const c = await post('/api/auth/code', { email: ' NEHA@nuraltech.com ' });
    expect(c.statusCode).toBe(200);
    expect(mails[0]!.to).toEqual(['neha@nuraltech.com']);
    expect(codeOf()).toMatch(/^\d{6}$/);
  });

  it('creates the account with the mailed code and signs in as that Bitrix24 user', async () => {
    await server();
    const res = await register();
    expect(res.statusCode).toBe(200);
    expect(sessionOf(res)).toMatchObject({ userId: 7, name: 'Neha Gautam' });
    const login = await post('/api/auth/password-login', {
      email: 'Neha@nuraltech.com',
      password: 'a-long-password',
    });
    expect(login.statusCode).toBe(200);
    expect(sessionOf(login)?.userId).toBe(7);
  });

  it('refuses a wrong code, and the code works only once', async () => {
    await server();
    await post('/api/auth/code', { email: 'neha@nuraltech.com' });
    const code = codeOf();
    const bad = await post('/api/auth/password', {
      email: 'neha@nuraltech.com',
      code: code === '000000' ? '111111' : '000000',
      password: 'a-long-password',
    });
    expect(bad.statusCode).toBe(400);
    const ok = { email: 'neha@nuraltech.com', code, password: 'a-long-password' };
    expect((await post('/api/auth/password', ok)).statusCode).toBe(200);
    expect((await post('/api/auth/password', ok)).statusCode).toBe(400);
  });

  it('refuses a short password', async () => {
    await server();
    await post('/api/auth/code', { email: 'neha@nuraltech.com' });
    const res = await post('/api/auth/password', {
      email: 'neha@nuraltech.com',
      code: codeOf(),
      password: 'short',
    });
    expect(res.statusCode).toBe(400);
  });

  it('locks the account after 5 wrong passwords', async () => {
    await server();
    await register();
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/auth/password-login', {
        email: 'neha@nuraltech.com',
        password: 'nope-nope-nope',
      });
      expect(r.statusCode).toBe(401);
    }
    const locked = await post('/api/auth/password-login', {
      email: 'neha@nuraltech.com',
      password: 'a-long-password',
    });
    expect(locked.statusCode).toBe(429);
    expect(sessionOf(locked)).toBeNull();
  });

  it('answers a wrong password and an unknown email alike', async () => {
    await server();
    const r = await post('/api/auth/password-login', {
      email: 'ghost@nuraltech.com',
      password: 'whatever-123',
    });
    expect(r.statusCode).toBe(401);
    expect(r.json().error).toBe('Email or password is wrong.');
  });

  it("accepts only JSON (no sign-in from another site's form)", async () => {
    await server();
    const res = await app!.inject({
      method: 'POST',
      url: '/api/auth/password-login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'email=neha%40nuraltech.com&password=a-long-password',
    });
    expect(res.statusCode).toBe(415);
  });

  it('says so when mail is not set up', async () => {
    await server(false);
    expect((await post('/api/auth/code', { email: 'neha@nuraltech.com' })).statusCode).toBe(503);
  });
});

const as = (userId: number) => ({
  cookie: `${SESSION_COOKIE}=${encodeURIComponent(sign({ userId, name: 'x', exp: Date.now() + 60_000 }, SECRET))}`,
});

describe('Pulse accounts set up by an admin', () => {
  it('lets only admins see or set an account', async () => {
    await server();
    const get = await app!.inject({ url: '/api/accounts/7', headers: as(7) });
    expect(get.statusCode).toBe(403);
    const put = await app!.inject({
      method: 'PUT',
      url: '/api/accounts/7',
      headers: as(7),
      payload: { password: 'temporary-pass-1' },
    });
    expect(put.statusCode).toBe(403);
  });

  it('sets a temporary password that must be changed at the first sign-in', async () => {
    await server();
    const info = await app!.inject({ url: '/api/accounts/7', headers: as(1) });
    expect(info.json()).toMatchObject({
      email: 'neha@nuraltech.com',
      allowed: true,
      account: null,
    });
    const put = await app!.inject({
      method: 'PUT',
      url: '/api/accounts/7',
      headers: as(1),
      payload: { password: 'temporary-pass-1' },
    });
    expect(put.statusCode).toBe(200);
    expect(mails).toHaveLength(0);

    // The temporary password alone gives no session.
    const first = await post('/api/auth/password-login', {
      email: 'neha@nuraltech.com',
      password: 'temporary-pass-1',
    });
    expect(first.json()).toEqual({ change: true });
    expect(sessionOf(first)).toBeNull();

    const same = await post('/api/auth/password-change', {
      email: 'neha@nuraltech.com',
      password: 'temporary-pass-1',
      newPassword: 'temporary-pass-1',
    });
    expect(same.statusCode).toBe(400);
    const wrong = await post('/api/auth/password-change', {
      email: 'neha@nuraltech.com',
      password: 'not-the-temp-1',
      newPassword: 'my-own-password',
    });
    expect(wrong.statusCode).toBe(401);
    const changed = await post('/api/auth/password-change', {
      email: 'neha@nuraltech.com',
      password: 'temporary-pass-1',
      newPassword: 'my-own-password',
    });
    expect(changed.statusCode).toBe(200);
    expect(sessionOf(changed)?.userId).toBe(7);

    const next = await post('/api/auth/password-login', {
      email: 'neha@nuraltech.com',
      password: 'my-own-password',
    });
    expect(sessionOf(next)?.userId).toBe(7);
    const after = await app!.inject({ url: '/api/accounts/7', headers: as(1) });
    expect(after.json().account).toMatchObject({ mustChange: false });
  });

  it('refuses people without an @nuraltech.com email or not active', async () => {
    await server();
    for (const id of [9, 8]) {
      const r = await app!.inject({
        method: 'PUT',
        url: `/api/accounts/${id}`,
        headers: as(1),
        payload: { password: 'temporary-pass-1' },
      });
      expect(r.statusCode, String(id)).toBe(400);
    }
  });

  it('removes an account', async () => {
    await server();
    await app!.inject({
      method: 'PUT',
      url: '/api/accounts/7',
      headers: as(1),
      payload: { password: 'temporary-pass-1' },
    });
    const del = await app!.inject({ method: 'DELETE', url: '/api/accounts/7', headers: as(1) });
    expect(del.statusCode).toBe(200);
    const login = await post('/api/auth/password-login', {
      email: 'neha@nuraltech.com',
      password: 'temporary-pass-1',
    });
    expect(login.statusCode).toBe(401);
  });
});
