// Display helpers for the Development tab (pure, tested in format.test.ts).
import type { DevPreset } from '@nural/shared';
import { APP_TIMEZONE } from '../../config';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Speed ranking average: "2.5 days early", "1 day late", "on deadline". */
export function daysEarlyText(avg: number): string {
  const n = Math.round(Math.abs(avg) * 10) / 10;
  if (n === 0) return 'on deadline';
  return `${plural(n, 'day')} ${avg > 0 ? 'early' : 'late'}`;
}

/** Ageing column: days past deadline for open tasks; negative = not yet due. */
export function ageingText(days: number | null): string {
  if (days === null) return '';
  if (days > 0) return `${plural(days, 'day')} overdue`;
  if (days === 0) return 'due today';
  return `due in ${plural(-days, 'day')}`;
}

/** Background for a heat-map cell: transparent at 0, Blue B100 -> B500 by share of the max. */
export function heatShade(count: number, max: number): { background?: string; color?: string } {
  if (!count || !max) return {};
  const t = Math.min(1, count / max);
  // Mix B500 (#32499F) into white; at least 12% so a single task stays visible.
  const pct = Math.round(12 + t * 78);
  return {
    background: `color-mix(in srgb, var(--primary) ${pct}%, white)`,
    color: pct > 55 ? 'white' : 'var(--primary-dark)',
  };
}

/** Total tile sub-line: "Moto India 473 · Moto Indonesia 193 · +2". */
export function splitLine(items: { name?: string; count: number }[], max = 2): string {
  const shown = items.slice(0, max).map((i) => `${i.name ?? '?'} ${i.count}`);
  if (items.length > max) shown.push(`+${items.length - max}`);
  return shown.join(' · ');
}

/** Bitrix24 descriptions are BBCode; show them as plain text (never as HTML). */
export function bbcodeToText(src: string): string {
  return src
    .replace(/\[br\]/gi, '\n')
    .replace(/\[\*\]/g, '\n• ')
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_m, href: string, text: string) =>
      text.trim() && text.trim() !== href ? `${text} (${href})` : href,
    )
    .replace(/\[\/?[a-z*]+(?:=[^\]]*)?\]/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: APP_TIMEZONE,
});
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: APP_TIMEZONE,
});

export const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Tile and task-list names for each DEV preset (DEV-01). */
export const TILE_LABELS: Record<DevPreset, string> = {
  total: 'Total tasks',
  completed: 'Sent to QA',
  pending: 'Pending',
  ready: 'Ready',
  deployed: 'Deployed',
  overdue: 'Overdue',
  doneToday: 'Done today',
  dueToday: 'Due today',
};

/** Column and title word for the Assignee / Project switch. */
export const GROUP_LABEL = { assignee: 'Assignee', project: 'Project' } as const;
