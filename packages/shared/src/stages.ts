// Kanban stages (SRS sections 2, 5 and 6; editable workflow since 2026-10-12, SRS 22).
// Stages are matched by title, never by ID: each workgroup has its own stage IDs.
//
// Everything here follows the workflow definition (workflow.ts): the stages in order, what each
// counts as (open, on hold, completed), the roles some stages play (start, QA entry, ready, live,
// …), the column names mapped to each, colours and the rework rule. These tables start as the
// standard 11-stage development flow and are updated in place by applyWorkflow(), so every rule
// that reads them follows an admin's edit. Never compare a task's stage with a stage name in
// code: ask for the stage that plays a role (stageWithRole) or check the category.

/** A stage's title. Any string: admins can add stages. */
export type StageTitle = string;

/** What a stage counts as on every page. */
export type StageCategory = 'open' | 'hold' | 'completed';

/**
 * The parts some stages play in the rules:
 * - start: where new tasks land (and never-moved tasks count);
 * - working: being worked on (development in progress);
 * - qaEntry: reaching it is the moment a task counts as closed (sent to QA);
 * - testing: QA is testing it;
 * - issue: an issue was raised (a bug filed, or QA sent it back);
 * - ready: ready to deploy;
 * - live: deployed.
 */
export const STAGE_ROLES = [
  'start',
  'working',
  'qaEntry',
  'testing',
  'issue',
  'ready',
  'live',
] as const;
export type StageRole = (typeof STAGE_ROLES)[number];

/** The standard development flow (the default workflow). */
const DEFAULT_TITLES = [
  'To do',
  'In progress',
  'On Hold',
  'Pushed to Master',
  'Merged to Development',
  'Pending for QA',
  'QA Backlog',
  'In QA',
  'Issue Raised',
  'Done',
  'LIVE',
];

/** The stages in board order (updated in place by applyWorkflow). */
export const STAGE_TITLES: StageTitle[] = [...DEFAULT_TITLES];

/** Bitrix24 STAGE_ID for a task never moved on the board; counts as the start stage. */
export const DEFAULT_STAGE_ID = '0';

export type StageGroup = 'pending' | 'sentToQa' | 'hold';

/**
 * Pending, completed and on hold (SRS 5): a task is **completed** while it is in a completed
 * stage (by default QA Backlog, In QA, Done, LIVE), **on hold** in an on-hold stage (On Hold:
 * neither pending nor completed), and **pending** in every other stage, Issue Raised included.
 * The same rule on every tab, so pending + completed + on hold = total everywhere.
 */
export const PENDING_STAGES: StageTitle[] = [
  'To do',
  'In progress',
  'Pushed to Master',
  'Merged to Development',
  'Pending for QA',
  'Issue Raised',
];

/** Completed stages ("sent to QA" and beyond). */
export const SENT_TO_QA_STAGES: StageTitle[] = ['QA Backlog', 'In QA', 'Done', 'LIVE'];
export const COMPLETED_STAGES = SENT_TO_QA_STAGES;
/** On-hold stages (neither pending nor completed). */
export const HOLD_STAGES: StageTitle[] = ['On Hold'];

/** The stage playing each role (one stage per role at most). */
export const ROLE_STAGE: Partial<Record<StageRole, StageTitle>> = {
  start: 'To do',
  working: 'In progress',
  qaEntry: 'QA Backlog',
  testing: 'In QA',
  issue: 'Issue Raised',
  ready: 'Done',
  live: 'LIVE',
};

/** The stage playing a role, or null when the workflow has none. */
export const stageWithRole = (role: StageRole): StageTitle | null => ROLE_STAGE[role] ?? null;
/** Does the stage play this role? */
export const hasRole = (stage: StageTitle | null | undefined, role: StageRole) =>
  !!stage && ROLE_STAGE[role] === stage;
export const isHoldStage = (stage: StageTitle | null | undefined) =>
  !!stage && HOLD_STAGES.includes(stage);

/** The first on-hold stage (Bitrix24's "deferred" status lands here). */
export const holdStage = (): StageTitle | null => HOLD_STAGES[0] ?? null;

/**
 * Rework (SRS 5) is QA sending an issue back after it was fixed and came for testing: by default
 * a move from QA Backlog, In QA or Done back to Issue Raised, To do or In progress. Each
 * send-back counts once. Not rework: the first cycle (tester files the bug, Issue Raised, the PM
 * or lead reviews it and moves it to To do), so moves from Issue Raised never count.
 */
export const REWORK_FROM_STAGES: StageTitle[] = ['QA Backlog', 'In QA', 'Done'];
export const REWORK_TO_STAGES: StageTitle[] = ['Issue Raised', 'To do', 'In progress'];

export const isReworkMove = (from: StageTitle | null, to: StageTitle | null): boolean =>
  !!from && !!to && REWORK_FROM_STAGES.includes(from) && REWORK_TO_STAGES.includes(to);

export const STAGE_COLORS: Record<StageTitle, string> = {
  'To do': '#00C4FB',
  'In progress': '#47D1E2',
  'On Hold': '#EF3000',
  'Pushed to Master': '#FFAB00',
  'Merged to Development': '#FF5752',
  'Pending for QA': '#FDB051',
  'QA Backlog': '#FDB051',
  'In QA': '#FDB051',
  'Issue Raised': '#47D1E2',
  Done: '#8EC82F',
  LIVE: '#75D900',
};

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Board column names mapped to a stage: each project names its columns its own way ("New",
 * "Finished", "Done On Live"); the raw title is always stored alongside the stage.
 */
export const STAGE_ALIASES: Record<string, StageTitle> = {
  New: 'To do',
  'Figma Review': 'To do',
  Documentation: 'To do',
  'Unit Testing': 'In progress',
  Integration: 'In progress',
  Hold: 'On Hold',
  'Project Hold': 'On Hold',
  'To be discussed': 'On Hold',
  'Push to Master': 'Pushed to Master',
  'Merge to Development': 'Merged to Development',
  'Marged To Development': 'Merged to Development',
  'Issues Raised': 'Issue Raised',
  Staging: 'Done',
  'Done On Staging': 'Done',
  Finished: 'Done',
  'Done On Live': 'LIVE',
};

const BY_NORMALIZED = new Map<string, StageTitle>();
/** Rebuilds the title lookup after the stages or column names change. */
export function rebuildStageLookup() {
  BY_NORMALIZED.clear();
  for (const [alias, t] of Object.entries(STAGE_ALIASES)) BY_NORMALIZED.set(normalize(alias), t);
  for (const t of STAGE_TITLES) BY_NORMALIZED.set(normalize(t), t);
}
rebuildStageLookup();

/** Maps a board column title (any case/spacing) to its stage, or null if unknown. */
export function canonicalStage(title: string | null | undefined): StageTitle | null {
  if (title == null) return null;
  return BY_NORMALIZED.get(normalize(title)) ?? null;
}

/** Resolves a task's stage from its Bitrix24 STAGE_ID and the column title it maps to. */
export function resolveStage(
  stageId: string | number | null | undefined,
  stageTitle: string | null | undefined,
): StageTitle | null {
  if (stageId == null || String(stageId) === DEFAULT_STAGE_ID) return stageWithRole('start');
  return canonicalStage(stageTitle);
}

export function stageGroupOf(stage: StageTitle): StageGroup {
  if (isHoldStage(stage)) return 'hold';
  return PENDING_STAGES.includes(stage) ? 'pending' : 'sentToQa';
}
