import cors from '@fastify/cors';
import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { config } from './config';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.body.auth', '*.BITRIX_INBOUND_URL'],
      ...(process.env.NODE_ENV !== 'production' && process.stdout.isTTY
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
  });

  await app.register(cors, { origin: config.WEB_ORIGIN });

  app.get('/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  }));

  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const app = await buildServer();
  try {
    await app.listen({ host: '0.0.0.0', port: config.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
