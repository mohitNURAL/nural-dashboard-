// The feedback form (Help › Feedback, and Finance with `fixed="finance"`): what it is about (the
// dashboard, a page, a project or a person, the last two from what the sender can see), a title,
// the details, the impact, and up to 5 attachments (images, PDF, Excel, Word; 8 MB each).
// Screenshots can be pasted straight in (Ctrl+V) or dropped on the box.
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type ClipboardEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { API_KEY } from '../../api/queries';
import { navFor } from '../../components/shell/nav';
import { IconClose, IconDownload } from '../../components/ui/icons';
import { useMe } from '../../api/me';
import {
  ABOUT_LABEL,
  ACCEPT,
  allowedFile,
  IMPACT,
  kb,
  MAX_BYTES,
  MAX_FILES,
  toBase64,
  useHelpOptions,
  type AboutKind,
  type Impact,
} from './api';

const field =
  'w-full rounded-control border border-border bg-surface px-3 text-body text-text focus:border-primary focus:outline-none';

export function FeedbackForm({
  fixed,
  placeholder = 'What happened, where, and what you expected instead.',
}: {
  fixed?: AboutKind;
  placeholder?: string;
}) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: options } = useHelpOptions();
  const [about, setAbout] = useState<AboutKind>(fixed ?? 'dashboard');
  const [aboutId, setAboutId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [impact, setImpact] = useState<Impact>('medium');
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const pages = navFor(me).flatMap((g) =>
    g.items.map((i) => ({ id: i.id, name: `${g.label} › ${i.label}` })),
  );
  const choices =
    about === 'project'
      ? options?.projects
      : about === 'person'
        ? options?.people
        : about === 'page'
          ? pages
          : null;

  const add = (list: FileList | File[]) => {
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!allowedFile(f.name)) {
        toast.error(`${f.name} cannot be attached`, {
          description: 'Images, PDF, Excel and Word files only.',
        });
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is over 8 MB`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        toast.error(`Up to ${MAX_FILES} files`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
  };
  const onPaste = (e: ClipboardEvent) => {
    const shots = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (!shots.length) return;
    e.preventDefault();
    add(
      shots.map((f, i) => new File([f], `screenshot-${Date.now()}-${i + 1}.png`, { type: f.type })),
    );
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };

  const send = async () => {
    const label =
      about === 'dashboard' || about === 'finance'
        ? null
        : (choices?.find((c) => String(c.id) === aboutId)?.name ?? null);
    if ((about === 'project' || about === 'person' || about === 'page') && !label) {
      toast.error(`Choose ${about === 'page' ? 'the page' : `the ${about}`}`);
      return;
    }
    setBusy(true);
    try {
      await apiPost('/api/help/feedback', {
        aboutKind: about,
        aboutId: about === 'project' || about === 'person' ? Number(aboutId) : null,
        aboutLabel: label,
        title,
        details,
        impact,
        files: await Promise.all(
          files.map(async (f) => ({ name: f.name, data: await toBase64(f) })),
        ),
      });
      toast.success('Thank you! Your feedback is in', {
        description: 'You can follow it under My feedback.',
      });
      setTitle('');
      setDetails('');
      setFiles([]);
      setAboutId('');
      void qc.invalidateQueries({ queryKey: [API_KEY] });
    } catch (e) {
      toast.error('Not sent', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      onPaste={onPaste}
    >
      {!fixed && (
        <div>
          <p className="mb-1.5 font-heading text-label uppercase text-text-muted">About</p>
          <div
            className="flex flex-wrap gap-1 rounded-control bg-primary-soft-100 p-1"
            role="radiogroup"
          >
            {(['dashboard', 'page', 'project', 'person'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={about === k}
                onClick={() => {
                  setAbout(k);
                  setAboutId('');
                }}
                className={clsx(
                  'rounded px-3 py-1.5 font-heading text-button transition',
                  about === k
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-text-muted hover:text-primary',
                )}
              >
                {ABOUT_LABEL[k]}
              </button>
            ))}
          </div>
          {choices && (
            <select
              value={aboutId}
              onChange={(e) => setAboutId(e.target.value)}
              className={clsx(field, 'mt-2 h-10')}
              aria-label={`Choose ${about}`}
            >
              <option value="">
                Choose {about === 'page' ? 'the page' : `the ${about}`}
                {about === 'project' || about === 'person' ? ' (from what you can see)' : ''}…
              </option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <label className="block">
        <span className="mb-1.5 block font-heading text-label uppercase text-text-muted">
          Title
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={160}
          placeholder="In a few words"
          className={clsx(field, 'h-10')}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block font-heading text-label uppercase text-text-muted">
          Details
        </span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          required
          minLength={5}
          maxLength={5000}
          rows={5}
          placeholder={placeholder}
          className={clsx(field, 'py-2')}
        />
      </label>
      <div>
        <p className="mb-1.5 font-heading text-label uppercase text-text-muted">Impact</p>
        <div className="flex gap-2" role="radiogroup">
          {(Object.keys(IMPACT) as Impact[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={impact === k}
              onClick={() => setImpact(k)}
              className={clsx(
                'rounded-full px-3 py-1 font-heading text-button transition',
                impact === k
                  ? clsx(IMPACT[k].cls, 'ring-2 ring-current')
                  : 'bg-bg text-text-muted hover:text-primary',
              )}
            >
              {IMPACT[k].label}
            </button>
          ))}
        </div>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={clsx(
          'rounded-card border-2 border-dashed p-4 text-center transition',
          over ? 'border-accent bg-accent/10' : 'border-border',
        )}
      >
        <IconDownload size={22} className="mx-auto rotate-180 text-primary" />
        <p className="mt-1 text-table text-text">
          Drop files here, paste a screenshot (Ctrl+V), or{' '}
          <label className="cursor-pointer font-heading text-primary hover:underline">
            choose files
            <input
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => e.target.files && add(e.target.files)}
            />
          </label>
        </p>
        <p className="text-[11px] text-text-muted">
          Images, PDF, Excel, Word · up to {MAX_FILES} files, 8 MB each
        </p>
        {files.length > 0 && (
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-2 rounded-full bg-primary-soft-100 px-3 py-1 text-table"
              >
                {f.name} <span className="text-text-muted">{kb(f.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="text-text-muted hover:text-bad"
                >
                  <IconClose size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="h-11 w-full rounded-control bg-gradient-to-r from-primary to-accent font-heading text-button text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send feedback'}
      </button>
    </form>
  );
}
