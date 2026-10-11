// Integration › Connections and Mailing (SRS 19), admins only: connection status and tests, the
// report designer (create, change, preview, test, go live, pause, delete) and each report's runs.
import { CONDITION_METRICS, REPORT_TOPICS, SUGGESTED_PROMPTS } from '@nural/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Viewer } from '../auth/roles';
import { renderEmail, renderSlack } from '../reports/render';
import { runReport, renderFor, type EngineDeps } from '../reports/engine';
import { AUDIENCE_ROLES, reportInput, scheduleText, type Report } from '../reports/model';
import type { ReportScheduler } from '../reports/schedule';
import type { ReportStore } from '../reports/store';

export interface ReportRouteDeps {
  engine: EngineDeps;
  store: ReportStore;
  /** Absent where the worker does not run (local copies): reports are not scheduled there. */
  scheduler?: ReportScheduler;
  /** Infowan connection (SRS 19, CRM). */
  infowan?: () => { connected: boolean };
}

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function reportRoutes(
  app: FastifyInstance,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  deps: ReportRouteDeps,
) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/reports') && !req.url.startsWith('/api/integrations')) return;
    if (!(await viewer(req)).admin)
      return reply.code(403).send({ error: 'Integration is for admins only.' });
  });

  const view = (r: Report) => ({ ...r, schedule: scheduleText(r.definition) });

  app.get('/api/integrations/status', async () => ({
    mail: { connected: deps.engine.mailer.connected, from: deps.engine.mailer.from },
    slack: {
      connected: deps.engine.slack.connected,
      team: await deps.engine.slack.team().catch(() => null),
    },
    infowan: { connected: deps.infowan?.().connected ?? false },
    scheduling: !!deps.scheduler,
  }));

  // A test message to the admin who asks, through mail or Slack.
  app.post('/api/integrations/test', async (req, reply) => {
    const { channel } = z.object({ channel: z.enum(['mail', 'slack']) }).parse(req.body);
    const v = await viewer(req);
    const ds = await deps.engine.dataset();
    const email = ds.users.get(v.userId)?.email;
    if (!email) return reply.code(400).send({ error: 'Your Bitrix24 profile has no email.' });
    const data = {
      title: 'Connection test',
      periodLabel: 'now',
      sections: [
        {
          topic: 'summary' as const,
          title: 'It works',
          items: [{ text: 'The dashboard can reach you here.' }],
        },
      ],
    };
    const meta = {
      recipientName: ds.users.get(v.userId)?.name ?? 'you',
      scopeLabel: 'Test',
      test: true,
      dashboardUrl: deps.engine.dashboardUrl,
    };
    try {
      if (channel === 'mail') {
        const m = renderEmail(data, meta);
        await deps.engine.mailer.send({ to: [email], subject: m.subject, html: m.html });
      } else {
        await deps.engine.slack.toPerson(email, renderSlack(data, meta));
      }
      return { ok: true, to: email };
    } catch (e) {
      return reply.code(502).send({ error: e instanceof Error ? e.message : 'Failed' });
    }
  });

  app.get('/api/integrations/slack/channels', async (_req, reply) => {
    if (!deps.engine.slack.connected) return { channels: [] };
    try {
      return { channels: await deps.engine.slack.channels() };
    } catch (e) {
      return reply.code(502).send({ error: e instanceof Error ? e.message : 'Failed' });
    }
  });

  app.get('/api/reports/catalogue', async () => ({
    topics: REPORT_TOPICS,
    prompts: SUGGESTED_PROMPTS,
    metrics: CONDITION_METRICS,
    roles: AUDIENCE_ROLES,
  }));

  app.get('/api/reports', async () => {
    const list = await deps.store.list();
    return {
      reports: await Promise.all(
        list.map(async (r) => ({ ...view(r), lastRuns: await deps.store.runs(r.id, 5) })),
      ),
    };
  });

  app.post('/api/reports', async (req, reply) => {
    const parsed = reportInput.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid report.' });
    const r = await deps.store.create(
      parsed.data.name,
      parsed.data.definition,
      (await viewer(req)).userId,
    );
    await deps.scheduler?.sync(r);
    return { report: view(r) };
  });

  app.put('/api/reports/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const parsed = reportInput.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid report.' });
    const r = await deps.store.update(id, parsed.data.name, parsed.data.definition);
    if (!r) return reply.code(404).send({ error: 'No such report.' });
    await deps.scheduler?.sync(r);
    return { report: view(r) };
  });

  app.post('/api/reports/:id/state', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { state } = z.object({ state: z.enum(['preview', 'live', 'paused']) }).parse(req.body);
    const r = await deps.store.setState(id, state);
    if (!r) return reply.code(404).send({ error: 'No such report.' });
    await deps.scheduler?.sync(r);
    return { report: view(r) };
  });

  app.delete('/api/reports/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    await deps.store.remove(id);
    await deps.scheduler?.remove(id);
    return { ok: true };
  });

  // The report as someone would get it (no send).
  app.post('/api/reports/:id/render', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(req.body);
    const r = await deps.store.get(id);
    if (!r) return reply.code(404).send({ error: 'No such report.' });
    return renderFor(r, deps.engine, userId);
  });

  // Send it now to the admin who asks (built as for `sampleFor`, default themselves).
  app.post('/api/reports/:id/test', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { sampleFor } = z
      .object({ sampleFor: z.coerce.number().int().positive().optional() })
      .parse(req.body ?? {});
    const r = await deps.store.get(id);
    if (!r) return reply.code(404).send({ error: 'No such report.' });
    return runReport(r, deps.engine, {
      kind: 'test',
      userId: (await viewer(req)).userId,
      sampleFor,
    });
  });

  app.get('/api/reports/:id/runs', async (req) => {
    const { id } = idParam.parse(req.params);
    return { runs: await deps.store.runs(id, 100) };
  });
}
