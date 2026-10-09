import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryBus, type TaskChanged } from '../events/bus';
import { buildServer } from '../server';
import type { Enqueue } from '../sync/worker';

const TOKEN = 'test-token';
const queued: Parameters<Enqueue>[0][] = [];
const recorded: { event: string; taskId: number | null; payload: Record<string, unknown> }[] = [];
const bus = createMemoryBus();

let app: Awaited<ReturnType<typeof buildServer>>;
let base = '';
beforeAll(async () => {
  app = await buildServer({
    logger: false,
    bus,
    getDataset: async () => {
      throw new Error('not used');
    },
    hooks: {
      token: TOKEN,
      enqueue: async (job) => {
        queued.push(job);
      },
      record: async (event, taskId, payload) => {
        recorded.push({ event, taskId, payload });
      },
    },
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => app.close());

const hook = (form: Record<string, string>) =>
  fetch(`${base}/hooks/bitrix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });

describe('POST /hooks/bitrix', () => {
  it('rejects a wrong application token', async () => {
    const res = await hook({
      event: 'ONTASKUPDATE',
      'data[FIELDS_AFTER][ID]': '41580',
      'auth[application_token]': 'nope',
    });
    expect(res.status).toBe(401);
    expect(queued).toHaveLength(0);
  });

  it('queues the task, stores the call without auth, and answers 200', async () => {
    const res = await hook({
      event: 'ONTASKUPDATE',
      'data[FIELDS_AFTER][ID]': '41580',
      'auth[application_token]': TOKEN,
    });
    expect(res.status).toBe(200);
    expect(queued).toEqual([{ taskId: 41580, event: 'ONTASKUPDATE' }]);
    expect(recorded.at(-1)).toEqual({
      event: 'ONTASKUPDATE',
      taskId: 41580,
      payload: { event: 'ONTASKUPDATE', 'data[FIELDS_AFTER][ID]': '41580' },
    });
    const health = (await (await fetch(`${base}/health`)).json()) as { lastWebhookAt: unknown };
    expect(health.lastWebhookAt).not.toBeNull();
  });

  it('acknowledges events it does not handle', async () => {
    const res = await hook({ event: 'ONCRMDEALADD', 'auth[application_token]': TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: 'ONCRMDEALADD' });
  });
});

describe('GET /api/stream', () => {
  it('sends hello, then task.changed messages from the bus', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (needle: string) => {
      while (!text.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
    };
    await readUntil('event: hello');

    const change: TaskChanged = {
      type: 'task.changed',
      taskId: 41580,
      title: 'Price Update in Back Date',
      projectId: 154,
      stage: 'In QA',
      fromStage: 'Pending for QA',
      stageGroup: 'sentToQa',
      isIssue: false,
      isNew: false,
      reopened: false,
      deleted: false,
      source: 'webhook',
      at: new Date().toISOString(),
    };
    await bus.publish(change);
    await readUntil('"taskId":41580');
    expect(text).toContain('event: task.changed');
    expect(text).toContain('"stage":"In QA"');
    ctrl.abort();
  });
});
