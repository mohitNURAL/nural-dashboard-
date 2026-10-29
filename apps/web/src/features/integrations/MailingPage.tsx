// Integration › Mailing (SRS 19, admins): performance reports by mail and Slack. Each report says
// when it runs (daily, weekly, monthly, or when performance is very poor or very good), who gets
// it (by role and by name; each gets their own scope), what it holds (topics and questions) and how
// it is sent (mail with CC, Slack direct message, Slack channels). New reports start in Preview:
// only admins get them until someone switches them to Live.
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { useMe } from '../../api/me';
import { API_KEY } from '../../api/queries';
import { Card } from '../../components/Card';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import { confirm } from '../../components/ui/ConfirmDialog';
import { IconClose, IconMail } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { Tip } from '../../components/ui/Tip';
import { useEmployees } from '../employees/api';
import { timeAgo } from '../employees/labels';
import {
  emptyDefinition,
  ROLE_TEXT,
  useCatalogue,
  useReports,
  useSlackChannels,
  useStatus,
  type AudienceRole,
  type Definition,
  type Report,
  type ReportState,
} from './api';
import { Select } from '../../components/ui/Select';
import { SearchInput } from '../../components/ui/SearchInput';

const STATE: Record<ReportState, { label: string; cls: string }> = {
  preview: { label: 'Preview: admins only', cls: 'bg-warn/15 text-warn' },
  live: { label: 'Live', cls: 'bg-good/15 text-good' },
  paused: { label: 'Paused', cls: 'bg-border/50 text-text-muted' },
};

const input =
  'h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-text focus:border-primary focus:outline-none';

export function MailingPage() {
  const { data, isLoading } = useReports();
  const { data: status } = useStatus();
  const reports = data?.reports ?? [];
  const [editing, setEditing] = useState<Report | 'new' | null>(null);
  const [previewing, setPreviewing] = useState<Report | null>(null);
  const count = (s: ReportState) => reports.filter((r) => r.state === s).length;

  return (
    <div className="space-y-4">
      <PageHead
        title="Mailing"
        sub="Performance reports by mail and Slack: when, to whom, what and how"
        icon={<IconMail size={24} />}
      >
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="btn btn-page h-10 px-4"
          data-tour="mailing-new"
        >
          + New report
        </button>
      </PageHead>

      {status && (!status.mail.connected || !status.slack.connected) && (
        <div className="rounded-card border border-warn/40 bg-warn/10 px-4 py-3 text-table text-text">
          {!status.mail.connected &&
            'Microsoft 365 is not connected, so mails are logged but not sent. '}
          {!status.slack.connected &&
            'Slack is not connected, so Slack messages are logged but not posted. '}
          See Integration › Connections.
        </div>
      )}

      <SortableGroup
        group="mailing.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          {
            id: 'reports',
            node: (
              <StatTile
                label="Reports"
                info="All reports."
                value={isLoading ? undefined : reports.length}
                sub="Designed here"
              />
            ),
          },
          {
            id: 'live',
            node: (
              <StatTile
                label="Live"
                info="Sent to their recipients on schedule."
                value={isLoading ? undefined : count('live')}
                sub="Going out"
              />
            ),
          },
          {
            id: 'preview',
            node: (
              <StatTile
                label="In preview"
                info="Sent only to admins until switched to Live."
                value={isLoading ? undefined : count('preview')}
                sub="Admins only"
              />
            ),
          },
          {
            id: 'paused',
            node: (
              <StatTile
                label="Paused"
                info="Not sent."
                value={isLoading ? undefined : count('paused')}
                sub="Not sent"
              />
            ),
          },
        ]}
      />

      <div data-tour="mailing-list">
        {!isLoading && !reports.length ? (
          <Card title="No reports yet">
            <p className="text-text-muted">
              Create one with <b>+ New report</b>: for example a daily update to every member at
              18:30, or a weekly team report to team leads on Monday morning.
            </p>
          </Card>
        ) : (
          <SortableGroup
            group="mailing.cards"
            noun="card"
            className="grid grid-cols-1 gap-4 xl:grid-cols-12"
            items={reports.map((r) => ({
              id: String(r.id),
              className: 'xl:col-span-6',
              node: (
                <ReportCard r={r} onEdit={() => setEditing(r)} onPreview={() => setPreviewing(r)} />
              ),
            }))}
          />
        )}
      </div>

      {editing && (
        <Editor report={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {previewing && <PreviewDialog report={previewing} onClose={() => setPreviewing(null)} />}
    </div>
  );
}

function ReportCard({
  r,
  onEdit,
  onPreview,
}: {
  r: Report;
  onEdit: () => void;
  onPreview: () => void;
}) {
  const qc = useQueryClient();
  const { data: cat } = useCatalogue();
  const refresh = () => void qc.invalidateQueries({ queryKey: [API_KEY] });
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error('Not done', { description: e instanceof Error ? e.message : '' });
    }
  };
  const d = r.definition;
  const topicLabel = (k: string) => cat?.topics.find((t) => t.key === k)?.label ?? k;
  const sent = r.lastRuns.filter((x) => x.status === 'sent' || x.status === 'test').length;
  const btn = 'btn btn-stroke px-2.5 py-1';
  return (
    <Card
      title={r.name}
      info={r.schedule}
      action={
        <span
          className={clsx(
            'rounded-full px-2.5 py-0.5 font-heading text-label font-bold uppercase',
            STATE[r.state].cls,
          )}
        >
          {STATE[r.state].label}
        </span>
      }
    >
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-table">
        <dt className="text-text-muted">When</dt>
        <dd>{r.schedule}</dd>
        <dt className="text-text-muted">Who</dt>
        <dd>
          {[
            ...d.audience.roles.map((x) => ROLE_TEXT[x]),
            d.audience.users.length ? `${d.audience.users.length} named people` : null,
          ]
            .filter(Boolean)
            .join(', ') || 'Channels only'}
        </dd>
        <dt className="text-text-muted">What</dt>
        <dd className="flex flex-wrap gap-1">
          {d.topics.map((t) => (
            <span
              key={t}
              className="rounded-md bg-primary/10 px-1.5 py-0.5 font-heading text-label font-bold text-primary"
            >
              {topicLabel(t)}
            </span>
          ))}
          {d.prompts.length > 0 && (
            <span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-heading text-label font-bold text-accent">
              {d.prompts.length} question{d.prompts.length > 1 ? 's' : ''}
            </span>
          )}
        </dd>
        <dt className="text-text-muted">How</dt>
        <dd>
          {[
            d.delivery.mail &&
              `Mail${d.delivery.cc.length ? ` (CC ${d.delivery.cc.join(', ')})` : ''}`,
            d.delivery.slackDm && 'Slack message',
            ...d.delivery.slackChannels.map((c) => `Slack ${c.startsWith('#') ? c : `#${c}`}`),
          ]
            .filter(Boolean)
            .join(' · ')}
        </dd>
        <dt className="text-text-muted">Last runs</dt>
        <dd>
          {r.lastRuns.length ? (
            <span>
              {sent} sent of the last {r.lastRuns.length} · {timeAgo(r.lastRuns[0]!.at)}
              {r.lastRuns.some((x) => x.status === 'failed') && (
                <span className="text-bad"> · failures</span>
              )}
              {r.lastRuns[0]!.error && (
                <span className="block text-text-muted">{r.lastRuns[0]!.error}</span>
              )}
            </span>
          ) : (
            <span className="text-text-muted">Not run yet</span>
          )}
        </dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <button type="button" className={btn} onClick={onEdit}>
          Edit
        </button>
        <button type="button" className={btn} onClick={onPreview}>
          Preview
        </button>
        <Tip label="Send a test now" hint="To you only, by the report's channels">
          <button
            type="button"
            className={btn}
            onClick={() =>
              void act(() => apiPost(`/api/reports/${r.id}/test`, {}), 'Test sent to you')
            }
          >
            Send test
          </button>
        </Tip>
        {r.state !== 'live' && (
          <Tip label="Go live" hint="Sent to every recipient on schedule">
            <button
              type="button"
              className="btn btn-card px-2.5 py-1"
              onClick={() =>
                void act(
                  () => apiPost(`/api/reports/${r.id}/state`, { state: 'live' }),
                  `${r.name} is live`,
                )
              }
            >
              Go live
            </button>
          </Tip>
        )}
        {r.state === 'live' && (
          <button
            type="button"
            className={btn}
            onClick={() =>
              void act(
                () => apiPost(`/api/reports/${r.id}/state`, { state: 'preview' }),
                'Back to preview: admins only',
              )
            }
          >
            Back to preview
          </button>
        )}
        {r.state !== 'paused' ? (
          <button
            type="button"
            className={btn}
            onClick={() =>
              void act(() => apiPost(`/api/reports/${r.id}/state`, { state: 'paused' }), 'Paused')
            }
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            className={btn}
            onClick={() =>
              void act(
                () => apiPost(`/api/reports/${r.id}/state`, { state: 'preview' }),
                'Resumed in preview',
              )
            }
          >
            Resume
          </button>
        )}
        <button
          type="button"
          className="btn btn-link ml-auto px-2.5 py-1 text-bad"
          onClick={async () => {
            const ok = await confirm({
              title: `Delete "${r.name}"?`,
              message: 'Its schedule stops and nobody gets it any more. Its run log is kept.',
              confirmLabel: 'Delete report',
              tone: 'bad',
            });
            if (ok) void act(() => apiPost(`/api/reports/${r.id}`, {}, 'DELETE'), 'Deleted');
          }}
        >
          Delete
        </button>
      </div>
    </Card>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="font-heading text-h3 text-primary-dark">{title}</legend>
      {hint && <p className="text-table text-text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Chips({ values, onRemove }: { values: string[]; onRemove: (v: string) => void }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full bg-primary-soft-100 px-2.5 py-0.5 text-table"
        >
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onRemove(v)}
            className="text-text-muted hover:text-bad"
          >
            <IconClose size={12} />
          </button>
        </span>
      ))}
    </span>
  );
}

function AddLine({
  placeholder,
  onAdd,
  list,
}: {
  placeholder: string;
  onAdd: (v: string) => void;
  list?: string;
}) {
  const [v, setV] = useState('');
  const add = () => {
    if (v.trim()) onAdd(v.trim());
    setV('');
  };
  return (
    <span className="flex gap-2">
      <input
        value={v}
        list={list}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        placeholder={placeholder}
        className={input}
      />
      <button type="button" onClick={add} className="btn btn-stroke px-3">
        Add
      </button>
    </span>
  );
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function Editor({ report, onClose }: { report: Report | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: cat } = useCatalogue();
  const { data: status } = useStatus();
  const { data: people } = useEmployees();
  const { data: channels } = useSlackChannels(!!status?.slack.connected);
  const [name, setName] = useState(report?.name ?? 'Daily update');
  const [d, setD] = useState<Definition>(() =>
    structuredClone(report?.definition ?? emptyDefinition()),
  );
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Definition>(k: K, v: Definition[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  const metric = cat?.metrics.find((m) => m.key === d.condition?.metric);
  const active = useMemo(() => (people?.rows ?? []).filter((p) => p.active), [people]);
  const found = active
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 40);
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  const save = async () => {
    setBusy(true);
    try {
      if (report) await apiPost(`/api/reports/${report.id}`, { name, definition: d }, 'PUT');
      else await apiPost('/api/reports', { name, definition: d });
      toast.success(report ? 'Report saved' : 'Report created in preview', {
        description: report ? undefined : 'Only admins get it until you switch it to Live.',
      });
      void qc.invalidateQueries({ queryKey: [API_KEY] });
      onClose();
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  const kinds: { k: Definition['schedule']['kind']; label: string }[] = [
    { k: 'daily', label: 'Daily' },
    { k: 'weekly', label: 'Weekly' },
    { k: 'monthly', label: 'Monthly' },
    { k: 'conditional', label: 'When performance is…' },
  ];

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overlay" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(760px,94vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="font-heading text-h1 text-primary-dark">
              {report ? 'Edit report' : 'New report'}
            </Dialog.Title>
            <Dialog.Close
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
              aria-label="Close"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <Section title="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </Section>

            <Section
              title="When"
              hint="Times are IST. Morning reports (before 12:00) cover the day, week or month before; later ones the current one."
            >
              <div className="flex flex-wrap gap-1 rounded-control bg-primary-soft-100 p-1">
                {kinds.map(({ k, label }) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      set('schedule', { ...d.schedule, kind: k });
                      if (k === 'conditional' && !d.condition && cat)
                        set('condition', {
                          metric: cat.metrics[0]!.key,
                          when: 'poor',
                          threshold: cat.metrics[0]!.poor,
                        });
                    }}
                    className={clsx(
                      'rounded px-3 py-1.5 font-heading text-button',
                      d.schedule.kind === k
                        ? 'bg-surface text-primary shadow-sm'
                        : 'text-text-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-table">
                  At{' '}
                  <input
                    type="time"
                    value={d.schedule.time}
                    onChange={(e) => set('schedule', { ...d.schedule, time: e.target.value })}
                    className={clsx(input, 'w-32')}
                  />
                </label>
                {d.schedule.kind === 'weekly' && (
                  <Select
                    value={d.schedule.weekday}
                    onChange={(e) =>
                      set('schedule', { ...d.schedule, weekday: Number(e.target.value) })
                    }
                    className="w-40"
                  >
                    {WEEKDAYS.map((w, i) => (
                      <option key={w} value={i + 1}>
                        {w}
                      </option>
                    ))}
                  </Select>
                )}
                {d.schedule.kind === 'monthly' && (
                  <Select
                    value={d.schedule.monthDay}
                    onChange={(e) =>
                      set('schedule', { ...d.schedule, monthDay: Number(e.target.value) })
                    }
                    className="w-40"
                  >
                    {Array.from({ length: 28 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Day {i + 1}
                      </option>
                    ))}
                  </Select>
                )}
                {(d.schedule.kind === 'daily' || d.schedule.kind === 'conditional') && (
                  <label className="flex items-center gap-2 text-table">
                    <input
                      type="checkbox"
                      checked={d.schedule.workingDaysOnly}
                      onChange={(e) =>
                        set('schedule', { ...d.schedule, workingDaysOnly: e.target.checked })
                      }
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    Working days only
                  </label>
                )}
              </div>
              {d.schedule.kind === 'conditional' && d.condition && cat && (
                <div className="grid grid-cols-1 gap-2 rounded-card border border-border p-3 sm:grid-cols-3">
                  <Select
                    className="w-full"
                    value={d.condition.metric}
                    onChange={(e) => {
                      const m = cat.metrics.find((x) => x.key === e.target.value)!;
                      set('condition', {
                        metric: m.key,
                        when: d.condition!.when,
                        threshold: d.condition!.when === 'poor' ? m.poor : m.good,
                      });
                    }}
                  >
                    {cat.metrics.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="w-full"
                    value={d.condition.when}
                    onChange={(e) => {
                      const when = e.target.value as 'poor' | 'good';
                      set('condition', {
                        ...d.condition!,
                        when,
                        threshold: when === 'poor' ? metric!.poor : metric!.good,
                      });
                    }}
                  >
                    <option value="poor">is very poor</option>
                    <option value="good">is very good</option>
                  </Select>
                  <label className="flex items-center gap-2 text-table">
                    {metric?.higherIsBetter === (d.condition.when === 'good')
                      ? 'at least'
                      : 'beyond'}
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={d.condition.threshold}
                      onChange={(e) =>
                        set('condition', { ...d.condition!, threshold: Number(e.target.value) })
                      }
                      className={clsx(input, 'w-24')}
                    />{' '}
                    %
                  </label>
                  <p className="text-table text-text-muted sm:col-span-3">
                    Checked every day at the time above for each recipient, on their own numbers;
                    sent at most once a week to each person who meets it.
                  </p>
                </div>
              )}
            </Section>

            <Section
              title="Who"
              hint="Each person gets their own part: team leads their team and projects, product owners their projects, members their own tasks, admins the company."
            >
              <div className="flex flex-wrap gap-2">
                {(cat?.roles ?? []).map((role) => (
                  <label
                    key={role}
                    className={clsx(
                      'flex cursor-pointer items-center gap-2 rounded-control border px-3 py-1.5 text-table',
                      d.audience.roles.includes(role)
                        ? 'border-primary bg-primary-soft-100'
                        : 'border-border',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={d.audience.roles.includes(role)}
                      onChange={() =>
                        set('audience', {
                          ...d.audience,
                          roles: toggle(d.audience.roles, role as AudienceRole),
                        })
                      }
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    {ROLE_TEXT[role]}
                  </label>
                ))}
              </div>
              <SearchInput value={q} onChange={setQ} size="sm" placeholder="Add people by name" />
              <div className="max-h-40 overflow-y-auto rounded-control border border-border p-1">
                {found.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-table hover:bg-primary-soft-100"
                  >
                    <input
                      type="checkbox"
                      checked={d.audience.users.includes(p.id)}
                      onChange={() =>
                        set('audience', { ...d.audience, users: toggle(d.audience.users, p.id) })
                      }
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    {p.name}
                    <span className="text-text-muted">{p.position ?? ''}</span>
                  </label>
                ))}
              </div>
              {d.audience.users.length > 0 && (
                <p className="text-table text-text-muted">
                  {d.audience.users.length} named:{' '}
                  {d.audience.users
                    .map((u) => active.find((p) => p.id === u)?.name ?? u)
                    .join(', ')}
                </p>
              )}
            </Section>

            <Section
              title="What"
              hint="The blocks of the report, in this order, and questions for the reader."
            >
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(cat?.topics ?? []).map((t) => (
                  <label
                    key={t.key}
                    className={clsx(
                      'flex cursor-pointer items-start gap-2 rounded-control border px-3 py-2',
                      d.topics.includes(t.key)
                        ? 'border-primary bg-primary-soft-100'
                        : 'border-border',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={d.topics.includes(t.key)}
                      onChange={() => set('topics', toggle(d.topics, t.key))}
                      className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                    />
                    <span>
                      <span className="block font-heading text-button text-primary-dark">
                        {t.label}
                      </span>
                      <span className="block text-table text-text-muted">{t.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="pt-1 font-heading text-label uppercase text-text-muted">
                Suggested questions (click to add)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(cat?.prompts ?? [])
                  .filter((p) => !d.prompts.includes(p))
                  .map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set('prompts', [...d.prompts, p])}
                      className="rounded-full border border-dashed border-accent px-2.5 py-0.5 text-table text-accent hover:bg-accent/10"
                    >
                      + {p}
                    </button>
                  ))}
              </div>
              <Chips
                values={d.prompts}
                onRemove={(v) =>
                  set(
                    'prompts',
                    d.prompts.filter((x) => x !== v),
                  )
                }
              />
              <AddLine
                placeholder="Your own question, e.g. What will you finish before Friday?"
                onAdd={(v) => set('prompts', [...new Set([...d.prompts, v])].slice(0, 10))}
              />
            </Section>

            <Section title="How">
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5 text-table">
                  <input
                    type="checkbox"
                    checked={d.delivery.mail}
                    onChange={(e) => set('delivery', { ...d.delivery, mail: e.target.checked })}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  Mail to each person{' '}
                  {!status?.mail.connected && (
                    <span className="text-text-muted">(not connected)</span>
                  )}
                </label>
                <label className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5 text-table">
                  <input
                    type="checkbox"
                    checked={d.delivery.slackDm}
                    onChange={(e) => set('delivery', { ...d.delivery, slackDm: e.target.checked })}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  Slack message to each person{' '}
                  {!status?.slack.connected && (
                    <span className="text-text-muted">(not connected)</span>
                  )}
                </label>
              </div>
              <p className="pt-1 text-table text-text-muted">
                Slack channels or groups (one copy each, with the company view):
              </p>
              <Chips
                values={d.delivery.slackChannels}
                onRemove={(v) =>
                  set('delivery', {
                    ...d.delivery,
                    slackChannels: d.delivery.slackChannels.filter((x) => x !== v),
                  })
                }
              />
              <AddLine
                placeholder="#channel or channel ID"
                list="slack-channels"
                onAdd={(v) =>
                  set('delivery', {
                    ...d.delivery,
                    slackChannels: [...new Set([...d.delivery.slackChannels, v])],
                  })
                }
              />
              <datalist id="slack-channels">
                {channels?.channels.map((c) => (
                  <option key={c.id} value={`#${c.name}`} />
                ))}
              </datalist>
              <p className="pt-1 text-table text-text-muted">CC on every mail:</p>
              <Chips
                values={d.delivery.cc}
                onRemove={(v) =>
                  set('delivery', { ...d.delivery, cc: d.delivery.cc.filter((x) => x !== v) })
                }
              />
              <AddLine
                placeholder="name@nural.in"
                onAdd={(v) =>
                  set('delivery', { ...d.delivery, cc: [...new Set([...d.delivery.cc, v])] })
                }
              />
            </Section>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <span className="text-table text-text-muted">
              {report
                ? 'Changes apply from the next run.'
                : 'New reports start in Preview: admins only.'}
            </span>
            <span className="flex gap-2">
              <Dialog.Close className="btn btn-stroke px-4 py-2">Cancel</Dialog.Close>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="btn btn-card px-4 py-2 disabled:opacity-50"
              >
                {busy ? 'Saving…' : report ? 'Save' : 'Create'}
              </button>
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PreviewDialog({ report, onClose }: { report: Report; onClose: () => void }) {
  const { data: me } = useMe();
  const { data: people } = useEmployees();
  const [userId, setUserId] = useState<number>(report.definition.audience.users[0] ?? me?.id ?? 0);
  const [out, setOut] = useState<{
    html: string;
    subject: string;
    slack: { text: string };
    tasks: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (id: number) => {
    setUserId(id);
    setBusy(true);
    try {
      setOut(await apiPost(`/api/reports/${report.id}/render`, { userId: id }));
    } catch (e) {
      toast.error('No preview', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overlay" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(820px,94vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <Dialog.Title className="font-heading text-h1 text-primary-dark">
              Preview: {report.name}
            </Dialog.Title>
            <Select
              value={userId}
              onChange={(e) => void load(Number(e.target.value))}
              className="ml-auto w-64"
              aria-label="As received by"
            >
              <option value={0} disabled>
                As received by…
              </option>
              {(people?.rows ?? [])
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
            <Dialog.Close
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
              aria-label="Close"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-hidden bg-[#eef1f8]">
            {out ? (
              <iframe
                title="Report preview"
                srcDoc={out.html}
                sandbox=""
                className="h-full w-full"
              />
            ) : (
              <p className="p-6 text-text-muted">
                {busy
                  ? 'Building…'
                  : 'Choose a person: the report is built as they would get it, from their own scope. Nothing is sent.'}
              </p>
            )}
          </div>
          {out && (
            <p className="border-t border-border px-5 py-2 text-table text-text-muted">
              Subject: {out.subject} · built from {out.tasks} tasks in their scope · nothing was
              sent
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
