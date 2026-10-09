// GET /api/stream (SRS 7 module 6): Server-Sent Events. The browser only listens; it
// refetches the queries a task.changed message affects.
import type { FastifyInstance } from 'fastify';
import type { EventBus } from '../events/bus';

const HEARTBEAT_MS = 25_000;

export function streamRoutes(app: FastifyInstance, bus: EventBus, webOrigin: string) {
  const clients = new Set<(chunk: string) => void>();
  bus.subscribe((change) => {
    const chunk = `event: ${change.type}\ndata: ${JSON.stringify(change)}\n\n`;
    for (const send of clients) send(chunk);
  });

  app.get('/api/stream', (req, reply) => {
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
    clients.add(send);
    const ping = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
    req.raw.on('close', () => {
      clearInterval(ping);
      clients.delete(send);
    });
  });

  return { clientCount: () => clients.size };
}
