import { indexTasks, issueTypeOf, type MetricTask } from '@nural/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '../data/dataset';
import { buildServer } from '../server';

const NOW = new Date('2026-10-10T06:30:00Z'); // 12:00 IST

let id = 1000;
const task = (over: Partial<MetricTask>): MetricTask => {
  const tags = over.tags ?? [];
  const issueType = issueTypeOf(tags);
  return {
    id: id++,
    title: 'Task',
    groupId: 154,
    stage: 'To do',
    stageTitle: 'To do',
    status: 2,
    priority: 1,
    responsibleId: 30,
    createdBy: 10,
    createdAt: new Date('2026-10-01T05:00:00Z'),
    changedAt: new Date('2026-10-05T05:00:00Z'),
    deadline: null,
    closedAt: null,
    parentId: null,
    relatedIds: [],
    tags,
    isIssue: issueType !== null,
    issueType,
    events: [],
    ...over,
  };
};

const tasks = [
  task({ id: 1, title: 'Price Update', deadline: new Date('2026-10-08T06:00:00Z') }),
  task({ id: 2, stage: 'QA Backlog', responsibleId: 28, groupId: 148, tags: ['API'] }),
  task({ id: 3, stage: 'LIVE', deadline: new Date('2026-10-20T06:00:00Z') }),
  task({ id: 4, responsibleId: 14 }), // tester: not on the Development tab
  task({
    id: 5,
    tags: ['Bug'],
    parentId: 1,
    stage: 'In QA',
    createdBy: 14,
    events: [{ from: 'In QA', to: 'To do', at: new Date('2026-10-03T05:00:00Z'), by: 14 }],
  }),
  task({ id: 6, tags: ['Feedback'], stage: 'Done', createdAt: new Date('2026-10-09T05:00:00Z') }),
];

const dataset: Dataset = {
  tasks,
  byId: indexTasks(tasks),
  testers: new Set([14]),
  users: new Map([
    [
      30,
      { id: 30, name: 'Neha Gautam', workPosition: null, deptGroup: 'Development', active: true },
    ],
    [
      28,
      {
        id: 28,
        name: 'Vijay Prajapati',
        workPosition: null,
        deptGroup: 'Development',
        active: true,
      },
    ],
    [
      14,
      { id: 14, name: 'Mohit Srivastava', workPosition: null, deptGroup: 'Testing', active: true },
    ],
    [
      10,
      { id: 10, name: 'Balram Jha', workPosition: null, deptGroup: 'Development', active: true },
    ],
  ]),
  projects: new Map([
    [148, { id: 148, name: 'Bitrix Project for testing.' }],
    [154, { id: 154, name: 'Support Tool' }],
  ]),
  portalOrigin: 'https://portal.example',
  loadedAt: NOW,
};

let app: Awaited<ReturnType<typeof buildServer>>;
beforeAll(async () => {
  app = await buildServer({
    getDataset: async () => dataset,
    now: () => NOW,
    logger: false,
    // Task 5's description lookup fails, to show the drawer still loads.
    describe: async (id) => {
      if (id === 5) throw new Error('Bitrix24 down');
      return `Description of ${id}`;
    },
  });
});
afterAll(() => app.close());

const get = async (url: string) => {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
};

describe('metrics API', () => {
  it('GET /api/dev/summary counts dev tasks only and splits by project', async () => {
    const all = await get('/api/dev/summary');
    expect(all.body).toMatchObject({ total: 3, pending: 1, completed: 2, deployed: 1, overdue: 1 });
    const one = await get('/api/dev/summary?project=154');
    expect(one.body.total).toBe(2);
    expect(one.body.split).toEqual({
      by: 'project',
      items: [{ id: 154, count: 2, name: 'Support Tool' }],
    });
  });

  it('rejects bad filter values with 400', async () => {
    const res = await get('/api/dev/summary?project=abc');
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe('project.0');
  });

  it('accepts repeated and comma-separated list params', async () => {
    expect((await get('/api/dev/summary?project=154&project=148')).body.total).toBe(3);
    expect((await get('/api/dev/summary?assignee=30,28')).body.split.by).toBe('assignee');
  });

  it('GET /api/dev/assignees, /ranking and /matrix return named rows', async () => {
    const a = await get('/api/dev/assignees');
    expect(a.body.rows[0]).toMatchObject({ id: 30, total: 2, person: { name: 'Neha Gautam' } });
    expect((await get('/api/dev/ranking')).status).toBe(200);
    const m = await get('/api/dev/matrix?splitTag=API');
    expect(m.body.rows).toHaveLength(1);
    expect(m.body.stages[0]).toEqual({ stage: 'To do', color: '#00C4FB' });
  });

  it('groups breakdowns by project with groupBy=project', async () => {
    const a = await get('/api/dev/assignees?groupBy=project');
    expect(a.body.groupBy).toBe('project');
    expect(a.body.rows[0]).toMatchObject({ name: expect.any(String), person: null });
    expect(a.body.rows.map((r: { id: number }) => r.id)).toEqual(expect.arrayContaining([148]));
    expect(a.body.rows.find((r: { id: number }) => r.id === 148).name).toBe(
      'Bitrix Project for testing.',
    );
    const m = await get('/api/dev/matrix?groupBy=project');
    expect(m.body.rows.every((r: { person: unknown }) => r.person === null)).toBe(true);
    const q = await get('/api/qa/issues?groupBy=project');
    expect(q.body.byAssignee[0]).toMatchObject({ name: expect.any(String), person: null });
    expect((await get('/api/dev/assignees?groupBy=team')).status).toBe(400);
  });

  it('GET /api/qa/summary and /api/qa/issues', async () => {
    const s = await get('/api/qa/summary');
    expect(s.body).toMatchObject({
      total: 2,
      open: 1,
      resolved: 1,
      reworkIssues: 1,
      reworkTotal: 1,
    });
    expect(s.body.lastFiled).toEqual({ date: '2026-10-09', isToday: false, count: 1 });
    const bugs = await get('/api/qa/summary?type=bug');
    expect(bugs.body.total).toBe(1);
    const i = await get('/api/qa/issues');
    expect(i.body.waitingForRetest).toEqual({
      total: 1,
      byCreator: [
        {
          id: 14,
          count: 1,
          oldestDays: 5,
          person: expect.objectContaining({ name: 'Mohit Srivastava' }),
        },
      ],
    });
  });

  it('GET /api/qa/testing lists the testing team', async () => {
    const t = await get('/api/qa/testing');
    expect(t.body.rows[0]).toMatchObject({ id: 14, isTester: true, total: 1 });
  });

  it('GET /api/tasks applies presets, search, sort and paging', async () => {
    const overdue = await get('/api/tasks?preset=overdue');
    expect(overdue.body.rows.map((r: { id: number }) => r.id)).toEqual([1]);
    expect(overdue.body.rows[0]).toMatchObject({
      url: 'https://portal.example/workgroups/group/154/tasks/task/view/1/',
      overdue: true,
      ageingDays: 2,
      project: { name: 'Support Tool' },
    });
    const search = await get('/api/tasks?q=price');
    expect(search.body.total).toBe(1);
    const sorted = await get('/api/tasks?sort=-deadline&pageSize=1&page=1');
    expect(sorted.body).toMatchObject({ total: 3, pageSize: 1 });
    expect(sorted.body.rows[0].id).toBe(3); // latest deadline first
    const latest = await get('/api/tasks?kind=issues&preset=lastFiled');
    expect(latest.body.rows.map((r: { id: number }) => r.id)).toEqual([6]);
    expect((await get('/api/tasks?preset=bogus')).status).toBe(400);
  });

  it('GET /api/tasks/:id returns the drawer with linked issues and reopens', async () => {
    const d = await get('/api/tasks/1');
    expect(d.body.linkedIssues.map((r: { id: number }) => r.id)).toEqual([5]);
    expect(d.body.description).toBe('Description of 1');
    const issue = await get('/api/tasks/5');
    expect(issue.status).toBe(200);
    expect(issue.body.description).toBeNull();
    expect(issue.body.parent.id).toBe(1);
    expect(issue.body.reopens).toHaveLength(1);
    expect(issue.body.task).toMatchObject({ rework: 1, linkedTaskId: 1, issueType: 'bug' });
    expect((await get('/api/tasks/999')).status).toBe(404);
  });

  it('GET /api/filters/options is contextual', async () => {
    const all = await get('/api/filters/options');
    expect(all.body.assignees.map((a: { id: number }) => a.id).sort()).toEqual([28, 30]);
    const one = await get('/api/filters/options?project=148');
    expect(one.body.assignees.map((a: { id: number }) => a.id)).toEqual([28]);
    expect(one.body.projects).toHaveLength(2);
    const qa = await get('/api/filters/options?tab=qa');
    expect(qa.body.issueTypes.map((t: { value: string }) => t.value).sort()).toEqual([
      'bug',
      'feedback',
    ]);
  });
});
