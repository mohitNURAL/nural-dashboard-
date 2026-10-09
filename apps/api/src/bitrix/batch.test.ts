import { describe, expect, it, vi } from 'vitest';
import { batch, toQuery, type Command } from './batch';
import type { Call } from './limiter';
import { listAll } from './listAll';

describe('toQuery', () => {
  it('encodes nested objects and arrays like PHP http_build_query', () => {
    const q = toQuery({
      filter: { GROUP_ID: 148, '>CHANGED_DATE': '2026-10-01' },
      select: ['ID', 'TITLE'],
      start: 0,
      flag: true,
      skip: undefined,
    });
    expect(decodeURIComponent(q)).toBe(
      'filter[GROUP_ID]=148&filter[>CHANGED_DATE]=2026-10-01&select[0]=ID&select[1]=TITLE&start=0&flag=1',
    );
  });
});

/** Fake `call` that answers batch requests with each command's key as its result. */
function fakeBatchCall(errorKeys: string[] = []) {
  const sizes: number[] = [];
  const call = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    expect(method).toBe('batch');
    const cmd = params!.cmd as Record<string, string>;
    sizes.push(Object.keys(cmd).length);
    const result: Record<string, string> = {};
    const result_error: Record<string, { error: string }> = {};
    for (const k of Object.keys(cmd)) {
      if (errorKeys.includes(k)) result_error[k] = { error: 'ACCESS_DENIED' };
      else result[k] = `${k}:${cmd[k]}`;
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
  return { call: call as unknown as Call, sizes };
}

const commands = (n: number) => {
  const out: Record<string, Command> = {};
  for (let i = 0; i < n; i++) out[`t${i}`] = { method: 'tasks.task.get', params: { taskId: i } };
  return out;
};

describe('batch', () => {
  it('splits into chunks of 50 and merges results', async () => {
    const { call, sizes } = fakeBatchCall();
    const res = await batch<string>(call, commands(120));
    expect(sizes).toEqual([50, 50, 20]);
    expect(Object.keys(res.result)).toHaveLength(120);
    expect(res.result.t119).toBe('t119:tasks.task.get?taskId=119');
  });

  it('throws on command errors unless allowErrors is set', async () => {
    const { call } = fakeBatchCall(['t3']);
    await expect(batch(call, commands(5))).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    const res = await batch(call, commands(5), { allowErrors: true });
    expect(Object.keys(res.errors)).toEqual(['t3']);
    expect(Object.keys(res.result)).toHaveLength(4);
  });

  it('rejects write methods inside a batch before calling Bitrix24', async () => {
    const { call } = fakeBatchCall();
    await expect(
      batch(call, { a: { method: 'tasks.task.complete', params: { taskId: 1 } } }),
    ).rejects.toThrow(/read-only/);
    expect(call).not.toHaveBeenCalled();
  });
});

describe('listAll', () => {
  it('fetches the first page, then the remaining pages in one batch', async () => {
    const call = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method !== 'batch') return { result: [1, 2], total: 120, next: 50 };
      const cmd = params!.cmd as Record<string, string>;
      const result: Record<string, number[]> = {};
      for (const k of Object.keys(cmd)) result[k] = [Number(k.slice(1))];
      return { result: { result, result_error: [], result_total: [], result_next: [] } };
    }) as unknown as Call;

    expect(await listAll<number>(call, 'sonet_group.get')).toEqual([1, 2, 50, 100]);
  });
});
