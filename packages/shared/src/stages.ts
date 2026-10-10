// Kanban stages shared by every development workgroup (SRS sections 2, 5 and 6).
// Stages are matched by title, never by ID: each workgroup has its own stage IDs.

export const STAGE_TITLES = [
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
] as const;

export type StageTitle = (typeof STAGE_TITLES)[number];

/** Bitrix24 STAGE_ID for a task never moved on the board; counts as To do. */
export const DEFAULT_STAGE_ID = '0';

export type StageGroup = 'pending' | 'sentToQa';

export const PENDING_STAGES: readonly StageTitle[] = [
  'To do',
  'In progress',
  'On Hold',
  'Pushed to Master',
  'Merged to Development',
  'Pending for QA',
];

export const SENT_TO_QA_STAGES: readonly StageTitle[] = [
  'QA Backlog',
  'In QA',
  'Issue Raised',
  'Done',
  'LIVE',
];

/** Subsets of "sent to QA" shown as their own tiles. */
export const READY_FOR_DEPLOYMENT_STAGE: StageTitle = 'Done';
export const DEPLOYED_STAGE: StageTitle = 'LIVE';

/**
 * Rework (SRS 5) is QA sending an issue back after it was fixed and came for testing: a move from
 * QA Backlog, In QA or Done back to Issue Raised, To do or In progress. Each send-back counts once.
 *
 * Not rework: the first cycle (tester files the bug, Issue Raised, the PM / lead reviews it and
 * moves it to To do), nor that PM step after a send-back, so moves from Issue Raised never count.
 */
export const REWORK_FROM_STAGES: readonly StageTitle[] = ['QA Backlog', 'In QA', 'Done'];
export const REWORK_TO_STAGES: readonly StageTitle[] = ['Issue Raised', 'To do', 'In progress'];

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
 * Non-standard board titles mapped to the nearest standard stage. Temporary: the boards
 * are being aligned to the 11 standard stages, after which this can shrink. The raw
 * title is always stored alongside the canonical stage.
 */
export const STAGE_ALIASES: Readonly<Record<string, StageTitle>> = {
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

const BY_NORMALIZED = new Map<string, StageTitle>([
  ...Object.entries(STAGE_ALIASES).map(([alias, t]) => [normalize(alias), t] as const),
  ...STAGE_TITLES.map((t) => [normalize(t), t] as const),
]);

/** Maps a board column title (any case/spacing) to its canonical stage, or null if unknown. */
export function canonicalStage(title: string | null | undefined): StageTitle | null {
  if (title == null) return null;
  return BY_NORMALIZED.get(normalize(title)) ?? null;
}

/** Resolves a task's stage from its Bitrix24 STAGE_ID and the column title it maps to. */
export function resolveStage(
  stageId: string | number | null | undefined,
  stageTitle: string | null | undefined,
): StageTitle | null {
  if (stageId == null || String(stageId) === DEFAULT_STAGE_ID) return 'To do';
  return canonicalStage(stageTitle);
}

export function stageGroupOf(stage: StageTitle): StageGroup {
  return PENDING_STAGES.includes(stage) ? 'pending' : 'sentToQa';
}
