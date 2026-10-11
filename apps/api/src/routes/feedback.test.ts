// Support tab feedback: who may submit, who sees what (admins only read everything).
import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { DatasetProvider } from '../data/dataset';
import { buildServer } from '../server';
import { memoryFeedbackStore } from './feedback';

const SECRET = 'f'.repeat(40);
// 1 admin, 12 team lead, 52 support agent, 53 head of Tech Support, 30 developer (member).
const dataset = (async () => ({
  tasks: [],
  byId: new Map(),
  testers: new Set(),
  users: new Map(
    [1, 12, 52, 53, 30].map((id) => [
      id,
      { id, name: `Person ${id}`, active: true, deptGroup: 'Other' },
    ]),
  ),
  projects: new Map(),
  owners: new Map(),
  supportLead: 53,
  kpiDept: new Map([
    [52, 'support'],
    [53, 'support'],
    [30, 'dev'],
    [12, 'dev'],
  ]),
  portalOrigin: 'https://portal.example',
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
    feedback: memoryFeedbackStore(),
    roles: { admins: [1], pms: [], teamLeads: [12], productOwners: [] },
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 's',
      sessionSecret: SECRET,
      portalOrigin: 'https://portal.example',
      secure: true,
    },
  });
  return app;
}

const cookie = (uid: number) =>
  `${SESSION_COOKIE}=${sign({ userId: uid, name: `Person ${uid}`, exp: Date.now() + 60_000 }, SECRET)}`;
const call = (method: 'GET' | 'POST', url: string, uid: number, payload?: unknown) =>
  app!.inject({
    method,
    url,
    headers: { cookie: cookie(uid) },
    payload: payload as Record<string, unknown>,
  });

const entry = {
  topic: 'supportTab',
  needs: ['openByProject', 'firstResponse'],
  frequency: 'daily',
  problem: 'I count open tickets per client by hand every morning.',
  priority: 'must',
  rating: 4,
};

describe('Support tab feedback', () => {
  it('the support team, team leads and admins may submit; others may not', async () => {
    await server();
    expect((await call('POST', '/api/feedback', 52, entry)).statusCode).toBe(200);
    expect((await call('POST', '/api/feedback', 12, entry)).statusCode).toBe(200);
    expect((await call('POST', '/api/feedback', 1, entry)).statusCode).toBe(200);
    expect((await call('POST', '/api/feedback', 30, entry)).statusCode).toBe(403);
    expect((await call('GET', '/api/auth/me', 52)).json()).toMatchObject({
      support: true,
      admin: false,
    });
    expect((await call('GET', '/api/auth/me', 30)).json()).toMatchObject({
      support: false,
      admin: false,
    });
  });

  it('validates the form', async () => {
    await server();
    const short = await call('POST', '/api/feedback', 52, { ...entry, problem: 'too short' });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toMatch(/at least 10/);
    expect((await call('POST', '/api/feedback', 52, { ...entry, rating: 9 })).statusCode).toBe(400);
  });

  it('everyone sees only their own entries; only admins see the inbox', async () => {
    await server();
    await call('POST', '/api/feedback', 52, entry);
    await call('POST', '/api/feedback', 12, {
      ...entry,
      problem: 'Team lead view of escalations.',
    });
    const mine = (await call('GET', '/api/feedback/mine', 52)).json().rows;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: 'Person 52', dept: 'Support', role: 'member' });
    for (const uid of [52, 12, 30]) {
      expect((await call('GET', '/api/feedback', uid)).statusCode, `user ${uid}`).toBe(403);
      expect((await call('GET', '/api/feedback/export', uid)).statusCode, `user ${uid}`).toBe(403);
    }
    const inbox = (await call('GET', '/api/feedback', 1)).json();
    expect((await call('GET', '/api/feedback', 53)).statusCode, 'support lead').toBe(200);
    expect((await call('GET', '/api/auth/me', 53)).json()).toMatchObject({
      admin: false,
      inbox: true,
    });
    expect(inbox.counts).toEqual({ total: 2, new: 2, mustHave: 2 });
  });

  it('admins mark entries reviewed, add a note and export them', async () => {
    await server();
    const { id } = (await call('POST', '/api/feedback', 52, entry)).json();
    expect(
      (await call('POST', `/api/feedback/${id}/review`, 12, { status: 'reviewed' })).statusCode,
    ).toBe(403);
    const res = await call('POST', `/api/feedback/${id}/review`, 1, {
      status: 'reviewed',
      adminNote: 'Planned for the Support tab.',
    });
    expect(res.json().row).toMatchObject({
      status: 'reviewed',
      adminNote: 'Planned for the Support tab.',
    });
    const xlsx = await call('GET', '/api/feedback/export', 1);
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
  });
});
