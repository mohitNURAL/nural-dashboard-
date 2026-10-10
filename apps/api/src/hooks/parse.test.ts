import { describe, expect, it } from 'vitest';
import { diffTask } from '../sync/diff';
import { applicationToken, parseHookEvent, redactAuth, tokenMatches } from './parse';

// Bitrix24 posts form-encoded bodies; @fastify/formbody gives flat bracketed keys.
const body = (event: string, extra: Record<string, string>) => ({
  event,
  ts: '1791579404',
  'auth[application_token]': 'tok-123',
  'auth[domain]': 'nural.bitrix24.in',
  ...extra,
});

describe('parseHookEvent', () => {
  it('reads the task ID for each event type', () => {
    expect(parseHookEvent(body('ONTASKUPDATE', { 'data[FIELDS_AFTER][ID]': '41580' }))).toEqual({
      event: 'ONTASKUPDATE',
      taskId: 41580,
    });
    expect(parseHookEvent(body('ONTASKADD', { 'data[FIELDS_AFTER][ID]': '7' }))?.taskId).toBe(7);
    expect(parseHookEvent(body('ONTASKDELETE', { 'data[FIELDS_BEFORE][ID]': '8' }))).toEqual({
      event: 'ONTASKDELETE',
      taskId: 8,
    });
    expect(
      parseHookEvent(
        body('ONTASKCOMMENTADD', {
          'data[FIELDS_AFTER][ID]': '555',
          'data[FIELDS_AFTER][TASK_ID]': '9',
        }),
      )?.taskId,
    ).toBe(9);
  });

  it('accepts nested bodies too', () => {
    expect(
      parseHookEvent({ event: 'ontaskupdate', data: { FIELDS_AFTER: { ID: 41580 } } }),
    ).toEqual({ event: 'ONTASKUPDATE', taskId: 41580 });
  });

  it('ignores other events and bad IDs', () => {
    expect(parseHookEvent(body('ONCRMDEALADD', { 'data[FIELDS][ID]': '1' }))).toBeNull();
    expect(parseHookEvent(body('ONTASKUPDATE', { 'data[FIELDS_AFTER][ID]': 'x' }))).toBeNull();
    expect(parseHookEvent({})).toBeNull();
  });

  it('checks the application token in constant time and strips auth before storing', () => {
    const b = body('ONTASKUPDATE', {});
    expect(applicationToken(b)).toBe('tok-123');
    expect(tokenMatches('tok-123', 'tok-123')).toBe(true);
    expect(tokenMatches('tok-124', 'tok-123')).toBe(false);
    expect(tokenMatches('tok', 'tok-123')).toBe(false);
    expect(tokenMatches(undefined, 'tok-123')).toBe(false);
    expect(tokenMatches('tok-123', undefined)).toBe(false);
    expect(Object.keys(redactAuth(b))).toEqual(['event', 'ts']);
  });
});

describe('diffTask', () => {
  const at = new Date('2026-10-10T05:00:00Z');
  const stored = {
    id: 1,
    stageId: '1068',
    stage: 'In QA',
    groupId: 148,
    deleted: false,
    changedAt: at,
  };

  it('flags a move from a QA stage back to To do as a reopen', () => {
    const d = diffTask(stored, {
      id: 1,
      stageId: '1054',
      stage: 'To do',
      groupId: 148,
      changedAt: new Date(),
    });
    expect(d).toEqual({
      isNew: false,
      stageChanged: true,
      fromStage: 'In QA',
      toStage: 'To do',
      reopened: true,
      changed: true,
    });
  });

  it('flags a QA send-back to Issue Raised as reopened (rework)', () => {
    const d = diffTask(stored, {
      id: 1,
      stageId: '1070',
      stage: 'Issue Raised',
      groupId: 148,
      changedAt: new Date(),
    });
    expect(d).toMatchObject({ stageChanged: true, reopened: true });
  });

  it('is a plain stage change when moving forward', () => {
    const d = diffTask(stored, {
      id: 1,
      stageId: '1072',
      stage: 'Done',
      groupId: 148,
      changedAt: new Date(),
    });
    expect(d).toMatchObject({ stageChanged: true, reopened: false });
  });

  it('detects new and unchanged tasks', () => {
    const next = { id: 1, stageId: '1068', stage: 'In QA' as const, groupId: 148, changedAt: at };
    expect(diffTask(undefined, next)).toMatchObject({
      isNew: true,
      changed: true,
      fromStage: null,
    });
    expect(diffTask({ ...stored, deleted: true }, next).isNew).toBe(true);
    expect(diffTask(stored, next)).toMatchObject({ changed: false, stageChanged: false });
    expect(diffTask(stored, { ...next, changedAt: new Date() })).toMatchObject({
      changed: true,
      stageChanged: false,
    });
  });
});
