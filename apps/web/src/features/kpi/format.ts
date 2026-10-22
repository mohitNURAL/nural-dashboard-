// KPI tab display helpers: relative time, period words, department names.

/** "just now", "3 h ago", "5 days ago" (calendar time). */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export const PERIOD_WORDS = {
  day: { now: 'Today', prev: 'Yesterday', unit: 'day' },
  week: { now: 'This week', prev: 'Last week', unit: 'week' },
  month: { now: 'This month', prev: 'Last month', unit: 'month' },
} as const;

export const DEPT_LABEL = {
  dev: 'Development',
  qa: 'QA',
  support: 'Support',
  ba: 'BA',
  other: 'Other',
} as const;
