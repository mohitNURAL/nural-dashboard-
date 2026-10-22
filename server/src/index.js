import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { env, isMock, ROOT } from './config.js';
import { createBitrixClient } from './bitrix/client.js';
import { createMockClient } from './bitrix/mock.js';
import { createSyncService } from './sync.js';
import { createAuth } from './auth.js';
import { createRouter } from './routes.js';

const log = console;
const client = isMock
  ? createMockClient({ leadPipelineField: env.leadPipelineField, log })
  : createBitrixClient(env.webhookUrl, { log });

if (isMock) log.warn('[bitrix] BITRIX_WEBHOOK_URL not set — running on MOCK portal data');

const sync = createSyncService({ client, env, log });
const auth = createAuth(env.users, { log });

const app = express();
app.disable('x-powered-by');
app.get('/health', (req, res) => res.json({ ok: true, ...sync.status() }));
app.use('/api', createRouter({ client, sync, env, auth }));

// Production: serve the built React app from the same origin.
const dist = path.resolve(ROOT, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, _next) => {
  log.error(err);
  res.status(500).json({ error: 'Internal error' });
});

await sync.start();
app.listen(env.port, () => log.info(`[server] listening on http://localhost:${env.port}`));
