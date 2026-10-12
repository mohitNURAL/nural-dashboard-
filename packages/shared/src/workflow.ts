// The development workflow as data (2026-10-12, SRS 22): the Kanban stages in order, what each
// counts as, the roles they play, who works in each, the moves between them, the rework rule,
// and the project types (projects grouped by the stages on their boards).
//
// DEFAULT_WORKFLOW is the standard flow every rule used before; an admin may edit it on
// Projects › Workflow. applyWorkflow() puts a definition into the stage tables (stages.ts) that
// every metric reads, so the whole dashboard follows. Pure apart from that one update.
import {
  HOLD_STAGES,
  PENDING_STAGES,
  REWORK_FROM_STAGES,
  REWORK_TO_STAGES,
  ROLE_STAGE,
  SENT_TO_QA_STAGES,
  STAGE_ALIASES,
  STAGE_COLORS,
  STAGE_ROLES,
  STAGE_TITLES,
  canonicalStage,
  rebuildStageLookup,
  type StageCategory,
  type StageRole,
} from './stages';

export const DEPARTMENTS = ['pm', 'development', 'qa', 'support', 'release', 'other'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABEL: Record<Department, string> = {
  pm: 'PM / team lead',
  development: 'Development',
  qa: 'QA Testing',
  support: 'Tech Support',
  release: 'Release',
  other: 'Other',
};

export const CATEGORY_LABEL: Record<StageCategory, string> = {
  open: 'Open (pending)',
  hold: 'On hold',
  completed: 'Completed (sent to QA and beyond)',
};

export const ROLE_LABEL: Record<StageRole, string> = {
  start: 'Start: new tasks land here',
  working: 'Being worked on',
  qaEntry: 'QA entry: reaching it closes the task',
  testing: 'In testing',
  issue: 'Issue raised',
  ready: 'Ready to deploy',
  live: 'Live (deployed)',
};

export interface WorkflowStage {
  title: string;
  /** Board column names that mean this stage (besides its own title). */
  aliases: string[];
  category: StageCategory;
  roles: StageRole[];
  department: Department;
  color: string;
  description: string;
  /** Usual moves out of this stage (the arrows in the diagram). */
  next: string[];
}

export interface ProjectType {
  key: string;
  name: string;
  description: string;
  color: string;
  /** The board must have all of these stages… */
  requires: string[];
  /** …and none of these. */
  forbids: string[];
}

export interface Workflow {
  stages: WorkflowStage[];
  rework: { from: string[]; to: string[] };
  /** Checked in order; the first that matches a board wins. */
  projectTypes: ProjectType[];
  /** Project (workgroup) ID → type key, set by hand. */
  projectOverrides: Record<string, string>;
}

const S = (
  title: string,
  category: StageCategory,
  department: Department,
  color: string,
  description: string,
  next: string[],
  roles: StageRole[] = [],
  aliases: string[] = [],
): WorkflowStage => ({ title, aliases, category, roles, department, color, description, next });

export const DEFAULT_WORKFLOW: Workflow = {
  stages: [
    S(
      'To do',
      'open',
      'pm',
      '#00C4FB',
      'Planned and assigned by the PM or team lead; not started.',
      ['In progress', 'On Hold'],
      ['start'],
      ['New', 'Figma Review', 'Documentation'],
    ),
    S(
      'In progress',
      'open',
      'development',
      '#47D1E2',
      'A developer is building it, including unit testing and integration.',
      ['Pushed to Master', 'On Hold'],
      ['working'],
      ['Unit Testing', 'Integration'],
    ),
    S(
      'On Hold',
      'hold',
      'pm',
      '#EF3000',
      'Paused on purpose (waiting for a decision or another team); neither pending nor completed.',
      ['To do', 'In progress'],
      [],
      ['Hold', 'Project Hold', 'To be discussed'],
    ),
    S(
      'Pushed to Master',
      'open',
      'development',
      '#FFAB00',
      'Code pushed to the master branch, waiting to be merged.',
      ['Merged to Development'],
      [],
      ['Push to Master'],
    ),
    S(
      'Merged to Development',
      'open',
      'development',
      '#FF5752',
      'Merged into the development branch; build on the test server.',
      ['Pending for QA'],
      [],
      ['Merge to Development', 'Marged To Development'],
    ),
    S(
      'Pending for QA',
      'open',
      'development',
      '#FDB051',
      'Ready for testing; the developer hands it over to QA.',
      ['QA Backlog'],
    ),
    S(
      'QA Backlog',
      'completed',
      'qa',
      '#FDB051',
      'In QA’s queue. From here the task counts as closed (sent to QA) for the developer.',
      ['In QA'],
      ['qaEntry'],
    ),
    S(
      'In QA',
      'completed',
      'qa',
      '#FDB051',
      'A tester is testing it.',
      ['Done', 'Issue Raised'],
      ['testing'],
    ),
    S(
      'Issue Raised',
      'open',
      'qa',
      '#47D1E2',
      'A bug was filed, or QA sent the task back: the developer fixes it.',
      ['To do', 'In progress'],
      ['issue'],
      ['Issues Raised'],
    ),
    S(
      'Done',
      'completed',
      'qa',
      '#8EC82F',
      'Tested and passed: ready to deploy.',
      ['LIVE'],
      ['ready'],
      ['Staging', 'Done On Staging', 'Finished'],
    ),
    S(
      'LIVE',
      'completed',
      'release',
      '#75D900',
      'Deployed to production.',
      [],
      ['live'],
      ['Done On Live'],
    ),
  ],
  rework: {
    from: ['QA Backlog', 'In QA', 'Done'],
    to: ['Issue Raised', 'To do', 'In progress'],
  },
  projectTypes: [
    {
      key: 'support',
      name: 'Support / individual',
      description:
        'Short boards (New › In progress › Finished): support desks, DevOps and personal projects. No code review or QA stages.',
      color: '#8B91A8',
      requires: [],
      forbids: ['Pushed to Master', 'Merged to Development', 'QA Backlog'],
    },
    {
      key: 'design',
      name: 'Design-first development',
      description:
        'Starts with design and documentation (Figma review, documentation), tested by QA and taken LIVE, without the code-merge stages.',
      color: '#7B8FE0',
      requires: ['QA Backlog', 'LIVE'],
      forbids: ['Pushed to Master'],
    },
    {
      key: 'qaOnly',
      name: 'QA only',
      description:
        'Work tested by QA without the code-merge stages (e.g. asset or content projects).',
      color: '#FDB051',
      requires: ['QA Backlog'],
      forbids: ['Pushed to Master', 'Merged to Development', 'LIVE'],
    },
    {
      key: 'release',
      name: 'Development with release',
      description: 'The full development flow up to LIVE.',
      color: '#75D900',
      requires: ['Pushed to Master', 'QA Backlog', 'LIVE'],
      forbids: [],
    },
    {
      key: 'noRelease',
      name: 'Development without release stage',
      description: 'The development flow up to Done: deployment is tracked outside the board.',
      color: '#8EC82F',
      requires: ['QA Backlog'],
      forbids: ['LIVE'],
    },
    {
      key: 'other',
      name: 'Other',
      description: 'Boards that fit none of the types above.',
      color: '#C6CEED',
      requires: [],
      forbids: [],
    },
  ],
  projectOverrides: {},
};

/** Puts a workflow into the stage tables every rule reads (stages.ts). */
export function applyWorkflow(wf: Workflow) {
  const set = (arr: string[], items: string[]) => arr.splice(0, arr.length, ...items);
  set(
    STAGE_TITLES,
    wf.stages.map((s) => s.title),
  );
  set(
    PENDING_STAGES,
    wf.stages.filter((s) => s.category === 'open').map((s) => s.title),
  );
  set(
    SENT_TO_QA_STAGES,
    wf.stages.filter((s) => s.category === 'completed').map((s) => s.title),
  );
  set(
    HOLD_STAGES,
    wf.stages.filter((s) => s.category === 'hold').map((s) => s.title),
  );
  set(REWORK_FROM_STAGES, wf.rework.from);
  set(REWORK_TO_STAGES, wf.rework.to);
  for (const k of Object.keys(ROLE_STAGE)) delete ROLE_STAGE[k as StageRole];
  for (const s of wf.stages) for (const r of s.roles) ROLE_STAGE[r] = s.title;
  for (const k of Object.keys(STAGE_COLORS)) delete STAGE_COLORS[k];
  for (const s of wf.stages) STAGE_COLORS[s.title] = s.color;
  for (const k of Object.keys(STAGE_ALIASES)) delete STAGE_ALIASES[k];
  for (const s of wf.stages) for (const a of s.aliases) STAGE_ALIASES[a] = s.title;
  rebuildStageLookup();
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** What is wrong with a workflow, in words (empty = fine). */
export function validateWorkflow(wf: Workflow): string[] {
  const errors: string[] = [];
  const titles = wf.stages.map((s) => s.title.trim());
  if (wf.stages.length < 2) errors.push('A workflow needs at least two stages.');
  if (titles.some((t) => !t)) errors.push('Every stage needs a title.');
  const seen = new Map<string, string>();
  for (const s of wf.stages) {
    for (const name of [s.title, ...s.aliases]) {
      const k = norm(name);
      if (!k) continue;
      const owner = seen.get(k);
      if (owner && owner !== s.title)
        errors.push(`"${name}" is used by both ${owner} and ${s.title}.`);
      else if (owner === s.title && name !== s.title)
        errors.push(`"${name}" is listed twice for ${s.title}.`);
      seen.set(k, s.title);
    }
  }
  for (const role of STAGE_ROLES) {
    const with_ = wf.stages.filter((s) => s.roles.includes(role));
    if (with_.length > 1)
      errors.push(
        `Only one stage can be "${ROLE_LABEL[role]}" (now: ${with_.map((s) => s.title).join(', ')}).`,
      );
  }
  if (!wf.stages.some((s) => s.roles.includes('start')))
    errors.push('One stage must be the start.');
  if (!wf.stages.some((s) => s.roles.includes('qaEntry')))
    errors.push('One stage must be the QA entry (where a task counts as closed).');
  const qa = wf.stages.find((s) => s.roles.includes('qaEntry'));
  if (qa && qa.category !== 'completed')
    errors.push(`The QA entry (${qa.title}) must count as completed.`);
  const start = wf.stages.find((s) => s.roles.includes('start'));
  if (start && start.category !== 'open')
    errors.push(`The start stage (${start.title}) must count as open.`);
  const known = new Set(titles);
  for (const s of wf.stages)
    for (const n of s.next)
      if (!known.has(n)) errors.push(`${s.title} moves to "${n}", which is not a stage.`);
  for (const n of [...wf.rework.from, ...wf.rework.to])
    if (!known.has(n)) errors.push(`The rework rule names "${n}", which is not a stage.`);
  const keys = new Set<string>();
  for (const t of wf.projectTypes) {
    if (!t.key || keys.has(t.key)) errors.push(`Project type keys must be unique ("${t.key}").`);
    keys.add(t.key);
    for (const n of [...t.requires, ...t.forbids])
      if (!known.has(n)) errors.push(`Project type ${t.name} names "${n}", which is not a stage.`);
  }
  for (const [, k] of Object.entries(wf.projectOverrides))
    if (!keys.has(k)) errors.push(`A project is set to the unknown type "${k}".`);
  return [...new Set(errors)];
}

/** Board column titles that map to no stage under this workflow (for the admin's attention). */
export function unmappedColumns(columns: string[], wf: Workflow): string[] {
  const names = new Set(wf.stages.flatMap((s) => [s.title, ...s.aliases].map(norm)));
  return [...new Set(columns.filter((c) => !names.has(norm(c))))];
}

/** A project's type: set by hand, else the first type whose rule its board meets. */
export function classifyProject(
  projectId: number,
  columns: string[],
  wf: Workflow,
): ProjectType | null {
  const forced = wf.projectOverrides[String(projectId)];
  if (forced) return wf.projectTypes.find((t) => t.key === forced) ?? null;
  const stages = new Set(columns.map((c) => canonicalStage(c)).filter((s): s is string => !!s));
  return (
    wf.projectTypes.find(
      (t) => t.requires.every((s) => stages.has(s)) && !t.forbids.some((s) => stages.has(s)),
    ) ?? null
  );
}

/**
 * The data points a stage feeds, in words, for the Workflow page: what changes on the dashboard
 * when this stage's settings change.
 */
export function stageUsage(s: WorkflowStage): string[] {
  const out: string[] = [];
  if (s.category === 'open')
    out.push(
      'Counts as pending: Development Pending, Open tasks, Overdue (with a past deadline), workload and Insights load.',
    );
  if (s.category === 'hold') out.push('Counts as on hold: the On hold tiles; never overdue.');
  if (s.category === 'completed')
    out.push('Counts as completed (Done in Pending vs Done, QA and KPI); not overdue.');
  if (s.roles.includes('start'))
    out.push('Where never-moved tasks count, and where new tasks land.');
  if (s.roles.includes('qaEntry'))
    out.push(
      'Reaching it closes the task: KPI Closed and On-time, Done today, Fastest to QA Backlog, Release plan.',
    );
  if (s.roles.includes('testing') || s.roles.includes('qaEntry'))
    out.push('Retesting awaited and Waiting for retest (QA).');
  if (s.roles.includes('issue')) out.push('Issue lists and rework (QA send-backs).');
  if (s.roles.includes('ready')) out.push('Ready to deploy tile.');
  if (s.roles.includes('live')) out.push('Deployed tile; never counted as stuck.');
  if (s.roles.includes('working'))
    out.push('In progress for long (KPI insights), Insights "under way".');
  return out;
}
