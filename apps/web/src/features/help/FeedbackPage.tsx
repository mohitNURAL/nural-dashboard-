// Help › Feedback (SRS 20): send an issue or idea with attachments, follow your own, and, with the
// Feedback inbox right (admins, PM and team leads by default), read everyone's, mark them
// reviewed with a note, open their attachments and export them to Excel.
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { useMe } from '../../api/me';
import { API_KEY } from '../../api/queries';
import { Card } from '../../components/Card';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import { IconExcel, IconFeedback } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { timeAgo } from '../employees/labels';
import { ABOUT_LABEL, IMPACT, kb, useFeedbackInbox, useMyFeedback, type HelpRow } from './api';
import { FeedbackForm } from './FeedbackForm';

export function FeedbackPage() {
  const { data: me } = useMe();
  const inboxOn = !!me?.helpInbox;
  const { data: mine } = useMyFeedback();
  const { data: inbox } = useFeedbackInbox(inboxOn);
  const rows = mine?.rows ?? [];
  const all = inbox?.rows ?? [];
  return (
    <div className="space-y-4">
      <PageHead
        title="Feedback"
        sub="An issue, an idea or a wish about the dashboard, a page, a project or a person"
        icon={<IconFeedback size={24} />}
      />
      <SortableGroup
        group="feedback.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          {
            id: 'sent',
            node: (
              <StatTile
                label="You sent"
                info="Feedback you sent."
                value={mine ? rows.length : undefined}
                sub="All time"
              />
            ),
          },
          {
            id: 'reviewed',
            node: (
              <StatTile
                label="Reviewed"
                info="Your feedback that has been read and answered."
                value={mine ? rows.filter((r) => r.status === 'reviewed').length : undefined}
                sub="Of yours"
              />
            ),
          },
          ...(inboxOn
            ? [
                {
                  id: 'inbox',
                  node: (
                    <StatTile
                      label="Inbox: new"
                      info="Everyone's feedback not reviewed yet."
                      value={inbox ? all.filter((r) => r.status === 'new').length : undefined}
                      sub={inbox ? `of ${all.length}` : undefined}
                      tone={
                        all.some((r) => r.status === 'new' && r.impact === 'high')
                          ? 'bad'
                          : undefined
                      }
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
      <SortableGroup
        group="feedback.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        items={[
          {
            id: 'form',
            className: 'xl:col-span-6',
            node: (
              <Card
                title="Tell us"
                info="Your feedback goes to the dashboard team. Projects and people offered are the ones you can see."
              >
                <FeedbackForm />
              </Card>
            ),
          },
          {
            id: 'mine',
            className: 'xl:col-span-6',
            node: (
              <Card
                title="My feedback"
                empty={!!mine && !rows.length}
                emptyText="Nothing sent yet."
              >
                <List rows={rows} />
              </Card>
            ),
          },
          ...(inboxOn
            ? [
                {
                  id: 'inbox',
                  className: 'xl:col-span-12',
                  node: <Inbox rows={all} loading={!inbox} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function Files({ row }: { row: HelpRow }) {
  if (!row.files.length) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {row.files.map((f) => (
        <a
          key={f.id}
          href={`/api/help/files/${f.id}${f.mime.startsWith('image/') ? '' : '?download'}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[12px] text-primary hover:bg-primary/20"
        >
          {f.name} <span className="text-text-muted">{kb(f.size)}</span>
        </a>
      ))}
    </span>
  );
}

function Head({ r, who }: { r: HelpRow; who?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-heading text-button text-primary-dark">{r.title}</span>
      <span
        className={clsx(
          'rounded-full px-2 py-0.5 font-heading text-label font-bold uppercase',
          IMPACT[r.impact].cls,
        )}
      >
        {IMPACT[r.impact].label}
      </span>
      <span
        className={clsx(
          'rounded-full px-2 py-0.5 font-heading text-label font-bold uppercase',
          r.status === 'reviewed' ? 'bg-good/15 text-good' : 'bg-primary/10 text-primary',
        )}
      >
        {r.status === 'reviewed' ? 'Reviewed' : 'New'}
      </span>
      <span className="text-[11px] text-text-muted">
        {who ? `${r.name} · ` : ''}
        {ABOUT_LABEL[r.aboutKind]}
        {r.aboutLabel ? `: ${r.aboutLabel}` : ''} · {timeAgo(r.at)}
      </span>
    </span>
  );
}

function List({ rows }: { rows: HelpRow[] }) {
  return (
    <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
      {rows.map((r) => (
        <li key={r.id} className="rounded-xl border border-border bg-bg/50 px-3 py-2">
          <Head r={r} />
          <p className="mt-1 whitespace-pre-wrap text-table text-text">{r.details}</p>
          <Files row={r} />
          {r.adminNote && (
            <p className="mt-2 rounded-lg bg-accent/10 px-2.5 py-1.5 text-table text-text">
              <b className="font-heading">Reply:</b> {r.adminNote}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Inbox({ rows, loading }: { rows: HelpRow[]; loading: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'all' | 'new' | 'reviewed'>('new');
  const [impact, setImpact] = useState<'all' | HelpRow['impact']>('all');
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (status === 'all' || r.status === status) && (impact === 'all' || r.impact === impact),
      ),
    [rows, status, impact],
  );
  const review = async (r: HelpRow, note: string) => {
    try {
      await apiPost(`/api/help/feedback/${r.id}/review`, {
        status: 'reviewed',
        note: note || null,
      });
      toast.success('Marked as reviewed');
      void qc.invalidateQueries({ queryKey: [API_KEY] });
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    }
  };
  const sel = 'h-8 rounded-control border border-border bg-surface px-2 text-table';
  return (
    <Card
      title="Feedback inbox"
      info="Everyone's feedback, newest first. Finance feedback shows to admins only."
      loading={loading}
      action={
        <span className="flex flex-wrap items-center gap-2" data-no-export>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={sel}
            aria-label="Status"
          >
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="all">All</option>
          </select>
          <select
            value={impact}
            onChange={(e) => setImpact(e.target.value as typeof impact)}
            className={sel}
            aria-label="Impact"
          >
            <option value="all">Any impact</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <a
            href="/api/help/feedback/export"
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border px-2.5 font-heading text-button text-primary hover:border-primary"
          >
            <IconExcel size={15} /> Excel
          </a>
        </span>
      }
      empty={!loading && !shown.length}
      emptyText="Nothing here."
    >
      <ul className="grid gap-2 lg:grid-cols-2">
        {shown.map((r) => (
          <InboxItem key={r.id} r={r} onReview={review} />
        ))}
      </ul>
    </Card>
  );
}

function InboxItem({ r, onReview }: { r: HelpRow; onReview: (r: HelpRow, note: string) => void }) {
  const [note, setNote] = useState(r.adminNote ?? '');
  return (
    <li className="rounded-xl border border-border bg-bg/50 px-3 py-2">
      <Head r={r} who />
      <p className="mt-1 whitespace-pre-wrap text-table text-text">{r.details}</p>
      <Files row={r} />
      <div className="mt-2 flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reply (shown to the sender)"
          className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-table focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onReview(r, note)}
          className="h-8 rounded-control bg-gradient-to-r from-primary to-accent px-3 font-heading text-button text-white hover:brightness-110"
        >
          {r.status === 'reviewed' ? 'Update' : 'Mark reviewed'}
        </button>
      </div>
    </li>
  );
}
