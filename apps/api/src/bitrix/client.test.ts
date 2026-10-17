import { describe, expect, it, vi } from 'vitest';
import { BitrixError, createRawCaller } from './client';

const BASE = 'https://portal.example/rest/1/s3cr3t/';

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('createRawCaller', () => {
  it('posts JSON to <base><method>.json and returns result, total and next', async () => {
    const fetch = reply(200, { result: [{ ID: '1' }], total: 70, next: 50 });
    const call = createRawCaller({ baseUrl: BASE.slice(0, -1), fetch });
    const res = await call('user.get', { FILTER: { ACTIVE: true } });

    expect(res).toEqual({ result: [{ ID: '1' }], total: 70, next: 50 });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`${BASE}user.get.json`);
    expect(JSON.parse(String(init.body))).toEqual({ FILTER: { ACTIVE: true } });
  });

  it('marks QUERY_LIMIT_EXCEEDED as retryable', async () => {
    const call = createRawCaller({
      baseUrl: BASE,
      fetch: reply(503, { error: 'QUERY_LIMIT_EXCEEDED', error_description: 'Too many requests' }),
    });
    const err = await call('profile').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BitrixError);
    expect(err).toMatchObject({ code: 'QUERY_LIMIT_EXCEEDED', retryable: true });
  });

  it('marks ACCESS_DENIED as not retryable', async () => {
    const call = createRawCaller({ baseUrl: BASE, fetch: reply(403, { error: 'ACCESS_DENIED' }) });
    await expect(call('profile')).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
      retryable: false,
    });
  });

  it('never puts the webhook URL in error messages', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError(`fetch failed for ${BASE}profile.json`);
    });
    const call = createRawCaller({ baseUrl: BASE, fetch: failing });
    const err = (await call('profile').catch((e: unknown) => e)) as BitrixError;
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.retryable).toBe(true);
    expect(err.message).not.toContain('s3cr3t');
  });

  it('refuses write methods before any request', async () => {
    const fetch = reply(200, { result: true });
    const call = createRawCaller({ baseUrl: BASE, fetch });
    await expect(call('tasks.task.update', { taskId: 1 })).rejects.toThrow(/read-only/);
    await expect(call('tasks.task.add', { fields: { TITLE: 'x' } })).rejects.toThrow(/read-only/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates a task as the person only with the allowed fields', async () => {
    const fetch = reply(200, { result: { task: { id: '9' } } });
    const call = createRawCaller({ baseUrl: BASE, mode: 'userAction', fetch });
    const ok = {
      TITLE: 'Fixed the login page',
      RESPONSIBLE_ID: 7,
      GROUP_ID: 12,
      // Approved 2026-10-17 (Daily update Add task).
      DESCRIPTION: 'Steps…',
      TAGS: ['bug'],
      PRIORITY: '2',
      DEADLINE: '2026-10-20T13:00:00.000Z',
    };
    await expect(call('tasks.task.add', { fields: ok, auth: 't' })).resolves.toBeTruthy();
    await expect(
      call('tasks.task.add', { fields: { ...ok, CREATED_BY: 1 }, auth: 't' }),
    ).rejects.toThrow(/allowed set/);
    await expect(
      call('tasks.task.add', { fields: { TITLE: 'No one' }, auth: 't' }),
    ).rejects.toThrow(/allowed set/);
    await expect(call('tasks.task.delete', { taskId: 1, auth: 't' })).rejects.toThrow(
      /not an allowed/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
