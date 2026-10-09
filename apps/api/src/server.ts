import cors from '@fastify/cors';
import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import { config } from './config';
import { cachedDataset, loadDataset, type DatasetProvider } from './data/dataset';
import { devRoutes } from './routes/dev';
import { filterRoutes } from './routes/filters';
import { qaRoutes } from './routes/qa';
import { taskRoutes } from './routes/tasks';

export interface ServerOptions {
  /** Defaults to Postgres with a 30 s cache; tests pass an in-memory dataset. */
  getDataset?: DatasetProvider;
  now?: () => Date;
  logger?: boolean;
}

export async function buildServer({ getDataset, now, logger = true }: ServerOptions = {}) {
  const app = Fastify({
    logger: logger && {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.body.auth', '*.BITRIX_INBOUND_URL'],
      ...(process.env.NODE_ENV !== 'production' && process.stdout.isTTY
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
  });

  await app.register(cors, { origin: config.WEB_ORIGIN });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid query',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    reply.log.error(err);
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    return reply.code(status).send({ error: status === 500 ? 'Internal error' : err.message });
  });

  app.get('/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  }));

  const dataset = getDataset ?? cachedDataset(loadDataset).get;
  const opts = { tz: config.APP_TIMEZONE, now };
  devRoutes(app, dataset, opts);
  qaRoutes(app, dataset, opts);
  taskRoutes(app, dataset, opts);
  filterRoutes(app, dataset, opts);

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
