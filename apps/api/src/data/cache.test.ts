// The in-memory dataset (2026-10-30): a changed task is patched in, not a full reload.
import { describe, expect, it, vi } from 'vitest';
import { cachedDataset, mergeRows, PATCH_MAX, type Dataset, type RowSource } from './dataset';

type Rows = { version: number; ids: number[] };

function source(opts: { failPatch?: boolean } = {}) {
  let loads = 0;
  const patched: number[][] = [];
  const src: RowSource<Rows> = {
    load: vi.fn(async () => ({ version: ++loads, ids: [] })),
    patch: vi.fn(async (r: Rows, ids: readonly number[]) => {
      if (opts.failPatch) throw new Error('db down');
      patched.push([...ids]);
      return { ...r, ids: [...r.ids, ...ids] };
    }),
    build: (r: Rows) => ({ loadedAt: new Date(r.version), tasks: r.ids }) as unknown as Dataset,
  };
  return { src, patched, loads: () => loads };
}

const ids = (ds: Dataset) => ds.tasks as unknown as number[];

describe('dataset cache', () => {
  it('loads once for callers together, and again only when something changed', async () => {
    const s = source();
    const cache = cachedDataset(s.src);
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    expect(a).toBe(b);
    expect(s.loads()).toBe(1);
    expect(await cache.get()).toBe(a);
    expect(s.src.patch).not.toHaveBeenCalled();
  });

  it('a changed task is patched in, not a full reload', async () => {
    const s = source();
    const cache = cachedDataset(s.src);
    await cache.get();
    cache.changed([41, 42]);
    cache.changed([41]);
    expect(ids(await cache.get())).toEqual([41, 42]);
    expect(s.patched).toEqual([[41, 42]]);
    expect(s.loads()).toBe(1);
    // Nothing new: the same dataset.
    expect(ids(await cache.get())).toEqual([41, 42]);
    expect(s.patched).toHaveLength(1);
  });

  it('reloads everything after a big burst, a failed patch, invalidate or the time limit', async () => {
    const s = source();
    const cache = cachedDataset(s.src);
    await cache.get();
    cache.changed(Array.from({ length: PATCH_MAX + 1 }, (_, i) => i + 1));
    await cache.get();
    expect(s.loads()).toBe(2);
    expect(s.src.patch).not.toHaveBeenCalled();

    cache.invalidate();
    await cache.get();
    expect(s.loads()).toBe(3);

    const failing = source({ failPatch: true });
    const c2 = cachedDataset(failing.src);
    await c2.get();
    c2.changed([7]);
    await c2.get();
    expect(failing.loads()).toBe(2);

    vi.useFakeTimers();
    try {
      const t = source();
      const c3 = cachedDataset(t.src, 1000);
      await c3.get();
      vi.advanceTimersByTime(1001);
      await c3.get();
      expect(t.loads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores the notice without a task (id 0)', async () => {
    const s = source();
    const cache = cachedDataset(s.src);
    await cache.get();
    cache.changed([0]);
    await cache.get();
    expect(s.src.patch).not.toHaveBeenCalled();
  });
});

describe('merging re-read rows', () => {
  const task = (id: number, deleted = false) => ({ id, deleted, v: 'old' });
  it('swaps changed tasks in place, drops deleted ones, adds new ones and their links', () => {
    const rows = {
      taskRows: [task(1), task(2), task(3)],
      eventRows: [
        { taskId: 1, e: 'a' },
        { taskId: 2, e: 'b' },
      ],
      relationRows: [
        { taskId: 1, relatedId: 2 },
        { taskId: 3, relatedId: 1 },
      ],
    };
    const out = mergeRows(rows as never, [2, 3, 9], {
      tasks: [{ ...task(2), v: 'new' }, task(3, true), task(9)] as never,
      events: [{ taskId: 2, e: 'b2' }] as never,
      relations: [{ taskId: 9, relatedId: 1 }] as never,
    }) as unknown as typeof rows;
    expect(out.taskRows.map((t) => [t.id, t.v])).toEqual([
      [1, 'old'],
      [2, 'new'],
      [9, 'old'],
    ]);
    expect(out.eventRows).toEqual([
      { taskId: 1, e: 'a' },
      { taskId: 2, e: 'b2' },
    ]);
    // Links touching a re-read task come from the fresh read only.
    expect(out.relationRows).toEqual([{ taskId: 9, relatedId: 1 }]);
  });
});
