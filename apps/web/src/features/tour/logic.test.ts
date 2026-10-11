import { describe, expect, it } from 'vitest';
import {
  firstOfSignIn,
  nextDueTab,
  tabsFor,
  tabTourDue,
  unseenFeatures,
  visibleSteps,
} from './logic';
import type { WhatsNew } from './whatsNew';

describe('guided tour', () => {
  it('covers every tab the person may open, in tab order', () => {
    expect(tabsFor({ kpi: true, support: true })).toEqual(['kpi', 'dev', 'qa', 'support']);
    expect(tabsFor({ kpi: false, support: false })).toEqual(['dev', 'qa']);
    expect(tabsFor({ kpi: false, support: true })).toEqual(['dev', 'qa', 'support']);
  });

  it('plays a tab on sign-ins 1 to 3, once per sign-in', () => {
    expect(tabTourDue(0, {}, 'dev')).toBe(false); // signed in before counting began
    expect(tabTourDue(1, {}, 'dev')).toBe(true);
    expect(tabTourDue(1, { shown: { dev: 1 } }, 'dev')).toBe(false);
    expect(tabTourDue(2, { shown: { dev: 1 } }, 'dev')).toBe(true);
    expect(tabTourDue(3, { shown: { dev: 2 } }, 'dev')).toBe(true);
    expect(tabTourDue(4, { shown: { dev: 3 } }, 'dev')).toBe(false);
  });

  it('opens a sign-in with the role steps, once', () => {
    expect(firstOfSignIn(2, { shown: { dev: 1 } })).toBe(true);
    expect(firstOfSignIn(2, { shown: { dev: 1, qa: 2 } })).toBe(false);
  });

  it('offers the next tab still due', () => {
    const tabs = ['kpi', 'dev', 'qa', 'support'] as const;
    expect(nextDueTab(1, { shown: { kpi: 1 } }, [...tabs], 'kpi')).toBe('dev');
    expect(nextDueTab(1, { shown: { kpi: 1, dev: 1, qa: 1 } }, [...tabs], 'qa')).toBe('support');
    expect(
      nextDueTab(1, { shown: { kpi: 1, dev: 1, qa: 1, support: 1 } }, [...tabs], 'support'),
    ).toBeUndefined();
    // Wraps round: started on QA, Development is still due.
    expect(nextDueTab(1, { shown: { qa: 1 } }, ['dev', 'qa'], 'qa')).toBe('dev');
  });

  it("shows what's new after the first three sign-ins, on the person's tabs only", () => {
    const all: WhatsNew[] = [
      { id: 'a', date: '', tab: 'dev', title: 'A', steps: [] },
      { id: 'b', date: '', tab: 'kpi', title: 'B', steps: [] },
      { id: 'c', date: '', tab: 'qa', title: 'C', steps: [] },
    ];
    expect(unseenFeatures(2, {}, ['dev', 'qa'], all)).toEqual([]);
    expect(unseenFeatures(5, { seen: ['c'] }, ['dev', 'qa'], all).map((w) => w.id)).toEqual(['a']);
  });

  it('keeps only steps on screen, in member wording for members', () => {
    const steps = [
      { target: '#a', title: 'A', text: 'all', member: 'mine' },
      { target: '#kpi', title: 'K', text: 'kpi' },
      { title: 'Message', text: 'centred' },
    ];
    const present = (s: string) => s === '#a';
    expect(visibleSteps(steps, true, present).map((s) => s.text)).toEqual(['mine', 'centred']);
    expect(visibleSteps(steps, false, present).map((s) => s.text)).toEqual(['all', 'centred']);
  });
});
