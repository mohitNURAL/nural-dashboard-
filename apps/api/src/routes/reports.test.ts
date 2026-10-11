// Integration › Mailing API (SRS 19): admins only, validated, preview and test without spamming.
import { indexTasks } from '@nural/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { Dataset } from '../data/dataset';
import type { Mail } from '../integrations/mail';
import { buildServer } from '../server';

const SECRET = 'r'.repeat(40);
const dataset = async (): Promise<Dataset> =>
  ({
    tasks: [],
    byId: indexTasks([]),
    testers: new Set(),
    users: new Map(
      [
        [1, 'Asha Admin'],
        [30, 'Neel Dev'],
      ].map(([id, name]) => [
        id,
        {
          id,
          name,
          workPosition: null,
          email: `${String(name).split(' ')[0]!.toLowerCase()}@nural.test`,
          deptGroup: 'Development',
          active: true,
          departmentIds: [],
        },
      ]),
    ),
    projects: new Map(),
    owners: new Map(),
    kpiDept: new Map(),
    departments: [],
    portalOrigin: 'https://portal.example',
    loadedAt: new Date(),
  }) as unknown as Dataset;

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server() {
  const mails: Mail[] = [];
  app = await buildServer({
    getDataset: dataset,
    logger: false,
    roles: { admins: [1], pms: [], teamLeads: [], productOwners: [] },
    auth: {
      mode: 'bitrix',
      clientId: 'c',
      clientSecret: 's',
      sessionSecret: SECRET,
      portalOrigin: 'https://portal.example',
      secure: true,
    },
    reports: {
      mailer: { connected: true, from: 'dash@nural.test', send: async (m) => void mails.push(m) },
      slack: {
        connected: false,
        team: async () => null,
        toPerson: async () => undefined,
        toChannel: async () => undefined,
        channels: async () => [],
      },
    },
  });
  return { mails };
}

const cookie = (uid: number) =>
  `${SESSION_COOKIE}=${sign({ userId: uid, name: 'x', exp: Date.now() + 60_000 }, SECRET)}`;
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  uid: number,
  payload?: unknown,
) =>
  app!.inject({
    method,
    url,
    headers: { cookie: cookie(uid) },
    payload: payload as Record<string, unknown>,
  });

const report = {
  name: 'Daily update',
  definition: {
    schedule: { kind: 'daily', time: '18:30' },
    audience: { roles: ['member'], users: [] },
    topics: ['summary', 'dueToday'],
    prompts: ['How did today go for you?'],
    delivery: { mail: true, slackDm: false, slackChannels: [], cc: [] },
  },
};

describe('mailing API', () => {
  it('is for admins only', async () => {
    await server();
    for (const url of ['/api/reports', '/api/reports/catalogue', '/api/integrations/status']) {
      expect((await call('GET', url, 30)).statusCode, url).toBe(403);
    }
    expect((await call('POST', '/api/reports', 30, report)).statusCode).toBe(403);
  });

  it('shows the connections and the catalogue', async () => {
    await server();
    expect((await call('GET', '/api/integrations/status', 1)).json()).toMatchObject({
      mail: { connected: true, from: 'dash@nural.test' },
      slack: { connected: false },
      infowan: { connected: false },
      scheduling: false,
    });
    const cat = (await call('GET', '/api/reports/catalogue', 1)).json();
    expect(cat.topics.length).toBeGreaterThan(5);
    expect(cat.prompts).toContain('What did you do well this week?');
  });

  it('saves a report in preview, renders it for anyone, tests only to the asker', async () => {
    const { mails } = await server();
    expect(
      (
        await call('POST', '/api/reports', 1, {
          ...report,
          definition: { ...report.definition, topics: [] },
        })
      ).statusCode,
    ).toBe(400);
    const created = (await call('POST', '/api/reports', 1, report)).json().report;
    expect(created).toMatchObject({ state: 'preview', schedule: 'Every working day at 18:30' });
    const r = (await call('POST', `/api/reports/${created.id}/render`, 1, { userId: 30 })).json();
    expect(r.subject).toMatch(/^Daily update · /);
    expect(r.html).toContain('for Neel Dev');
    expect(r.html).toContain('How did today go for you?');
    expect(mails).toHaveLength(0);
    await call('POST', `/api/reports/${created.id}/test`, 1, { sampleFor: 30 });
    expect(mails.map((m) => m.to[0])).toEqual(['asha@nural.test']);
    expect(
      (await call('POST', `/api/reports/${created.id}/state`, 1, { state: 'live' })).json().report
        .state,
    ).toBe('live');
    expect((await call('GET', `/api/reports/${created.id}/runs`, 1)).json().runs[0]).toMatchObject({
      status: 'test',
      channel: 'mail',
    });
    expect((await call('DELETE', `/api/reports/${created.id}`, 1)).statusCode).toBe(200);
    expect((await call('GET', '/api/reports', 1)).json().reports).toEqual([]);
  });
});
