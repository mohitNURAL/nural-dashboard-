// Display helpers for the QA tab (pure, tested in format.test.ts).
import type { IssuePreset } from '@nural/shared';
import { fmtDate } from '../dev/format';

/** #RRGGBB mixed with black; `amount` 0..1. */
export function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * Board colours repeat (QA Backlog, In QA and Pending for QA are all #FDB051), so each repeat
 * is a shade darker to keep neighbouring bars apart (SRS 6).
 */
export function shadeSteps(colors: string[]): string[] {
  const seen = new Map<string, number>();
  return colors.map((c) => {
    const key = c.toLowerCase();
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n === 0 ? c : darken(c, n * 0.18);
  });
}

/** QA-01 Last filed tile: "Today" when issues were filed today, else the date. */
export function lastFiledText(last: { date: string; isToday: boolean } | null): string {
  if (!last) return '-';
  return last.isToday ? 'Today' : fmtDate(`${last.date}T12:00:00+05:30`);
}

/** Names for the "All issues" list when a tile narrows it. */
export const ISSUE_PRESET_LABELS: Record<IssuePreset, string> = {
  all: 'All issues',
  open: 'Open',
  resolved: 'Resolved',
  hold: 'On hold',
  lastFiled: 'Last filed',
  lastResolved: 'Last resolved',
  rework: 'Rework',
  retest: 'Waiting for retest',
};
