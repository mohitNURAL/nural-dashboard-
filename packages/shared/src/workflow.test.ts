import { afterEach, describe, expect, it } from 'vitest';
import { completedAt, isOnHold, isPending, isReady, isSentToQa } from './metrics';
import {
  canonicalStage,
  isReworkMove,
  PENDING_STAGES,
  STAGE_COLORS,
  STAGE_TITLES,
  stageWithRole,
} from './stages';
import type { MetricTask } from './types';
import {
  applyWorkflow,
  classifyProject,
  DEFAULT_WORKFLOW,
  stageUsage,
  unmappedColumns,
  validateWorkflow,
  type Workflow,
} from './workflow';

afterEach(() => applyWorkflow(DEFAULT_WORKFLOW));

const task = (stage: string | null, events: { to: string; at: string }[] = []): MetricTask =>
  ({
    id: 1,
    title: 't',
    groupId: 1,
    stage,
    stageTitle: stage,
    status: 2,
    priority: 1,
    responsibleId: 1,
    createdBy: 1,
    createdAt: new Date('2026-09-01'),
    changedAt: new Date('2026-09-02'),
    deadline: null,
    closedAt: null,
    parentId: null,
    relatedIds: [],
    tags: [],
    isIssue: false,
    issueType: null,
    events: events.map((e) => ({ from: null, to: e.to, at: new Date(e.at), by: 1 })),
  }) as MetricTask;

const edit = (fn: (wf: Workflow) => void) => {
  const wf = structuredClone(DEFAULT_WORKFLOW);
  fn(wf);
  return wf;
};

describe('the workflow drives the stage rules', () => {
  it('the default is the standard 11-stage flow', () => {
    applyWorkflow(DEFAULT_WORKFLOW);
    expect(STAGE_TITLES).toHaveLength(11);
    expect(validateWorkflow(DEFAULT_WORKFLOW)).toEqual([]);
    expect(stageWithRole('qaEntry')).toBe('QA Backlog');
    expect(canonicalStage('finished')).toBe('Done');
    expect(isReworkMove('In QA', 'Issue Raised')).toBe(true);
    expect(isPending(task('Pending for QA'))).toBe(true);
    expect(isOnHold(task('On Hold'))).toBe(true);
  });

  it('a stage counted differently changes every rule at once', () => {
    applyWorkflow(
      edit((wf) => {
        wf.stages.find((s) => s.title === 'Pending for QA')!.category = 'completed';
      }),
    );
    expect(isPending(task('Pending for QA'))).toBe(false);
    expect(isSentToQa(task('Pending for QA'))).toBe(true);
    expect(PENDING_STAGES).not.toContain('Pending for QA');
  });

  it('a renamed QA entry keeps the old column name and moves the "closed" moment', () => {
    applyWorkflow(
      edit((wf) => {
        const qa = wf.stages.find((s) => s.title === 'QA Backlog')!;
        qa.title = 'Ready for QA';
        qa.aliases.push('QA Backlog');
        wf.stages.find((s) => s.title === 'Pending for QA')!.next = ['Ready for QA'];
        wf.stages.find((s) => s.title === 'In progress')!.next = ['Pushed to Master'];
        wf.rework.from = ['Ready for QA', 'In QA', 'Done'];
      }),
    );
    expect(canonicalStage('QA Backlog')).toBe('Ready for QA');
    const t = task('In QA', [{ to: 'Ready for QA', at: '2026-10-01T10:00:00Z' }]);
    expect(completedAt(t)?.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(isReworkMove('Ready for QA', 'To do')).toBe(true);
  });

  it('a new stage between two: mapped, pending, coloured', () => {
    applyWorkflow(
      edit((wf) => {
        wf.stages.splice(2, 0, {
          title: 'Code Review',
          aliases: ['Review'],
          category: 'open',
          roles: [],
          department: 'development',
          color: '#123456',
          description: 'Peer review',
          next: ['Pushed to Master'],
        });
      }),
    );
    expect(STAGE_TITLES[2]).toBe('Code Review');
    expect(canonicalStage(' review ')).toBe('Code Review');
    expect(isPending(task('Code Review'))).toBe(true);
    expect(STAGE_COLORS['Code Review']).toBe('#123456');
    expect(isReady(task('Done'))).toBe(true);
  });
});

describe('workflow checks and project types', () => {
  it('refuses a broken workflow, in words', () => {
    const errors = validateWorkflow(
      edit((wf) => {
        wf.stages[0]!.roles = [];
        wf.stages[1]!.aliases.push('Finished');
        wf.stages[2]!.next.push('Nowhere');
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'One stage must be the start.',
        '"Finished" is used by both In progress and Done.',
        'On Hold moves to "Nowhere", which is not a stage.',
      ]),
    );
  });

  it('projects are typed by their board, unless set by hand', () => {
    const support = ['New', 'In progress', 'Finished'];
    const full = [
      'To Do',
      'In progress',
      'Pushed To Master',
      'Merged To Development',
      'QA Backlog',
      'Done',
      'LIVE',
    ];
    const noLive = ['To Do', 'In progress', 'Pushed to Master', 'QA Backlog', 'Done'];
    const qaOnly = ['New', 'In progress', 'Qa backlog', 'In QA', 'Finished'];
    expect(classifyProject(1, support, DEFAULT_WORKFLOW)?.key).toBe('support');
    expect(classifyProject(2, full, DEFAULT_WORKFLOW)?.key).toBe('release');
    expect(classifyProject(3, noLive, DEFAULT_WORKFLOW)?.key).toBe('noRelease');
    expect(classifyProject(4, qaOnly, DEFAULT_WORKFLOW)?.key).toBe('qaOnly');
    const wf = edit((w) => (w.projectOverrides['1'] = 'other'));
    expect(classifyProject(1, support, wf)?.key).toBe('other');
    expect(unmappedColumns(['To Do', 'Sprint Planning'], DEFAULT_WORKFLOW)).toEqual([
      'Sprint Planning',
    ]);
  });

  it('every stage says which data points it feeds', () => {
    const qa = DEFAULT_WORKFLOW.stages.find((s) => s.title === 'QA Backlog')!;
    expect(stageUsage(qa).join(' ')).toMatch(/KPI Closed/);
  });
});
