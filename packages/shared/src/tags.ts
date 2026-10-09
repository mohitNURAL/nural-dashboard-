// Tag rules (SRS 5, CLAUDE.md). Tags are matched after lowercasing and removing
// everything but letters, so "Re-Testing", "ReTesting" and "re testing" are one tag.
import type { IssueType } from './types';

export const normalizeTag = (tag: string): string => tag.toLowerCase().replace(/[^a-z]/g, '');

/** Exact (normalised) tags that make a task an issue. "Client feedback" is a task tag. */
const ISSUE_TAGS: Record<string, IssueType> = {
  bug: 'bug',
  feedback: 'feedback',
  feedbacks: 'feedback',
};

const REOPEN_TAGS = new Set(['reopen']);
const TESTING_TAGS = new Set(['testing', 'retesting']);

export const hasReopenTag = (tags: readonly string[]): boolean =>
  tags.some((t) => REOPEN_TAGS.has(normalizeTag(t)));

export const isTestingTag = (tag: string): boolean => TESTING_TAGS.has(normalizeTag(tag));

/**
 * Issue type from tags: bug wins over feedback. A task tagged Re-Open is an issue
 * (reopened bug) even without a bug tag.
 */
export function issueTypeOf(tags: readonly string[]): IssueType | null {
  const types = new Set(tags.map((t) => ISSUE_TAGS[normalizeTag(t)]).filter(Boolean));
  if (types.has('bug')) return 'bug';
  if (types.has('feedback')) return 'feedback';
  if (hasReopenTag(tags)) return 'bug';
  return null;
}
