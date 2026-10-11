// Reports (SRS 19): who gets what, preview vs live, no duplicates, conditions, channels, failures.
import { indexTasks, issueTypeOf, type MetricTask } from '@nural/shared';
import { describe, expect, it } from 'vitest';
import { noGrants } from '../auth/rights';
import type { Dataset } from '../data/dataset';
import type { Mail, Mailer } from '../integrations/mail';
import type { Slack, SlackMessage } from '../integrations/slack';
import { runReport, type EngineDeps } from './engine';
import { definitionSchema, type Report } from './model';
import { memoryReportStore } from './store';

const ist = (local: string) => new Date(`${local}+05:30`);
// Monday 12 Oct 2026, 18:30 IST.
const NOW = ist('2026-10-12T18:30');

// 1 admin; 12 team lead heading Backend (dept 18, sub-dept 19); 30 and 31 in Backend; 40 in Sales
// (not under 12); 70 owns project 500.
const users = [
  [1, 'Asha Admin', 18],
  [12, 'Tara Lead', 18],
  [30, 'Neel Dev', 19],
  [31, 'Ira Dev', 18],
  [40, 'Sam Sales', 20],
  [70, 'Omar Owner', 20],
] as const;
const departments = [
  { id: 1, name: 'Company', parentId: null, headId: 1 },
  { id: 18, name: 'Backend', parentId: 1, headId: 12 },
  { id: 19, name: 'Backend API', parentId: 18, headId: null },
  { id: 20, name: 'Sales', parentId: 1, headId: null },
];

let n = 1;
const task = (title: string, over: Partial<MetricTask>): MetricTask => ({
  id: n++,
  title,
  groupId: 100,
  stage: 'To do',
  stageTitle: 'To do',
  status: 2,
  priority: 1,
  responsibleId: 30,
  createdBy: 30,
  createdAt: ist('2026-09-01T10:00'),
  changedAt: NOW,
  deadline: ist('2026-10-05T18:00'),
  closedAt: null,
  parentId: null,
  relatedIds: [],
  tags: [],
  isIssue: false,
  issueType: issueTypeOf([]),
  events: [],
  ...over,
});
const tasks = [
  task('Neel overdue', { responsibleId: 30, createdBy: 30 }),
  task('Ira overdue', { responsibleId: 31, createdBy: 31 }),
  task('Sam overdue', { responsibleId: 40, createdBy: 40, groupId: 300 }),
  task('Owner project task', { responsibleId: 40, createdBy: 40, groupId: 500 }),
];

const dataset = async (): Promise<Dataset> =>
  ({
    tasks,
    byId: indexTasks(tasks),
    testers: new Set(),
    users: new Map(
      users.map(([id, name, dept]) => [
        id,
        {
          id,
          name,
          workPosition: null,
          email: `${name.split(' ')[0]!.toLowerCase()}@nural.test`,
          deptGroup: 'Development' as const,
          active: true,
          departmentIds: [dept],
        },
      ]),
    ),
    projects: new Map([
      [100, { id: 100, name: 'Edge' }],
      [300, { id: 300, name: 'Sales app' }],
      [500, { id: 500, name: 'Owned' }],
    ]),
    owners: new Map([[500, 70]]),
    kpiDept: new Map(),
    departments,
    portalOrigin: 'https://portal.example',
    loadedAt: NOW,
  }) as unknown as Dataset;

function senders(connected = true, failFor?: string) {
  const mails: Mail[] = [];
  const dms: { email: string; m: SlackMessage }[] = [];
  const posts: { channel: string; m: SlackMessage }[] = [];
  const mailer: Mailer = {
    connected,
    from: 'dash@nural.test',
    send: async (m) => {
      if (m.to[0] === failFor) throw new Error('Mailbox full');
      mails.push(m);
    },
  };
  const slack: Slack = {
    connected,
    team: async () => 'Nural',
    toPerson: async (email, m) => void dms.push({ email, m }),
    toChannel: async (channel, m) => void posts.push({ channel, m }),
    channels: async () => [],
  };
  return { mails, dms, posts, mailer, slack };
}

function setup(
  def: unknown,
  state: Report['state'] = 'live',
  opts: { connected?: boolean; failFor?: string; now?: Date } = {},
) {
  const s = senders(opts.connected ?? true, opts.failFor);
  const store = memoryReportStore();
  const deps: EngineDeps = {
    dataset,
    roles: { admins: [1], pms: [], teamLeads: [12], productOwners: [] },
    grants: noGrants,
    mailer: s.mailer,
    slack: s.slack,
    store,
    tz: 'Asia/Kolkata',
    now: () => opts.now ?? NOW,
    dashboardUrl: 'https://dash.example',
  };
  const report: Report = {
    id: 1,
    name: 'Daily update',
    state,
    definition: definitionSchema.parse(def),
    createdBy: 1,
    updatedAt: NOW,
  };
  return { ...s, store, deps, report };
}

const daily = (over: Record<string, unknown> = {}) => ({
  schedule: { kind: 'daily', time: '18:30' },
  audience: { roles: ['teamLead', 'member'], users: [] },
  topics: ['summary', 'improve'],
  delivery: { mail: true, slackDm: false, slackChannels: [], cc: ['boss@nural.test'] },
  ...over,
});

describe('report runs', () => {
  it('live: each recipient gets their own scope, with CC', async () => {
    const s = setup(daily());
    const r = await runReport(s.report, s.deps, { kind: 'scheduled' });
    const to = (who: string) => s.mails.find((m) => m.to[0] === who)!;
    // Team leads and members; Omar owns a project, so he is a product owner and not included.
    expect(s.mails.map((m) => m.to[0]).sort()).toEqual([
      'ira@nural.test',
      'neel@nural.test',
      'sam@nural.test',
      'tara@nural.test',
    ]);
    expect(r).toMatchObject({ sent: 4, failed: 0 });
    // The team lead: their team (Backend and Backend API), not Sales.
    expect(to('tara@nural.test').html).toContain('Your team and projects');
    expect(to('tara@nural.test').html).toContain('Neel overdue');
    expect(to('tara@nural.test').html).toContain('Ira overdue');
    expect(to('tara@nural.test').html).not.toContain('Sam overdue');
    // A member: their own tasks only.
    expect(to('neel@nural.test').html).toContain('Your tasks');
    expect(to('neel@nural.test').html).not.toContain('Ira overdue');
    expect(to('neel@nural.test').cc).toEqual(['boss@nural.test']);
  });

  it('never sends twice for the same period', async () => {
    const s = setup(daily());
    await runReport(s.report, s.deps, { kind: 'scheduled' });
    const again = await runReport(s.report, s.deps, { kind: 'scheduled' });
    expect(again).toMatchObject({ sent: 0, skipped: 4 });
    expect(s.mails).toHaveLength(4);
  });

  it('preview: only admins get it, built as for a real recipient, with who it would reach', async () => {
    const s = setup(daily(), 'preview');
    await runReport(s.report, s.deps, { kind: 'scheduled' });
    expect(s.mails.map((m) => m.to[0])).toEqual(['asha@nural.test']);
    expect(s.mails[0]!.subject).toMatch(/^\[PREVIEW\] Daily update/);
    expect(s.mails[0]!.html).toContain(
      'When live it goes to: Tara Lead, Neel Dev, Ira Dev, Sam Sales',
    );
    expect(s.mails[0]!.cc).toEqual([]);
  });

  it('admins get the company view; channels get one company copy, not in preview', async () => {
    const def = daily({
      audience: { roles: ['admin'], users: [] },
      delivery: { mail: true, slackDm: false, slackChannels: ['#dev-updates'], cc: [] },
    });
    const s = setup(def);
    await runReport(s.report, s.deps, { kind: 'scheduled' });
    expect(s.mails[0]!.html).toContain('The whole company');
    expect(s.mails[0]!.html).toContain('Sam overdue');
    expect(s.posts.map((p) => p.channel)).toEqual(['#dev-updates']);
    const p = setup(def, 'preview');
    await runReport(p.report, p.deps, { kind: 'scheduled' });
    expect(p.posts).toHaveLength(0);
  });

  it('product owners get their own projects', async () => {
    const s = setup(daily({ audience: { roles: ['productOwner'], users: [] } }));
    await runReport(s.report, s.deps, { kind: 'scheduled' });
    expect(s.mails.map((m) => m.to[0])).toEqual(['omar@nural.test']);
    expect(s.mails[0]!.html).toContain('Your projects');
    expect(s.mails[0]!.html).toContain('Owner project task');
    expect(s.mails[0]!.html).not.toContain('Sam overdue');
  });

  it('Slack direct messages go to each person by email', async () => {
    const s = setup(
      daily({
        audience: { roles: [], users: [30] },
        delivery: { mail: false, slackDm: true, slackChannels: [], cc: [] },
      }),
    );
    await runReport(s.report, s.deps, { kind: 'scheduled' });
    expect(s.dms.map((d) => d.email)).toEqual(['neel@nural.test']);
    expect(JSON.stringify(s.dms[0]!.m.blocks)).toContain('Neel overdue');
  });

  it('conditional: only those who meet the condition', async () => {
    const def = {
      ...daily({ audience: { roles: ['member', 'teamLead'], users: [] } }),
      schedule: { kind: 'conditional', time: '18:30' },
      condition: { metric: 'overdueShare', when: 'poor', threshold: 30 },
    };
    const s = setup(def);
    // Overdue share needs 3+ open tasks: only the team lead (team of 2 + none) and nobody else
    // has enough, so give Neel three overdue tasks of his own.
    tasks.push(task('Neel 2', { responsibleId: 30 }), task('Neel 3', { responsibleId: 30 }));
    const r = await runReport(s.report, s.deps, { kind: 'scheduled' });
    tasks.splice(-2);
    expect(r.intended).toEqual([12, 30]);
    expect(s.mails.map((m) => m.to[0]).sort()).toEqual(['neel@nural.test', 'tara@nural.test']);
  });

  it('logs not-connected and failed sends, and carries on', async () => {
    const off = setup(daily());
    off.deps.mailer = { ...off.mailer, connected: false };
    const r = await runReport(off.report, off.deps, { kind: 'scheduled' });
    expect(r).toMatchObject({ sent: 0, skipped: 4 });
    expect((await off.store.runs(1, 10))[0]).toMatchObject({
      status: 'skipped',
      error: 'Microsoft 365 is not connected.',
    });

    const bad = setup(daily(), 'live', { failFor: 'neel@nural.test' });
    const r2 = await runReport(bad.report, bad.deps, { kind: 'scheduled' });
    expect(r2).toMatchObject({ sent: 3, failed: 1 });
    expect((await bad.store.runs(1, 10)).find((x) => x.status === 'failed')!.error).toBe(
      'Mailbox full',
    );
  });

  it('daily reports skip weekends; tests go only to the admin who asked', async () => {
    const sunday = setup(daily(), 'live', { now: ist('2026-10-11T18:30') });
    expect(await runReport(sunday.report, sunday.deps, { kind: 'scheduled' })).toMatchObject({
      note: 'not a working day',
    });
    const t = setup(daily());
    await runReport(t.report, t.deps, { kind: 'test', userId: 1, sampleFor: 12 });
    expect(t.mails.map((m) => m.to[0])).toEqual(['asha@nural.test']);
    expect(t.mails[0]!.subject).toMatch(/^\[TEST\]/);
    expect(t.mails[0]!.html).toContain('sample: Tara Lead');
  });
});

describe('report definitions', () => {
  it('refuses incomplete reports', () => {
    expect(definitionSchema.safeParse(daily({ topics: [] })).success).toBe(false);
    expect(
      definitionSchema.safeParse({ ...daily(), schedule: { kind: 'conditional', time: '09:00' } })
        .success,
    ).toBe(false);
    expect(
      definitionSchema.safeParse(
        daily({ delivery: { mail: false, slackDm: false, slackChannels: [], cc: [] } }),
      ).success,
    ).toBe(false);
    expect(
      definitionSchema.safeParse(daily({ schedule: { kind: 'daily', time: '25:00' } })).success,
    ).toBe(false);
  });
});
