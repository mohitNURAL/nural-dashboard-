// Task-list Excel follows the reader's columns and row order (2026-10-12).
import { describe, expect, it } from 'vitest';
import { arrange, inRowOrder } from './export';

const defs = ['id', 'title', 'projectId', 'project', 'group', 'url'].map((key) => ({ key }));

describe('task list export layout', () => {
  it('shown columns first in their order, then details, without hidden ones', () => {
    const keys = (l: Parameters<typeof arrange>[1]) => arrange(defs, l).map((d) => d.key);
    expect(keys({})).toEqual(['id', 'title', 'projectId', 'project', 'group', 'url']);
    expect(keys({ cols: ['project', 'id', 'title', 'status'] })).toEqual([
      'project',
      'id',
      'title',
      'group',
      'projectId',
      'url',
    ]);
    expect(keys({ cols: ['title', 'id'], hidden: ['project'] })).toEqual([
      'title',
      'id',
      'projectId',
      'group',
      'url',
    ]);
  });

  it("rows in the reader's order, the rest after in their own order", () => {
    const rows = [1, 2, 3, 4].map((id) => ({ id }));
    expect(inRowOrder(rows, [3, 1]).map((r) => r.id)).toEqual([3, 1, 2, 4]);
    expect(inRowOrder(rows).map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });
});
