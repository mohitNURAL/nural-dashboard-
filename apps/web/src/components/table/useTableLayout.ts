// A table shaped by its reader (2026-10-12): which columns show, in what order, and an own order
// of the rows. Saved per person in their layout (api/prefs.ts) under `table.<id>.cols`,
// `.hidden`, `.rows` and `.mode` ("custom" while their own row order is in use); Reset layout
// clears it. Pure helpers are exported for tests.
import { useCallback } from 'react';
import { usePrefs, useSavePrefs } from '../../api/prefs';

/** Moves `id` to where `target` is, in a list. */
export function moveTo(list: string[], id: string, target: string): string[] {
  if (id === target) return list;
  const rest = list.filter((x) => x !== id);
  const at = rest.indexOf(target);
  if (at < 0) return list;
  // Dropping on a later item puts it after; on an earlier one, before.
  const after = list.indexOf(id) < list.indexOf(target);
  rest.splice(after ? at + 1 : at, 0, id);
  return rest;
}

/**
 * Rows in the person's order: the ones they placed first, in that order; rows they never placed
 * (new tasks, other pages) keep their own order after them.
 */
export function inOrder<R>(rows: R[], key: (r: R) => string, saved: string[]): R[] {
  const at = new Map(saved.map((k, i) => [k, i]));
  return rows
    .map((r, i) => ({ r, i, k: at.get(key(r)) }))
    .sort((a, b) => (a.k ?? Infinity) - (b.k ?? Infinity) || a.i - b.i)
    .map((x) => x.r);
}

/** The new saved row order after a drag: what is shown, moved, then what was saved and unseen. */
export function dropRow(shown: string[], saved: string[], id: string, target: string): string[] {
  const moved = moveTo(shown, id, target);
  const seen = new Set(moved);
  return [...moved, ...saved.filter((k) => !seen.has(k))].slice(0, 2000);
}

export function useTableLayout(tableId: string | undefined) {
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  const k = (part: string) => `table.${tableId}.${part}`;
  const layout = tableId ? prefs?.layout : undefined;
  const set = useCallback(
    (part: string, value: string[] | null) => {
      if (!tableId) return;
      save((p) => {
        const next = { ...p.layout };
        if (value === null) delete next[`table.${tableId}.${part}`];
        else next[`table.${tableId}.${part}`] = value;
        return { layout: next };
      });
    },
    [save, tableId],
  );
  return {
    enabled: !!tableId,
    cols: layout?.[k('cols')],
    hidden: layout?.[k('hidden')] ?? [],
    rows: layout?.[k('rows')] ?? [],
    custom: layout?.[k('mode')]?.[0] === 'custom',
    setCols: (v: string[] | null) => set('cols', v),
    setHidden: (v: string[]) => set('hidden', v.length ? v : null),
    setRows: (v: string[]) => {
      set('rows', v);
      set('mode', ['custom']);
    },
    setCustom: (on: boolean) => set('mode', on ? ['custom'] : null),
    resetColumns: () => {
      set('cols', null);
      set('hidden', null);
    },
  };
}
