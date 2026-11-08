// How the Tasks in hand planner looks and reads (2026-11-08, SRS 25): status colours, secondary
// text, and an entry's events in words. Shared by the grid (PlannerTable), the popup and the files.
import type { CSSProperties } from 'react';
import type { PlannerEntry, PlannerProgress } from '../api/types';
import { longDay, ordinal, shortDay } from './calendarHeading';

export type Density = 'short' | 'full';

/** Secondary text: readable in light and dark (the muted grey is too faint on white). */
export const SUB = 'text-text/65';
export const FAINT = 'text-text/45';

export type Status = 'all' | 'part' | 'none';
export const statusOf = (p: PlannerProgress): Status | null =>
  p.planned === 0 ? null : p.done === p.planned ? 'all' : p.done > 0 ? 'part' : 'none';
export const STATUS_TEXT: Record<Status, string> = {
  all: 'All done',
  part: 'Partly done',
  none: 'Nothing done',
};
const STATUS_VAR: Record<Status, string> = { all: '--success', part: '--warn', none: '--bad' };
/** A tinted cell with a 3 px line on its left: green all done, amber partly, red nothing. */
export const cellTint = (s: Status | null): CSSProperties | undefined =>
  s
    ? {
        background: `color-mix(in srgb, var(${STATUS_VAR[s]}) 9%, transparent)`,
        boxShadow: `inset 3px 0 0 var(${STATUS_VAR[s]})`,
      }
    : undefined;
export const PILL: Record<Status | 'future', string> = {
  all: 'bg-success text-white',
  part: 'bg-warn text-navy',
  none: 'bg-bad text-white',
  future: 'bg-primary/15 text-primary',
};

const firstName = (name: string | undefined) => (name ?? '').split(' ')[0] ?? '';

/** What happened to the entry, in words (the Short view's tooltip, the files). */
export function entryWords(e: PlannerEntry, people: Record<string, string>, full = true): string[] {
  const who = (id: number | null | undefined) =>
    id ? (full ? (people[id] ?? '') : firstName(people[id])) : '';
  const out: string[] = [];
  if (e.kind === 'dayplan')
    out.push(`In day plan · deadline ${e.deadline ? longDay(e.deadline) : 'none'}`);
  if (e.status === 'done') out.push('Done');
  if (e.status === 'missed')
    out.push(`Not done${e.doneDay ? ` · done ${shortDay(e.doneDay)}` : ''}`);
  if (e.status === 'due') out.push('Due today');
  if (e.kind === 'moved')
    out.push(`Moved → ${e.to ? longDay(e.to) : 'no deadline'}${e.by ? ` by ${who(e.by)}` : ''}`);
  if (e.kind === 'replan') out.push(`Re-planned → ${e.to ? longDay(e.to) : 'no deadline'}`);
  if ((e.kind === 'moved' || e.kind === 'deadline') && e.missed)
    out.push(`${ordinal(e.missed)} deadline missed`);
  if (e.kind === 'deadline') {
    if (e.pulledFrom)
      out.push(
        `Pulled forward from ${longDay(e.pulledFrom.day)}${e.pulledFrom.by ? ` by ${who(e.pulledFrom.by)}` : ''}`,
      );
    if (e.replannedFrom) out.push(`Re-planned from ${longDay(e.replannedFrom)}`);
    if (e.notDoneInPlan) out.push(`Not done in day plan ${shortDay(e.notDoneInPlan)}`);
  }
  return out;
}
