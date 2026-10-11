import { describe, expect, it } from 'vitest';
import { applyOrder } from './order';

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
