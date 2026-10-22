// REST surface for the React app (SRS §8).

import express from 'express';
import { saveMapping, loadMapping } from './config.js';
import { readAudit, writeAudit } from './audit.js';
import { applyMappingChange, computeMappingIssues, MappingError } from './mappingAdmin.js';
import { PeriodError, resolvePeriod } from './metrics/period.js';
import {
  assertPipeline, computeDashboard, computeDealFunnel, computeDealsAtRisk, computeKpis, computeLeadFunnel,
  computeLeadSources, computePipelineBreakdown, computeTrend, missingValueRows,
} from './metrics/dashboard.js';
import { applyDealCustomer, updateDeal, updateLead, WriteError } from './writeback.js';
import { computeRecords, RecordsQueryError } from './metrics/records.js';
import { computeFollowUpList } from './metrics/followUps.js';

export function createRouter({ client, sync, env, auth }) {
  const r = express.Router();
  const json = express.json({ limit: '64kb' });

  // Bitrix event webhooks authenticate with their application token, not a user.
  r.post('/bitrix/events', express.urlencoded({ extended: true }), (req, res) => {
    const token = req.body?.auth?.application_token;
    if (!env.eventToken || token !== env.eventToken) return res.status(401).end();
    sync.requestSync();
    res.json({ ok: true });
  });

  r.use(auth.authenticate);

  r.get('/me', (req, res) => res.json(req.user));

  const ready = (req, res, next) => {
    if (!sync.model) return res.status(503).json({ error: 'Data not loaded yet — first Bitrix24 sync has not completed', sync: sync.status() });
    next();
  };

  const ctxFor = (req) => {
    const pipeline = String(req.query.pipeline || 'all');
    assertPipeline(pipeline);
    const now = Date.now();
    // Portal origin, for "open in Bitrix24" links in drill-down lists.
    const portal = env.webhookUrl ? new URL(env.webhookUrl).origin : null;
    return { pipeline, period: resolvePeriod(req.query, now), now, portal };
  };

  const panel = (fn) => [ready, (req, res) => {
    let ctx;
    try {
      ctx = ctxFor(req);
    } catch (err) {
      if (err instanceof PeriodError || err instanceof RangeError) return res.status(400).json({ error: err.message });
      throw err;
    }
    res.json(fn(sync.model, sync.mapping, ctx));
  }];

  r.get('/dashboard', ...panel((m, map, ctx) => ({ ...computeDashboard(m, map, ctx), sync: sync.status() })));
  r.get('/dashboard/kpis', ...panel(computeKpis));
  r.get('/dashboard/lead-funnel', ...panel(computeLeadFunnel));
  r.get('/dashboard/deal-funnel', ...panel(computeDealFunnel));
  r.get('/dashboard/lead-sources', ...panel(computeLeadSources));
  r.get('/dashboard/pipeline-breakdown', ...panel(computePipelineBreakdown));
  r.get('/dashboard/trend', ...panel((m, _map, ctx) => computeTrend(m, ctx)));
  r.get('/dashboard/deals-at-risk', ...panel(computeDealsAtRisk));
  // Drill-down: the deals/leads behind a card (view, bucket, family, categoryId).
  r.get('/dashboard/records', ready, (req, res) => {
    try {
      const { view, bucket, family, categoryId } = req.query;
      res.json(computeRecords(sync.model, sync.mapping, ctxFor(req), { view, bucket, family, categoryId }));
    } catch (err) {
      if (err instanceof RecordsQueryError || err instanceof PeriodError || err instanceof RangeError) return res.status(400).json({ error: err.message });
      throw err;
    }
  });
  // Follow Up Summary popup: customers with a follow-up due in the window.
  r.get('/dashboard/follow-ups', ready, (req, res) => {
    try {
      res.json(computeFollowUpList(sync.model, ctxFor(req), String(req.query.window || 'today')));
    } catch (err) {
      if (err instanceof PeriodError || err instanceof RangeError) return res.status(400).json({ error: err.message });
      throw err;
    }
  });
  r.get('/dashboard/missing-value', ...panel((m, map, ctx) => ({ rows: missingValueRows(m, map, ctx.pipeline, { portal: ctx.portal }) })));

  r.get('/meta/pipelines', ready, (req, res) => {
    const { labels, order } = sync.mapping.pipelineFamilies;
    res.json({
      leadTaggingEnabled: Boolean(env.leadPipelineField),
      families: order.map((family) => ({
        family,
        label: labels[family],
        categories: sync.model.categories.filter((c) => c.family === family && !c.untagged).map((c) => ({ id: c.id, name: c.name })),
      })),
    });
  });

  r.get('/meta/last-sync', (req, res) => res.json(sync.status()));

  // Data Mapping section: stages/statuses/pipelines the config doesn't place.
  r.get('/meta/mapping-issues', ready, (req, res) => res.json(computeMappingIssues(sync.model, sync.mapping)));

  // Live updates to open dashboards (Server-Sent Events): a `sync` event after
  // every Bitrix check; clients reload when `version` changes.
  r.get('/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = (s) => res.write(`event: sync\ndata: ${JSON.stringify(s)}\n\n`);
    send(sync.status());
    const unsubscribe = sync.subscribe(send);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });

  // ---- Pipeline admin only (SRS §3) ----
  const write = (fn) => [auth.requireAdmin, ready, json, async (req, res, next) => {
    try {
      res.json(await fn({ client, sync, env, user: req.user, id: req.params.id, body: req.body ?? {} }));
    } catch (err) {
      if (err instanceof WriteError) return res.status(err.status).json({ error: err.message });
      // Bitrix rejected the write — report it; the row must stay in the list (FR-7).
      if (err.code) return res.status(502).json({ error: `Bitrix24 rejected the update: ${err.message}` });
      next(err);
    }
  }];
  r.patch('/deals/:id', ...write(updateDeal));
  r.patch('/leads/:id', ...write(updateLead));
  r.post('/deals/:id/customer', ...write(applyDealCustomer));

  r.post('/sync', auth.requireAdmin, async (req, res) => {
    await sync.syncNow();
    res.json(sync.status());
  });

  r.get('/admin/stage-probabilities', auth.requireAdmin, (req, res) => res.json(sync.mapping.stageProbabilities));
  r.put('/admin/stage-probabilities', auth.requireAdmin, json, (req, res) => {
    const { byStageId = {}, byBucket = {} } = req.body ?? {};
    const valid = (o) => typeof o === 'object' && Object.values(o).every((v) => typeof v === 'number' && v >= 0 && v <= 1);
    if (!valid(byStageId) || !valid(byBucket)) return res.status(400).json({ error: 'Probabilities must be numbers between 0 and 1' });
    const mapping = loadMapping();
    mapping.stageProbabilities = { ...mapping.stageProbabilities, byStageId, byBucket };
    saveMapping(mapping);
    sync.reloadMapping();
    res.json(mapping.stageProbabilities);
  });

  // Saves one mapping choice to config/mapping.json (local only — no Bitrix24 write).
  r.put('/admin/mapping', auth.requireAdmin, ready, json, (req, res) => {
    const { kind, id, value = null } = req.body ?? {};
    let result;
    try {
      result = applyMappingChange(loadMapping(), sync.model, { kind, id, value });
    } catch (err) {
      if (err instanceof MappingError) return res.status(400).json({ error: err.message });
      throw err;
    }
    saveMapping(result.mapping);
    sync.reloadMapping();
    writeAudit({ user: req.user.name, entity: 'mapping', id: `${kind}:${id}`, old: result.old, new: value });
    res.json(computeMappingIssues(sync.model, sync.mapping));
  });

  r.get('/admin/audit', auth.requireAdmin, (req, res) => res.json(readAudit()));

  return r;
}
