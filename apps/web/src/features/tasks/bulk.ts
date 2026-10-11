// Bulk-edit selection and results (see BulkEdit.tsx).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { TaskRow } from '../../api/types';

export const BULK_MAX = 100;

export type BulkState = 'ok' | 'skip' | 'error' | 'done' | 'failed';
export interface BulkResult {
  id: number;
  state: BulkState;
  reason: string;
}

/**
 * Ticked tasks (kept across pages) and the last check / apply result per task. `page` is the
 * page on screen: a ticked task that disappears from the page it was ticked on (it no longer
 * matches the list after a change) is unticked, so the count always matches the list.
 */
export function useBulk(resetKey: string, page: number, pageRows: TaskRow[] | undefined) {
  const [selected, setSelected] = useState<Map<number, TaskRow>>(new Map());
  const [results, setResults] = useState<Map<number, BulkResult>>(new Map());
  const [pageOf] = useState(() => new Map<number, number>());
  // A different list (filters, tile, search) starts a fresh selection.
  useEffect(() => {
    setSelected(new Map());
    setResults(new Map());
    pageOf.clear();
  }, [resetKey, pageOf]);

  // The list refreshed (a change, a live update): drop ticks for tasks no longer on their page.
  useEffect(() => {
    if (!pageRows) return;
    const here = new Set(pageRows.map((r) => r.id));
    const gone = [...pageOf].filter(([id, p]) => p === page && !here.has(id)).map(([id]) => id);
    if (!gone.length) return;
    for (const id of gone) pageOf.delete(id);
    setSelected((prev) => {
      const next = new Map(prev);
      gone.forEach((id) => next.delete(id));
      return next;
    });
    setResults((prev) => {
      const next = new Map(prev);
      gone.forEach((id) => next.delete(id));
      return next;
    });
  }, [pageRows, page, pageOf]);

  const toggle = (row: TaskRow, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) {
        if (next.size >= BULK_MAX) {
          toast.error(`At most ${BULK_MAX} tasks at once.`);
          return prev;
        }
        next.set(row.id, row);
        pageOf.set(row.id, page);
      } else {
        next.delete(row.id);
        pageOf.delete(row.id);
      }
      return next;
    });
  const setPage = (rows: TaskRow[], on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        if (!on) {
          next.delete(r.id);
          pageOf.delete(r.id);
        } else if (next.size < BULK_MAX) {
          next.set(r.id, r);
          pageOf.set(r.id, page);
        }
      }
      if (on && rows.some((r) => !next.has(r.id)))
        toast.error(`At most ${BULK_MAX} tasks at once.`);
      return next;
    });
  const clear = () => {
    setSelected(new Map());
    setResults(new Map());
    pageOf.clear();
  };
  /**
   * After Apply: changed and already-so tasks are unticked; only the ones that could not be
   * changed stay ticked (and red), to fix and retry.
   */
  const afterApply = (out: BulkResult[]) => {
    const keep = new Set(
      out.filter((r) => r.state === 'error' || r.state === 'failed').map((r) => r.id),
    );
    setSelected((prev) => new Map([...prev].filter(([id]) => keep.has(id))));
    setResults(new Map(out.filter((r) => keep.has(r.id)).map((r) => [r.id, r])));
    for (const id of [...pageOf.keys()]) if (!keep.has(id)) pageOf.delete(id);
  };
  return { selected, toggle, setPage, clear, results, setResults, afterApply };
}

export type Bulk = ReturnType<typeof useBulk>;

/** Row look for a result: red = cannot be changed, grey = already so, green = done. */
export const bulkRowClass = (r?: BulkResult) =>
  !r
    ? undefined
    : r.state === 'error' || r.state === 'failed'
      ? '!bg-bad-soft/40 outline outline-1 -outline-offset-1 outline-bad'
      : r.state === 'skip'
        ? 'opacity-60'
        : r.state === 'done'
          ? '!bg-good/15'
          : '!bg-primary-soft-100';
