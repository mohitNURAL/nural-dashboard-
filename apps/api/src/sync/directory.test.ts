import { describe, expect, it, vi } from 'vitest';
import type { Call } from '../bitrix';
import { readBoards, readMembers } from './directory';

/** Fake Bitrix24: board 170 is private (ACCESS_DENIED unless asked as an admin); 180 always refused. */
function fakeCall() {
  const asked: string[] = [];
  const call = vi.fn(async (_method: string, params?: Record<string, unknown>) => {
    const cmd = params!.cmd as Record<string, string>;
    const result: Record<string, unknown> = {};
    const result_error: Record<string, { error: string; error_description: string }> = {};
    for (const [k, q] of Object.entries(cmd)) {
      asked.push(q);
      const admin = q.includes('isAdmin=1');
      if (k === 'g180' || (k === 'g170' && !admin))
        result_error[k] = {
          error: 'ACCESS_DENIED',
          error_description: 'You cannot view tasks in this group',
        };
      else result[k] = { 1492: { ID: '1492', TITLE: 'To Do', SORT: '100' } };
    }
    return {
      result: {
        result,
        result_error: Object.keys(result_error).length ? result_error : [],
        result_total: [],
        result_next: [],
      },
    };
  });
  return { call: call as unknown as Call, asked };
}

describe('reading Kanban boards (2026-10-21)', () => {
  it('reads a private board again as an admin; a board still refused is left out', async () => {
    const { call, asked } = fakeCall();
    const boards = await readBoards(call, [154, 170, 180]);
    expect([...boards.keys()].sort()).toEqual([154, 170]);
    expect(Object.values(boards.get(170)!)[0]).toMatchObject({ TITLE: 'To Do' });
    // Only the refused boards are asked again, as an admin; never a write method.
    expect(
      asked.filter((q) => q.includes('isAdmin')).map((q) => q.match(/entityId=(\d+)/)?.[1]),
    ).toEqual(['170', '180']);
    expect(asked.every((q) => q.startsWith('task.stages.get?'))).toBe(true);
  });
});

describe('reading project members (2026-10-22)', () => {
  it('keeps owner, moderators and members, not join requests; a refused list is left out', async () => {
    const call = vi.fn(async (_method: string, params?: Record<string, unknown>) => {
      const cmd = params!.cmd as Record<string, string>;
      expect(Object.values(cmd).every((q) => q.startsWith('sonet_group.user.get?'))).toBe(true);
      return {
        result: {
          result: {
            g168: [
              { USER_ID: '1', ROLE: 'A' },
              { USER_ID: '20', ROLE: 'K' },
              { USER_ID: '46', ROLE: 'Z' },
            ],
          },
          result_error: { g98: { error: 'ACCESS_DENIED', error_description: 'No access' } },
          result_total: [],
          result_next: [],
        },
      };
    });
    const members = await readMembers(call as unknown as Call, [168, 98]);
    expect([...members]).toEqual([[168, [1, 20]]]);
  });
});
