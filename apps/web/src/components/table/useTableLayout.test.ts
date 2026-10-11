import { describe, expect, it } from 'vitest';
import { dropRow, inOrder, moveTo } from './useTableLayout';

describe('tables the reader shapes', () => {
  it('moves an item onto another: after it when moving down, before it when moving up', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveTo(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(moveTo(['a', 'b'], 'a', 'zz')).toEqual(['a', 'b']);
  });

  it("rows follow the reader's order; rows never placed keep theirs after them", () => {
    const rows = ['1', '2', '3', '4', '5'];
    expect(inOrder(rows, (r) => r, ['4', '2'])).toEqual(['4', '2', '1', '3', '5']);
    expect(inOrder(rows, (r) => r, [])).toEqual(rows);
  });

  it('a drag saves the shown order and keeps what was placed on other pages', () => {
    expect(dropRow(['1', '2', '3'], ['9', '2', '8'], '3', '1')).toEqual(['3', '1', '2', '9', '8']);
  });
});
