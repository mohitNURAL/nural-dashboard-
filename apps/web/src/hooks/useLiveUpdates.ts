// Listens to GET /api/stream (SSE) and refetches dashboard queries when a task changes.
import type { TaskChanged } from '@nural/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { API_KEY } from '../api/queries';
import { useLive } from '../store/live';
import { liveMessage } from './liveMessage';

/** Bursts of changes (a bulk move, a reconcile) cause one refetch, not one per task. */
const INVALIDATE_DELAY_MS = 300;
/** Reconnect backoff after the stream closes for good (API restart, proxy error). */
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

export function useLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { setStatus, changed } = useLive.getState();
    let source: EventSource | undefined;
    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let delay = RECONNECT_MIN_MS;
    let wasDown = false;
    let stopped = false;

    const refetchSoon = () => {
      clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: [API_KEY] }),
        INVALIDATE_DELAY_MS,
      );
    };

    const connect = () => {
      source = new EventSource('/api/stream');

      source.onopen = () => {
        setStatus('live');
        delay = RECONNECT_MIN_MS;
        // Changes made while disconnected never reached us; refetch to catch up.
        if (wasDown) refetchSoon();
        wasDown = false;
      };

      // EventSource retries a dropped connection by itself, but gives up for good on an
      // HTTP error (e.g. the dev proxy's 502 while the API restarts), so reconnect here.
      source.onerror = () => {
        wasDown = true;
        if (source?.readyState !== EventSource.CLOSED) {
          setStatus('connecting');
          return;
        }
        setStatus('offline');
        source.close();
        if (stopped) return;
        reconnectTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, RECONNECT_MAX_MS);
      };

      source.addEventListener('task.changed', (e) => {
        let change: TaskChanged;
        try {
          change = JSON.parse((e as MessageEvent<string>).data) as TaskChanged;
        } catch {
          return;
        }
        changed(change.at);
        refetchSoon();
        // Reconciler catch-ups are silent; only live webhook events toast.
        if (change.source === 'workflow') {
          toast('The workflow was updated', {
            description: 'Every page now counts with the new stage rules.',
            id: 'workflow',
          });
          return;
        }
        if (useLive.getState().toastsEnabled && change.source === 'webhook') {
          toast(liveMessage(change), { description: change.title, id: `task-${change.taskId}` });
        }
      });
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(invalidateTimer);
      clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [queryClient]);
}
