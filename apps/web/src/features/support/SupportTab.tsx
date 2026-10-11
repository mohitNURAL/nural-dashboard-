// Support tab (2026-10-11): coming soon. First it asks the support team and management what they
// need, so the tab is built from their answers. Everyone here sees their own entries; admins see
// and the head of Tech Support see every entry in the feedback inbox.
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { useMe } from '../../api/me';
import { API_KEY, useApi } from '../../api/queries';
import { Card } from '../../components/Card';
import { fmtDateTime } from '../dev/format';

const TOPICS = [
  { value: 'supportTab', label: 'What the Support tab should show' },
  { value: 'dashboard', label: 'An idea for the dashboard' },
  { value: 'problem', label: 'Something is not working' },
  { value: 'other', label: 'Something else' },
] as const;

const NEEDS = [
  { value: 'openByProject', label: 'Open tickets by project / client' },
  { value: 'ageing', label: 'Ticket ageing and SLA breaches' },
  { value: 'firstResponse', label: 'First response time' },
  { value: 'resolutionTime', label: 'Time to resolve' },
  { value: 'byClient', label: 'Volume per client' },
  { value: 'byPerson', label: 'Tickets per support person' },
  { value: 'reopened', label: 'Reopened tickets' },
  { value: 'escalated', label: 'Tickets escalated to development' },
  { value: 'trend', label: 'Daily / weekly trend' },
  { value: 'workload', label: 'Team workload' },
  { value: 'alerts', label: 'Alerts (stuck, overdue)' },
  { value: 'export', label: 'Excel export for reports' },
] as const;

const FREQUENCY = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly-several', label: 'A few times a week' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

const PRIORITY = [
  { value: 'must', label: 'Must have', cls: 'border-bad text-bad' },
  { value: 'should', label: 'Should have', cls: 'border-warn text-warn' },
  { value: 'nice', label: 'Nice to have', cls: 'border-good text-good' },
] as const;

type Topic = (typeof TOPICS)[number]['value'];
type Need = (typeof NEEDS)[number]['value'];

interface Entry {
  id: number;
  at: string;
  name: string;
  role: string;
  dept: string;
  topic: Topic;
  needs: Need[];
  frequency?: string;
  problem: string;
  manualReports?: string;
  decision?: string;
  priority: 'must' | 'should' | 'nice';
  rating?: number;
  details?: string;
  status: 'new' | 'reviewed';
  adminNote: string | null;
}

const label = <T extends { value: string; label: string }>(list: readonly T[], v?: string) =>
  list.find((x) => x.value === v)?.label ?? v ?? '—';

export function SupportTab() {
  const { data: me } = useMe();
  return (
    <div className="space-y-4">
      <ComingSoon />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <FeedbackForm className="xl:col-span-7" />
        <MyEntries className="xl:col-span-5" />
      </div>
      {me?.inbox && <Inbox />}
    </div>
  );
}

function ComingSoon() {
  return (
    <section className="relative overflow-hidden rounded-card border border-border bg-surface p-6 lg:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/15 blur-2xl"
      />
      <span className="inline-block rounded-full bg-accent-soft px-3 py-1 font-heading text-label font-bold uppercase tracking-wide text-accent-darker">
        Coming soon
      </span>
      <h2 className="mt-3 font-heading text-title text-primary-dark">The Support tab</h2>
      <blockquote className="mt-3 max-w-3xl border-l-4 border-accent pl-4 text-h3 font-normal italic text-text">
        “Great support is built by listening first. Tell us what slows you down, and we will build
        the tab that speeds you up.”
      </blockquote>
      <p className="mt-3 max-w-3xl text-text-muted">
        This tab is being designed with you. Share what you track every day, the reports you make by
        hand, and the numbers you wish you had. Every answer is read by the dashboard team and
        shapes what comes next.
      </p>
    </section>
  );
}

function Field({
  label: text,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block font-heading text-button text-primary-dark">{text}</span>
      {hint && <span className="block text-table text-text-muted">{hint}</span>}
      {children}
    </label>
  );
}

const input =
  'w-full rounded-control border border-border bg-surface px-3 py-2 text-body text-text focus:border-primary focus:outline-none';

function FeedbackForm({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState<Topic>('supportTab');
  const [needs, setNeeds] = useState<Need[]>([]);
  const [frequency, setFrequency] = useState('');
  const [problem, setProblem] = useState('');
  const [manualReports, setManualReports] = useState('');
  const [decision, setDecision] = useState('');
  const [priority, setPriority] = useState<'must' | 'should' | 'nice'>('should');
  const [rating, setRating] = useState(0);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setNeeds([]);
    setFrequency('');
    setProblem('');
    setManualReports('');
    setDecision('');
    setPriority('should');
    setRating(0);
    setDetails('');
  };

  const submit = async () => {
    if (problem.trim().length < 10) {
      toast.error('Tell us a little more about the problem (at least 10 characters).');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/api/feedback', {
        topic,
        needs,
        ...(frequency && { frequency }),
        problem,
        ...(manualReports.trim() && { manualReports }),
        ...(decision.trim() && { decision }),
        priority,
        ...(rating && { rating }),
        ...(details.trim() && { details }),
      });
      toast.success('Thank you! Your feedback was sent.', {
        description: 'You can see it under "My feedback".',
      });
      reset();
      void queryClient.invalidateQueries({ queryKey: [API_KEY, '/api/feedback/mine'] });
      void queryClient.invalidateQueries({ queryKey: [API_KEY, '/api/feedback'] });
    } catch (e) {
      toast.error('Not sent', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Card title="Share your needs">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="What is it about?">
            <select
              className={input}
              value={topic}
              onChange={(e) => setTopic(e.target.value as Topic)}
            >
              {TOPICS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <fieldset className="space-y-2">
            <legend className="font-heading text-button text-primary-dark">
              What should the Support tab show you?
            </legend>
            <span className="block text-table text-text-muted">Tick all that would help.</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {NEEDS.map((n) => {
                const on = needs.includes(n.value);
                return (
                  <label
                    key={n.value}
                    className={clsx(
                      'flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2',
                      on
                        ? 'border-primary bg-primary-soft-100'
                        : 'border-border hover:border-primary-soft-300',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--primary)]"
                      checked={on}
                      onChange={(e) =>
                        setNeeds((prev) =>
                          e.target.checked ? [...prev, n.value] : prev.filter((x) => x !== n.value),
                        )
                      }
                    />
                    {n.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Field label="How often would you use it?">
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {FREQUENCY.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={frequency === f.value}
                  onClick={() => setFrequency(frequency === f.value ? '' : f.value)}
                  className={clsx(
                    'rounded-full border px-3 py-1 font-heading text-button',
                    frequency === f.value
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-text hover:border-primary',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Your biggest problem today"
            hint="What takes the most time or goes wrong most often? (required)"
          >
            <textarea
              className={clsx(input, 'min-h-24')}
              value={problem}
              maxLength={4000}
              onChange={(e) => setProblem(e.target.value)}
              required
            />
          </Field>

          <Field
            label="Reports you make by hand"
            hint="Which Excel sheets or counts do you put together yourself, and how often?"
          >
            <textarea
              className={clsx(input, 'min-h-20')}
              value={manualReports}
              maxLength={4000}
              onChange={(e) => setManualReports(e.target.value)}
            />
          </Field>

          <Field
            label="What decision would this help you make?"
            hint="For management: what would you decide faster with the right numbers?"
          >
            <textarea
              className={clsx(input, 'min-h-20')}
              value={decision}
              maxLength={4000}
              onChange={(e) => setDecision(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="How important is it?">
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {PRIORITY.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={priority === p.value}
                    onClick={() => setPriority(p.value)}
                    className={clsx(
                      'rounded-full border px-3 py-1 font-heading text-button',
                      priority === p.value
                        ? clsx(p.cls, 'bg-primary-soft-100')
                        : 'border-border text-text-muted',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="How useful is the dashboard so far?">
              <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} of 5`}
                    onClick={() => setRating(rating === n ? 0 : n)}
                    className={clsx(
                      'text-title leading-none',
                      n <= rating ? 'text-warn' : 'text-border hover:text-warn/60',
                    )}
                  >
                    ★
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Anything else?">
            <textarea
              className={clsx(input, 'min-h-16')}
              value={details}
              maxLength={4000}
              onChange={(e) => setDetails(e.target.value)}
            />
          </Field>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-table text-text-muted">
              Only the dashboard admins and the Support lead read the answers.
            </span>
            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-control bg-primary px-5 font-heading text-button text-white hover:brightness-110 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send feedback'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function MyEntries({ className }: { className?: string }) {
  const { data, isLoading } = useApi<{ rows: Entry[] }>('/api/feedback/mine', {});
  return (
    <div className={className}>
      <Card
        title="My feedback"
        loading={isLoading}
        empty={!!data && !data.rows.length}
        emptyText="Nothing sent yet. Your answers will show here."
      >
        <ul className="space-y-3">
          {data?.rows.map((r) => (
            <li key={r.id} className="rounded-card border border-border p-3">
              <div className="flex items-center justify-between gap-2 text-table text-text-muted">
                <span>{fmtDateTime(r.at)}</span>
                <StatusPill status={r.status} />
              </div>
              <p className="mt-1 font-heading text-button text-primary-dark">
                {label(TOPICS, r.topic)}
              </p>
              <p className="mt-1 line-clamp-3 text-body">{r.problem}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const StatusPill = ({ status }: { status: 'new' | 'reviewed' }) => (
  <span
    className={clsx(
      'rounded-full px-2 py-0.5 font-heading text-label font-bold uppercase',
      status === 'reviewed'
        ? 'bg-accent-soft text-accent-darker'
        : 'bg-primary-soft-100 text-primary',
    )}
  >
    {status === 'reviewed' ? 'Reviewed' : 'New'}
  </span>
);

/** Admins and the Support lead only: every entry, with review status and a private note. */
function Inbox() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useApi<{
    rows: Entry[];
    counts: { total: number; new: number; mustHave: number };
  }>('/api/feedback', {});
  const [show, setShow] = useState<'all' | 'new' | 'must'>('new');
  const [open, setOpen] = useState<number | null>(null);
  const rows = (data?.rows ?? []).filter((r) =>
    show === 'new' ? r.status === 'new' : show === 'must' ? r.priority === 'must' : true,
  );

  const review = async (id: number, patch: { status?: 'new' | 'reviewed'; adminNote?: string }) => {
    try {
      await apiPost(`/api/feedback/${id}/review`, patch);
      void queryClient.invalidateQueries({ queryKey: [API_KEY, '/api/feedback'] });
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    }
  };

  return (
    <Card
      title="Feedback inbox (admins and Support lead)"
      loading={isLoading}
      action={
        <span className="flex items-center gap-2">
          {(['new', 'must', 'all'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setShow(k)}
              className={clsx(
                'rounded-full px-3 py-1 font-heading text-button',
                show === k ? 'bg-primary text-white' : 'bg-primary-soft-100 text-primary-dark',
              )}
            >
              {k === 'new'
                ? `New ${data?.counts.new ?? ''}`
                : k === 'must'
                  ? `Must have ${data?.counts.mustHave ?? ''}`
                  : `All ${data?.counts.total ?? ''}`}
            </button>
          ))}
          <a
            href="/api/feedback/export"
            download
            className="rounded-control border border-border px-3 py-1 font-heading text-button text-primary hover:border-primary"
          >
            Excel
          </a>
        </span>
      }
      empty={!!data && !rows.length}
      emptyText="Nothing here yet."
    >
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="py-3">
            <button
              type="button"
              onClick={() => setOpen(open === r.id ? null : r.id)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
            >
              <StatusPill status={r.status} />
              <span className="font-heading text-button text-primary-dark">{r.name}</span>
              <span className="text-table text-text-muted">
                {r.role} · {r.dept} · {fmtDateTime(r.at)}
              </span>
              <span
                className={clsx(
                  'ml-auto font-heading text-label font-bold uppercase',
                  label(PRIORITY, r.priority) === 'Must have' ? 'text-bad' : 'text-text-muted',
                )}
              >
                {label(PRIORITY, r.priority)}
              </span>
              <span className="w-full truncate text-body">{r.problem}</span>
            </button>
            {open === r.id && (
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-card bg-primary-soft-100 p-4 text-body md:grid-cols-2">
                <Detail k="About" v={label(TOPICS, r.topic)} />
                <Detail k="How often" v={label(FREQUENCY, r.frequency)} />
                <Detail
                  k="Wants to see"
                  v={r.needs.length ? r.needs.map((n) => label(NEEDS, n)).join(' · ') : '—'}
                  wide
                />
                <Detail k="Biggest problem" v={r.problem} wide />
                <Detail k="Reports made by hand" v={r.manualReports ?? '—'} wide />
                <Detail k="Decision it would help" v={r.decision ?? '—'} wide />
                <Detail
                  k="Rating"
                  v={r.rating ? '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) : '—'}
                />
                <Detail k="Anything else" v={r.details ?? '—'} />
                <div className="space-y-2 md:col-span-2">
                  <textarea
                    className={clsx(input, 'min-h-16')}
                    placeholder="Admin note (only the inbox readers see it)"
                    defaultValue={r.adminNote ?? ''}
                    onBlur={(e) =>
                      e.target.value !== (r.adminNote ?? '') &&
                      void review(r.id, { adminNote: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void review(r.id, { status: r.status === 'new' ? 'reviewed' : 'new' })
                    }
                    className="rounded-control bg-primary px-4 py-1.5 font-heading text-button text-white hover:brightness-110"
                  >
                    {r.status === 'new' ? 'Mark reviewed' : 'Mark as new'}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const Detail = ({ k, v, wide }: { k: string; v: string; wide?: boolean }) => (
  <div className={clsx(wide && 'md:col-span-2')}>
    <span className="block font-heading text-label uppercase text-text-muted">{k}</span>
    <span className="whitespace-pre-wrap">{v}</span>
  </div>
);
