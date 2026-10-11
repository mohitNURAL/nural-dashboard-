// Help (SRS 20): feedback with attachments, the inbox, scoped pickers, Finance for admins.
import { indexTasks, issueTypeOf, type MetricTask } from '@nural/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { sign, SESSION_COOKIE } from '../auth/session';
import type { Dataset } from '../data/dataset';
import { buildServer } from '../server';
import { fileType, MAX_BYTES } from './help';

const SECRET = 'h'.repeat(40);
const task = (id: number, groupId: number, responsibleId: number): MetricTask => ({
  id,
  title: `Task ${id}`,
  groupId,
  stage: 'To do',
  stageTitle: 'To do',
  status: 2,
  priority: 1,
  responsibleId,
  createdBy: responsibleId,
  createdAt: new Date('2026-09-01'),
  changedAt: new Date('2026-10-01'),
  deadline: null,
  closedAt: null,
  parentId: null,
  relatedIds: [],
  tags: [],
  isIssue: false,
  issueType: issueTypeOf([]),
  events: [],
});
const tasks = [task(1, 100, 30), task(2, 200, 31)];
const dataset = async (): Promise<Dataset> =>
  ({
    tasks,
    byId: indexTasks(tasks),
    testers: new Set(),
    users: new Map(
      [
        [1, 'Asha Admin'],
        [30, 'Neel Dev'],
        [31, 'Ira Dev'],
      ].map(([id, name]) => [
        id,
        {
          id,
          name,
          workPosition: null,
          email: null,
          deptGroup: 'Development',
          active: true,
          departmentIds: [],
        },
      ]),
    ),
    projects: new Map([
      [100, { id: 100, name: 'Edge' }],
      [200, { id: 200, name: 'Other' }],
    ]),
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
  });
}
const cookie = (uid: number) =>
  `${SESSION_COOKIE}=${sign({ userId: uid, name: 'x', exp: Date.now() + 60_000 }, SECRET)}`;
const call = (method: 'GET' | 'POST', url: string, uid: number, payload?: unknown) =>
  app!.inject({
    method,
    url,
    headers: { cookie: cookie(uid) },
    payload: payload as Record<string, unknown>,
  });

const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
const base = {
  aboutKind: 'dashboard',
  title: 'Export is slow',
  details: 'The Excel takes long.',
  impact: 'medium',
};

describe('help feedback', () => {
  it('knows which files may be attached', () => {
    expect(fileType('shot.PNG')).toBe('image/png');
    expect(fileType('plan.docx')).toMatch(/wordprocessingml/);
    expect(fileType('run.exe')).toBeNull();
    expect(fileType('page.html')).toBeNull();
  });

  it('a member sends feedback with a screenshot and sees only their own', async () => {
    await server();
    const r = await call('POST', '/api/help/feedback', 30, {
      ...base,
      files: [{ name: 'shot.png', data: png }],
    });
    expect(r.statusCode).toBe(200);
    const mine = (await call('GET', '/api/help/feedback/mine', 30)).json().rows;
    expect(mine).toHaveLength(1);
    expect(mine[0].files[0]).toMatchObject({ name: 'shot.png', mime: 'image/png' });
    expect((await call('GET', '/api/help/feedback/mine', 31)).json().rows).toEqual([]);
    // The file: the writer and the inbox, nobody else.
    const fid = mine[0].files[0].id;
    expect((await call('GET', `/api/help/files/${fid}`, 30)).statusCode).toBe(200);
    expect((await call('GET', `/api/help/files/${fid}`, 31)).statusCode).toBe(404);
    const asAdmin = await call('GET', `/api/help/files/${fid}?download`, 1);
    expect(asAdmin.headers['content-disposition']).toMatch(/^attachment/);
    expect(asAdmin.headers['x-content-type-options']).toBe('nosniff');
  });

  it('refuses other file types and files over 8 MB', async () => {
    await server();
    expect(
      (
        await call('POST', '/api/help/feedback', 30, {
          ...base,
          files: [{ name: 'a.exe', data: png }],
        })
      ).statusCode,
    ).toBe(400);
    const big = Buffer.alloc(MAX_BYTES + 1).toString('base64');
    expect(
      (
        await call('POST', '/api/help/feedback', 30, {
          ...base,
          files: [{ name: 'a.pdf', data: big }],
        })
      ).statusCode,
    ).toBe(400);
  });

  it('pickers and named projects follow what the sender can see', async () => {
    await server();
    const opts = (await call('GET', '/api/help/options', 30)).json();
    expect(opts.projects.map((p: { name: string }) => p.name)).toEqual(['Edge']);
    expect(
      (
        await call('POST', '/api/help/feedback', 30, {
          ...base,
          aboutKind: 'project',
          aboutId: 200,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/help/feedback', 30, {
          ...base,
          aboutKind: 'project',
          aboutId: 100,
        })
      ).statusCode,
    ).toBe(200);
  });

  it('the inbox is for its right; Finance feedback is for admins only', async () => {
    await server();
    expect((await call('GET', '/api/help/feedback', 30)).statusCode).toBe(403);
    expect(
      (await call('POST', '/api/help/feedback', 30, { ...base, aboutKind: 'finance' })).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', '/api/help/feedback', 1, { ...base, aboutKind: 'finance' })).statusCode,
    ).toBe(200);
    const inbox = (await call('GET', '/api/help/feedback', 1)).json().rows;
    expect(inbox).toHaveLength(1);
    expect(
      (
        await call('POST', `/api/help/feedback/${inbox[0].id}/review`, 1, {
          status: 'reviewed',
          note: 'Thanks',
        })
      ).statusCode,
    ).toBe(200);
    expect((await call('GET', '/api/help/feedback/export', 1)).statusCode).toBe(200);
  });
});
