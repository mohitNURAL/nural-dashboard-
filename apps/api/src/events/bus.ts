// Change notifications between the sync worker and every API process (Redis pub/sub).
import type { TaskChanged } from '@nural/shared';
import { Redis } from 'ioredis';

export type { TaskChanged };

export const CHANNEL = 'dashboard:events';

export interface EventBus {
  publish(change: TaskChanged): Promise<void>;
  subscribe(fn: (change: TaskChanged) => void): () => void;
  close(): Promise<void>;
}

export function createRedisBus(redisUrl: string): EventBus {
  const pub = new Redis(redisUrl, { maxRetriesPerRequest: null });
  let sub: Redis | undefined;
  const listeners = new Set<(c: TaskChanged) => void>();

  const ensureSub = () => {
    if (sub) return;
    sub = new Redis(redisUrl, { maxRetriesPerRequest: null });
    void sub.subscribe(CHANNEL);
    sub.on('message', (_channel, raw: string) => {
      let change: TaskChanged;
      try {
        change = JSON.parse(raw) as TaskChanged;
      } catch {
        return;
      }
      for (const fn of listeners) fn(change);
    });
  };

  return {
    async publish(change) {
      await pub.publish(CHANNEL, JSON.stringify(change));
    },
    subscribe(fn) {
      ensureSub();
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async close() {
      await Promise.all([pub.quit(), sub?.quit()].filter(Boolean));
    },
  };
}

/** In-process bus for tests and single-process use without Redis. */
export function createMemoryBus(): EventBus {
  const listeners = new Set<(c: TaskChanged) => void>();
  return {
    async publish(change) {
      for (const fn of listeners) fn(change);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async close() {
      listeners.clear();
    },
  };
}
