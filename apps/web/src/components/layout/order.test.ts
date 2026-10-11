import { describe, expect, it } from 'vitest';
import { applyOrder, pairOnDrop, rowSpans } from './order';

describe('applyOrder', () => {
  const defaults = ['a', 'b', 'c', 'd'];
  it('uses the default order when nothing is saved', () => {
    expect(applyOrder(defaults)).toEqual(defaults);
    expect(applyOrder(defaults, [])).toEqual(defaults);
  });
  it('keeps the saved order', () => {
    expect(applyOrder(defaults, ['d', 'c', 'b', 'a'])).toEqual(['d', 'c', 'b', 'a']);
  });
  it('drops ids no longer on the page and duplicates', () => {
    expect(applyOrder(['a', 'b'], ['b', 'gone', 'b', 'a'])).toEqual(['b', 'a']);
  });
  it('puts a new item after its default neighbour', () => {
    // 'c' is new: it follows 'b', wherever the person moved 'b'.
    expect(applyOrder(defaults, ['b', 'd', 'a'])).toEqual(['b', 'c', 'd', 'a']);
    // A new first item goes first.
    expect(applyOrder(['n', 'a', 'b'], ['b', 'a'])).toEqual(['n', 'b', 'a']);
  });
});

describe('card widths', () => {
  // Development defaults: 7 + 5, 6 + 6, then a full-width card.
  const spans = new Map([
    ['assignees', 7],
    ['pendingDone', 5],
    ['ageing', 6],
    ['ranking', 6],
    ['matrix', 12],
  ]);
  const widths = (ids: string[], pairs?: [string, string][]) =>
    ids.map((id) => rowSpans(ids, spans, pairs).get(id));

  it('keeps the default layout', () => {
    expect(widths(['assignees', 'pendingDone', 'ageing', 'ranking', 'matrix'])).toEqual([
      7, 5, 6, 6, 12,
    ]);
  });

  it('widens a half card left alone in its row, so there are no gaps', () => {
    // Ranking moved below the full-width matrix: ageing and ranking are each alone.
    expect(widths(['assignees', 'pendingDone', 'ageing', 'matrix', 'ranking'])).toEqual([
      7, 5, 12, 12, 12,
    ]);
  });

  it('splits 6 + 6 when two halves meet that are not a default pair', () => {
    expect(widths(['pendingDone', 'ageing', 'assignees', 'ranking', 'matrix'])).toEqual([
      6, 6, 6, 6, 12,
    ]);
  });

  it('pairs a half card dropped next to a full card, which turns half', () => {
    const ids = ['assignees', 'pendingDone', 'ageing', 'ranking', 'matrix'];
    // Ranking dropped just before the matrix, after ageing moved away: ranking is alone.
    const order = ['assignees', 'pendingDone', 'ageing', 'matrix', 'ranking'];
    const pairs = pairOnDrop(order, spans, [], 'ranking');
    expect(pairs).toEqual([['ranking', 'matrix']]);
    // Ageing, now alone, widens; the matrix and ranking share the last row.
    expect(widths(order, pairs)).toEqual([7, 5, 12, 6, 6]);
    // A drop that already fills its row changes nothing.
    expect(pairOnDrop(ids, spans, [], 'ranking')).toEqual([]);
  });

  it('a paired full card on its own again goes back to full width', () => {
    const pairs: [string, string][] = [['ranking', 'matrix']];
    expect(widths(['matrix', 'assignees', 'pendingDone', 'ranking'], pairs)).toEqual([
      12, 7, 5, 12,
    ]);
    // Moving cards apart forgets the pair.
    expect(pairOnDrop(['matrix', 'assignees', 'ranking'], spans, pairs, 'assignees')).toEqual([]);
  });
});
