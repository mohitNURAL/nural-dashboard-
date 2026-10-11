// Help module data (apps/api/src/routes/help.ts): feedback with attachments, the inbox, and the
// project and person pickers (only what the sender can see).
import { useApi } from '../../api/queries';

export type AboutKind = 'dashboard' | 'page' | 'project' | 'person' | 'finance';
export type Impact = 'low' | 'medium' | 'high';

export interface HelpFile {
  id: number;
  name: string;
  mime: string;
  size: number;
}

export interface HelpRow {
  id: number;
  at: string;
  userId: number;
  name: string;
  aboutKind: AboutKind;
  aboutId: number | null;
  aboutLabel: string | null;
  title: string;
  details: string;
  impact: Impact;
  status: 'new' | 'reviewed';
  adminNote: string | null;
  files: HelpFile[];
}

export const useHelpOptions = () =>
  useApi<{ projects: { id: number; name: string }[]; people: { id: number; name: string }[] }>(
    '/api/help/options',
    {},
  );
export const useMyFeedback = () => useApi<{ rows: HelpRow[] }>('/api/help/feedback/mine', {});
export const useFeedbackInbox = (on: boolean) =>
  useApi<{ rows: HelpRow[] }>('/api/help/feedback', {}, { enabled: on });

export const MAX_FILES = 5;
export const MAX_BYTES = 8 * 1024 * 1024;
export const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.xlsx,.xls,.csv,.docx,.doc';

/** Allowed by name (the server checks again). */
export const allowedFile = (name: string) =>
  ACCEPT.split(',').some((ext) => name.toLowerCase().endsWith(ext));

/** A file as base64, for sending in JSON. */
export const toBase64 = (f: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(f);
  });

export const ABOUT_LABEL: Record<AboutKind, string> = {
  dashboard: 'The dashboard',
  page: 'A page',
  project: 'A project',
  person: 'A person',
  finance: 'Finance',
};

export const IMPACT: Record<Impact, { label: string; cls: string }> = {
  low: { label: 'Low', cls: 'bg-border/60 text-text-muted' },
  medium: { label: 'Medium', cls: 'bg-warn/15 text-warn' },
  high: { label: 'High', cls: 'bg-bad/15 text-bad' },
};

export const kb = (n: number) =>
  n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
