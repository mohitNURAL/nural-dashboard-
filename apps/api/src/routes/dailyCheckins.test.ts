import { workCalendar } from '@nural/shared';
import { describe, expect, it } from 'vitest';
import type { Dataset } from '../data/dataset';
import type { Slack, SlackMessage } from '../integrations/slack';
import { memoryDailyStore, memorySettingsStore } from './daily';
import { runCheckIn, type CheckInDeps } from './dailyCheckins';

const ist = (local: string) => new Date(`${local}+05:30`);
// Friday 16 Oct 2026, 11:30 IST.
const FRI = ist('2026-10-16T11:30');
const SAT = ist('2026-10-17T11:30');

const users = new Map([
  [40, { id: 40, name: 'Deepak', email: 'deepak@nural.test', active: true }],
  [18, { id: 18, name: 'Bhanu', email: 'bhanu@nural.test', active: true }],
  [7, { id: 7, name: 'Neha', email: 'neha@nural.test', active: true }],
  [30, { id: 30, name: 'Vijay', email: 'vijay@nural.test', active: true }],
]);
const ds = { users } as unknown as Dataset;

function setup(now: Date, enabled = true) {
  const sent: { email: string; m: SlackMessage }[] = [];
  const group: { channel: string; m: SlackMessage }[] = [];
  const slack = {
    connected: true,
    toPerson: async (email: string, m: SlackMessage) => void sent.push({ email, m }),
    toChannel: async (channel: string, m: SlackMessage) => void group.push({ channel, m }),
    mention: async (email: string) => (email === 'vijay@nural.test' ? '<@UVIJAY>' : null),
  } as unknown as Slack;
  const store = memoryDailyStore();
  const deps: CheckInDeps = {
    dataset: async () => ds,
    store,
    settings: memorySettingsStore(),
    slack,
    calendar: workCalendar({ days: [1, 2, 3, 4, 5] }),
    tz: 'Asia/Kolkata',
    config: { enabled, recipients: [40, 18], plan: '11:30', wrap: '19:00', channel: true },
    expected: () => [7, 30],
    reportUrl: 'https://pulse/?tab=dailyreport',
    channel: async () => 'CDAILY',
    now: () => now,
  };
  return { sent, group, store, deps };
}

describe('check-ins to the directors (SRS 24)', () => {
  it('sends each recipient a DM once a day: who has and has not planned', async () => {
    const { sent, store, deps } = setup(FRI);
    await store.save({
      userId: 7,
      day: '2026-10-16',
      plan: { items: [], note: '' },
      plannedAt: ist('2026-10-16T10:00'),
      wrap: null,
      wrappedAt: null,
      slackChannel: null,
      slackTs: null,
    });
    expect(await runCheckIn('plan', deps)).toMatchObject({ sent: 2 });
    expect(sent.map((s) => s.email)).toEqual(['deepak@nural.test', 'bhanu@nural.test']);
    expect(sent[0]!.m.text).toBe('Daily plans Fri 16 Oct: 1 of 2 planned, 1 not yet');
    expect(JSON.stringify(sent[0]!.m.blocks)).toContain('Vijay');
    // Again the same day: nothing more.
    expect(await runCheckIn('plan', deps)).toMatchObject({ sent: 0, skipped: 'already sent' });
    expect(sent).toHaveLength(2);
    // The wrap-up check-in is its own send.
    expect(await runCheckIn('wrap', deps)).toMatchObject({ sent: 2 });
  });

  it('at 11:30 the group gets who has not planned, mentioned; 19:00 names late planners', async () => {
    const { group, store, deps } = setup(FRI);
    const row = (userId: number, plannedAt: Date | null) => ({
      userId,
      day: '2026-10-16',
      plan: plannedAt ? { items: [], note: '' } : null,
      plannedAt,
      wrap: null,
      wrappedAt: null,
      slackChannel: null,
      slackTs: null,
    });
    await store.save(row(7, ist('2026-10-16T10:00')));
    expect(await runCheckIn('plan', deps)).toMatchObject({ channel: 'CDAILY' });
    expect(group).toHaveLength(1);
    const text = JSON.stringify(group[0]!.m.blocks);
    expect(text).toContain('<@UVIJAY>');
    expect(text).not.toContain('Neha');
    // Vijay plans at 12:10: Late planned in the evening check-in (DM only, not the group).
    await store.save(row(30, ist('2026-10-16T12:10')));
    const evening = setup(ist('2026-10-16T19:00'));
    await evening.store.save(row(7, ist('2026-10-16T10:00')));
    await evening.store.save(row(30, ist('2026-10-16T12:10')));
    await runCheckIn('wrap', evening.deps);
    expect(evening.group).toHaveLength(0);
    const dm = JSON.stringify(evening.sent[0]!.m.blocks);
    expect(dm).toContain('Planned late (1)');
    expect(dm).toContain('Vijay');
  });

  it('sends nothing while disabled or on a day off', async () => {
    const off = setup(FRI, false);
    expect(await runCheckIn('plan', off.deps)).toMatchObject({ sent: 0, skipped: 'disabled' });
    const weekend = setup(SAT);
    expect(await runCheckIn('plan', weekend.deps)).toMatchObject({
      sent: 0,
      skipped: 'not a working day',
    });
    expect(off.sent.length + weekend.sent.length).toBe(0);
  });
});
