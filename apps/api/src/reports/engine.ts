// Runs a report (SRS 19): who gets it, what each of them gets, and the sends.
// - Recipients by role and by name; a conditional report only goes to those who meet its
//   condition (their own numbers).
// - Each recipient gets their own scope (scope.ts), never beyond their rights.
// - Preview: only admins get it, built as for the first intended recipient, with the list of
//   who it would go to. Live: every recipient. Test: only the admin who asked.
// - Every send is claimed first (no duplicates per period) and logged with its outcome.
import {
  buildReport,
  conditionMet,
  conditionValue,
  dayKey,
  isWorkingDay,
  periodBounds,
  type KpiContext,
  type ReportTopic,
} from '@nural/shared';
import type { RolesConfig } from '../auth/roles';
import type { Grants } from '../auth/rights';
import type { Dataset } from '../data/dataset';
import type { Mailer } from '../integrations/mail';
import type { Slack } from '../integrations/slack';
import { kpiContext } from '../routes/kpi';
import { backOf, periodOf, type Report } from './model';
import { renderEmail, renderSlack } from './render';
import { adminsOf, LEVEL_LABEL, recipientsOf, reportScope } from './scope';
import type { ReportStore, RunClaim } from './store';

export interface EngineDeps {
  dataset: () => Promise<Dataset>;
  roles: RolesConfig;
  grants: () => Grants;
  mailer: Mailer;
  slack: Slack;
  store: ReportStore;
  tz: string;
  now: () => Date;
  dashboardUrl: string;
  /** Pause between Slack calls (rate limit); 0 in tests. */
  slackPauseMs?: number;
}

export type RunMode = { kind: 'scheduled' } | { kind: 'test'; userId: number; sampleFor?: number };

export interface RunSummary {
  sent: number;
  failed: number;
  skipped: number;
  /** Who it went (or would go) to. */
  intended: number[];
  note?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The key that makes a run unique per period. */
export function periodKeyOf(report: Report, ctx: KpiContext): string {
  const k = report.definition.schedule.kind;
  if (k === 'monthly')
    return dayKey(periodBounds(ctx.now, 'month', ctx.cal).start, ctx.tz).slice(0, 7);
  // Weekly and conditional (at most once a week per person).
  if (k === 'weekly' || k === 'conditional')
    return `W${dayKey(periodBounds(ctx.now, 'week', ctx.cal).start, ctx.tz)}`;
  return dayKey(ctx.now, ctx.tz);
}

export async function runReport(
  report: Report,
  deps: EngineDeps,
  mode: RunMode,
): Promise<RunSummary> {
  const ds = await deps.dataset();
  const ctx = kpiContext(ds, deps.now(), deps.tz);
  const def = report.definition;
  const summary: RunSummary = { sent: 0, failed: 0, skipped: 0, intended: [] };
  if (mode.kind === 'scheduled') {
    if (report.state === 'paused') return { ...summary, note: 'paused' };
    const daily = def.schedule.kind === 'daily' || def.schedule.kind === 'conditional';
    const local = new Date(ctx.now.getTime() + ctx.cal.offsetMin * 60_000);
    const day = Math.floor(local.getTime() / 86_400_000);
    if (daily && def.schedule.workingDaysOnly && !isWorkingDay(day, ctx.cal)) {
      return { ...summary, note: 'not a working day' };
    }
  }
  const grants = deps.grants();
  const name = {
    project: (id: number) => ds.projects.get(id)?.name ?? 'No project',
    person: (id: number) => ds.users.get(id)?.name ?? `User ${id}`,
  };

  let intended = recipientsOf(def, ds, deps.roles, grants);
  if (def.schedule.kind === 'conditional' && def.condition) {
    const c = def.condition;
    intended = intended.filter((id) =>
      conditionMet(
        c.metric as never,
        c.when,
        c.threshold,
        conditionValue(reportScope(id, ds, deps.roles, grants).tasks, ctx, c.metric as never),
      ),
    );
  }
  summary.intended = intended;
  const preview = mode.kind === 'scheduled' && report.state === 'preview';
  const targets =
    mode.kind === 'test' ? [mode.userId] : preview ? adminsOf(ds, deps.roles, grants) : intended;
  if (mode.kind === 'scheduled' && !intended.length && !def.delivery.slackChannels.length) {
    return { ...summary, note: 'nobody to send to' };
  }
  const periodKey =
    mode.kind === 'test' ? `test-${ctx.now.toISOString()}` : periodKeyOf(report, ctx);

  const build = (forId: number | null) => {
    const scope = forId === null ? null : reportScope(forId, ds, deps.roles, grants);
    const data = buildReport({
      title: report.name,
      tasks: scope ? scope.tasks : ds.tasks,
      ctx,
      period: periodOf(def),
      back: backOf(def),
      topics: def.topics as ReportTopic[],
      prompts: def.prompts,
      name,
    });
    return { data, scopeLabel: LEVEL_LABEL[scope?.level ?? 'company'] };
  };

  async function send(
    claim: Omit<RunClaim, 'reportId' | 'periodKey' | 'preview'>,
    go: () => Promise<void>,
  ) {
    const id = await deps.store.claim({ ...claim, reportId: report.id, periodKey, preview });
    if (id === null) {
      summary.skipped++;
      return;
    }
    try {
      await go();
      await deps.store.finish(id, mode.kind === 'test' ? 'test' : 'sent');
      summary.sent++;
    } catch (e) {
      await deps.store.finish(id, 'failed', e instanceof Error ? e.message.slice(0, 500) : 'error');
      summary.failed++;
    }
  }
  const skip = async (claim: Omit<RunClaim, 'reportId' | 'periodKey' | 'preview'>, why: string) => {
    const id = await deps.store.claim({ ...claim, reportId: report.id, periodKey, preview });
    if (id !== null) await deps.store.finish(id, 'skipped', why);
    summary.skipped++;
  };

  const intendedNames = intended.map(name.person);
  for (const target of targets) {
    const user = ds.users.get(target);
    if (!user) continue;
    // Preview and test: built as for a real recipient (the first intended, or one chosen).
    const sample =
      mode.kind === 'test'
        ? (mode.sampleFor ?? target)
        : preview
          ? (intended[0] ?? target)
          : target;
    const { data, scopeLabel } = build(sample);
    const meta = {
      recipientName: name.person(sample),
      scopeLabel: sample === target ? scopeLabel : `${scopeLabel} (sample: ${name.person(sample)})`,
      preview: preview ? { intended: intendedNames } : undefined,
      test: mode.kind === 'test',
      dashboardUrl: deps.dashboardUrl,
    };
    const email = renderEmail(data, meta);
    if (def.delivery.mail) {
      const claim = {
        recipient: `user:${target}`,
        channel: 'mail' as const,
        subject: email.subject,
      };
      if (!deps.mailer.connected) await skip(claim, 'Microsoft 365 is not connected.');
      else if (!user.email) await skip(claim, 'No email in Bitrix24.');
      else
        await send(claim, () =>
          deps.mailer.send({
            to: [user.email!],
            cc: preview || mode.kind === 'test' ? [] : def.delivery.cc,
            subject: email.subject,
            html: email.html,
          }),
        );
    }
    if (def.delivery.slackDm) {
      const claim = {
        recipient: `user:${target}`,
        channel: 'slack' as const,
        subject: email.subject,
      };
      if (!deps.slack.connected) await skip(claim, 'Slack is not connected.');
      else if (!user.email) await skip(claim, 'No email in Bitrix24 to find them on Slack.');
      else {
        await send(claim, () => deps.slack.toPerson(user.email!, renderSlack(data, meta)));
        if (deps.slackPauseMs) await sleep(deps.slackPauseMs);
      }
    }
  }
  // Channels: one copy each, the company view; not in preview or test (admins only then).
  if (mode.kind === 'scheduled' && !preview) {
    const { data } = build(null);
    for (const channel of def.delivery.slackChannels) {
      const meta = {
        recipientName: channel,
        scopeLabel: LEVEL_LABEL.company,
        dashboardUrl: deps.dashboardUrl,
      };
      const claim = {
        recipient: `channel:${channel}`,
        channel: 'slack-channel' as const,
        subject: report.name,
      };
      if (!deps.slack.connected) await skip(claim, 'Slack is not connected.');
      else {
        await send(claim, () => deps.slack.toChannel(channel, renderSlack(data, meta)));
        if (deps.slackPauseMs) await sleep(deps.slackPauseMs);
      }
    }
  }
  return summary;
}

/** The report as one recipient would get it, without sending (the designer's preview). */
export async function renderFor(report: Report, deps: EngineDeps, userId: number) {
  const ds = await deps.dataset();
  const ctx = kpiContext(ds, deps.now(), deps.tz);
  const scope = reportScope(userId, ds, deps.roles, deps.grants());
  const name = {
    project: (id: number) => ds.projects.get(id)?.name ?? 'No project',
    person: (id: number) => ds.users.get(id)?.name ?? `User ${id}`,
  };
  const data = buildReport({
    title: report.name,
    tasks: scope.tasks,
    ctx,
    period: periodOf(report.definition),
    back: backOf(report.definition),
    topics: report.definition.topics as ReportTopic[],
    prompts: report.definition.prompts,
    name,
  });
  const meta = {
    recipientName: name.person(userId),
    scopeLabel: LEVEL_LABEL[scope.level],
    dashboardUrl: deps.dashboardUrl,
  };
  const email = renderEmail(data, meta);
  return {
    ...email,
    slack: renderSlack(data, meta),
    scope: scope.level,
    tasks: scope.tasks.length,
  };
}
