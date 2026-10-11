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

/** Ticked tasks (kept across pages) and the last check / apply result per task. */
export function useBulk(resetKey: string) {
  const [selected, setSelected] = useState<Map<number, TaskRow>>(new Map());
  const [results, setResults] = useState<Map<number, BulkResult>>(new Map());
  // A different list (filters, tile, search) starts a fresh selection.
  useEffect(() => {
    setSelected(new Map());
    setResults(new Map());
  }, [resetKey]);

  const toggle = (row: TaskRow, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) {
        if (next.size >= BULK_MAX) {
          toast.error(`At most ${BULK_MAX} tasks at once.`);
          return prev;
        }
        next.set(row.id, row);
      } else next.delete(row.id);
      return next;
    });
  const setPage = (rows: TaskRow[], on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        if (!on) next.delete(r.id);
        else if (next.size < BULK_MAX) next.set(r.id, r);
      }
      if (on && rows.some((r) => !next.has(r.id)))
        toast.error(`At most ${BULK_MAX} tasks at once.`);
      return next;
    });
  const clear = () => {
    setSelected(new Map());
    setResults(new Map());
  };
  return { selected, toggle, setPage, clear, results, setResults };
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
