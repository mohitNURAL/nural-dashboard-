import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFollowUpList, computeFollowUpSummary, followUpWindows, fyQuarter, nextQuarter } from '../src/metrics/followUps.js';

// Wednesday 21 Oct 2026, 18:00 IST.
const NOW = Date.parse('2026-10-21T18:00:00+05:30');
const at = (s) => Date.parse(s);

test('windows: today, Monday–Sunday week and month all start today (IST)', () => {
  const w = followUpWindows(NOW);
  assert.equal(w.today[0], at('2026-10-21T00:00:00+05:30'));
  assert.equal(w.today[1], at('2026-10-22T00:00:00+05:30') - 1);
  assert.equal(w.week[1], at('2026-10-26T00:00:00+05:30') - 1); // through Sunday 25 Oct
  assert.equal(w.month[1], at('2026-11-01T00:00:00+05:30') - 1);
  assert.equal(w.overdue[1], w.today[0] - 1);
  assert.deepEqual(w.quarter, [w.today[0], at('2027-01-01T00:00:00+05:30') - 1]); // today to end of Oct–Dec
  assert.deepEqual(w.nextQuarter, [at('2027-01-01T00:00:00+05:30'), at('2027-04-01T00:00:00+05:30') - 1]);
});

test('next quarter follows the Indian financial year (Apr–Jun = Q1)', () => {
  assert.equal(fyQuarter(NOW, 0).label, 'Oct–Dec 2026 · Q3 FY27');
  assert.equal(fyQuarter(at('2026-04-01T00:30:00+05:30'), 0).label, 'Apr–Jun 2026 · Q1 FY27');
  assert.equal(nextQuarter(NOW).label, 'Jan–Mar 2027 · Q4 FY27');
  assert.equal(nextQuarter(at('2027-02-10T12:00:00+05:30')).label, 'Apr–Jun 2027 · Q1 FY28');
  assert.equal(nextQuarter(at('2027-05-31T23:00:00+05:30')).label, 'Jul–Sep 2027 · Q2 FY28');
  assert.equal(nextQuarter(at('2026-08-01T09:00:00+05:30')).label, 'Oct–Dec 2026 · Q3 FY27');
});

const deal = (id, family = 'sales') => ({ id, family, company: `Co ${id}`, customer: null, untagged: false, categoryName: 'Nural Sales - DMS', sourceName: 'Call', stageName: 'Proposal/Quote', opportunity: 100_000, createdAt: NOW - 10 * 86_400_000, movedAt: NOW, ownerName: 'Owner' });
const lead = (id, family = 'service') => ({ id, family, company: `Lead Co ${id}`, customer: 'Person', categoryName: 'Nural Service', sourceName: 'Web', statusName: 'Hot', opportunity: 0, createdAt: NOW, ownerName: 'Owner' });
const fu = (id, ownerType, ownerId, due, responsible = 'Naveen') => ({ id, ownerType, ownerId, subject: `Task ${id}`, kind: 'To-do', due, responsible });

const model = {
  deals: [deal('1'), deal('2'), deal('3', 'assets')],
  leads: [lead('10'), lead('11')],
  followUps: [
    fu('a', 'deal', '1', at('2026-10-21T11:00:00+05:30')), // today (earlier today still counts as today)
    fu('b', 'deal', '1', at('2026-10-23T10:00:00+05:30')), // same customer, later this week
    fu('c', 'lead', '10', at('2026-10-25T09:00:00+05:30'), 'Priyanshu'), // Sunday: this week
    fu('d', 'deal', '2', at('2026-10-30T12:00:00+05:30')), // this month, not this week
    fu('e', 'deal', '3', at('2026-09-01T12:00:00+05:30')), // overdue
    fu('f', 'lead', '11', null), // no due date
    fu('h', 'deal', '2', at('2027-02-15T10:00:00+05:30')), // next quarter (deal 2 also has one this month)
    fu('i', 'deal', '1', null), // deal 1 also has one with no deadline
    fu('g', 'deal', '999', at('2026-10-21T12:00:00+05:30')), // record no longer exists
  ],
};
const ctx = (pipeline = 'all') => ({ pipeline, now: NOW, portal: 'https://x.bitrix24.in' });

test('summary counts customers, not activities', () => {
  const all = computeFollowUpSummary(model, ctx());
  assert.deepEqual(all, {
    today: 1, week: 2, month: 3, quarter: 3, nextQuarter: 1, overdue: 1, noDeadline: 2,
    quarterLabel: 'Oct–Dec 2026 · Q3 FY27', nextQuarterLabel: 'Jan–Mar 2027 · Q4 FY27',
  });
  const sales = computeFollowUpSummary(model, ctx('sales'));
  assert.deepEqual([sales.today, sales.week, sales.month, sales.quarter, sales.nextQuarter, sales.overdue, sales.noDeadline], [1, 1, 2, 2, 1, 0, 1]);
});

test('list: one row per customer with its next follow-up and the assignee', () => {
  const week = computeFollowUpList(model, ctx(), 'week');
  assert.equal(week.count, computeFollowUpSummary(model, ctx()).week);
  assert.deepEqual(week.rows.map((r) => [r.type, r.id, r.followUp.subject, r.followUp.more, r.owner]), [
    ['deal', '1', 'Task a', 1, 'Naveen'],
    ['lead', '10', 'Task c', 0, 'Priyanshu'],
  ]);
  assert.equal(week.rows[0].link, 'https://x.bitrix24.in/crm/deal/details/1/');
  assert.deepEqual(computeFollowUpList(model, ctx(), 'overdue').rows.map((r) => r.id), ['3']);
  assert.deepEqual(computeFollowUpList(model, ctx(), 'noDeadline').rows.map((r) => [r.id, r.followUp.due]), [['1', null], ['11', null]]);
  assert.deepEqual(computeFollowUpList(model, ctx(), 'nextQuarter').rows.map((r) => r.id), ['2']);
  assert.deepEqual(computeFollowUpList(model, ctx(), 'quarter').rows.map((r) => r.id), ['1', '10', '2']);
  for (const w of ['today', 'week', 'month', 'quarter', 'nextQuarter', 'overdue', 'noDeadline']) {
    assert.equal(computeFollowUpList(model, ctx('assets'), w).count, computeFollowUpSummary(model, ctx('assets'))[w], w);
  }
  assert.throws(() => computeFollowUpList(model, ctx(), 'year'), /Unknown follow-up window/);
});
