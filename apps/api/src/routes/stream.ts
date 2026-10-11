// GET /api/stream (SRS 7 module 6): Server-Sent Events. The browser only listens; it
// refetches the queries a task.changed message affects.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { LOCAL_VIEWER, type Viewer } from '../auth/roles';
import type { EventBus, TaskChanged } from '../events/bus';

const HEARTBEAT_MS = 25_000;

/**
 * NFR-4: a full viewer gets every change; a member only changes that name them (assignee,
 * creator, previous assignee). The nightly notice (taskId 0) carries no task and goes to all.
 * A change naming no one is not sent (fail closed).
 */
export const mayReceive = (viewer: Viewer, change: TaskChanged) =>
  viewer.full || change.taskId === 0 || (change.people ?? []).includes(viewer.userId);

export function streamRoutes(
  app: FastifyInstance,
  bus: EventBus,
  webOrigin: string,
  viewerOf?: (req: FastifyRequest) => Promise<Viewer>,
) {
  const clients = new Map<(chunk: string) => void, Viewer>();
  bus.subscribe((change) => {
    const chunk = `event: ${change.type}\ndata: ${JSON.stringify(change)}\n\n`;
    for (const [send, viewer] of clients) if (mayReceive(viewer, change)) send(chunk);
  });

  app.get('/api/stream', async (req, reply) => {
    const viewer: Viewer = viewerOf ? await viewerOf(req) : LOCAL_VIEWER;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx: do not buffer the stream
      'Access-Control-Allow-Origin': webOrigin,
    });
    const send = (chunk: string) => res.write(chunk);
    // Browsers reconnect after `retry` ms if the connection drops.
    send(
      `retry: 3000\nevent: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
    );
    clients.set(send, viewer);
    const ping = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
    req.raw.on('close', () => {
      clearInterval(ping);
      clients.delete(send);
    });
  });

  return { clientCount: () => clients.size };
}
