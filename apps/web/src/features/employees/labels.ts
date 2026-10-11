// Names used across the Employee module: roles, rights, sign-in status, "5 min ago".
import type { RightKey, Role, SignInStatus } from './api';

export const ROLE_NAME: Record<Role, string> = {
  admin: 'Admin',
  pm: 'Project manager',
  teamLead: 'Team lead',
  productOwner: 'Product owner',
  member: 'Member',
  local: 'Local copy',
};

export const RIGHTS: {
  key: RightKey;
  label: string;
  /** Names of the two values: [on / all, off / own or limited]. */
  values: [string, string];
  hint: string;
}[] = [
  {
    key: 'scope',
    label: 'Data',
    values: ['All data', 'Own tasks'],
    hint: 'Every project and person, or only tasks assigned to or created by them',
  },
  { key: 'kpi', label: 'KPI', values: ['On', 'Off'], hint: 'The KPI tab' },
  {
    key: 'support',
    label: 'Support',
    values: ['On', 'Off'],
    hint: 'The Support tab and its feedback form',
  },
  { key: 'inbox', label: 'Inbox', values: ['On', 'Off'], hint: 'The Support feedback inbox' },
  {
    key: 'employees',
    label: 'Employees',
    values: ['On', 'Off'],
    hint: 'Company tree and People directory',
  },
  {
    key: 'edit',
    label: 'Edit',
    values: ['All fields', 'Limited'],
    hint: 'Every task field, or only stage, status and tags',
  },
  { key: 'admin', label: 'Admin', values: ['On', 'Off'], hint: 'Manage access (this screen)' },
];

/** The value as stored ('all' / true, …) → is it the "on" side? */
export const isOn = (key: RightKey, v: unknown) =>
  key === 'scope' ? v === 'all' : key === 'edit' ? v === 'all' : v === true;
/** The stored value for the on or off side of a right. */
export const valueOf = (key: RightKey, on: boolean) =>
  key === 'scope' ? (on ? 'all' : 'own') : key === 'edit' ? (on ? 'all' : 'limited') : on;

export const STATUS: Record<SignInStatus, { label: string; cls: string }> = {
  active: { label: 'Active now', cls: 'bg-good/15 text-good ring-good/30' },
  signedIn: { label: 'Signed in', cls: 'bg-primary/10 text-primary ring-primary/25' },
  ended: { label: 'Session ended', cls: 'bg-warn/15 text-warn ring-warn/30' },
  earlier: { label: 'Signed in earlier', cls: 'bg-primary/10 text-primary ring-primary/20' },
  never: { label: 'Never signed in', cls: 'bg-border/40 text-text-muted ring-border' },
};

/** "just now", "5 min ago", "3 h ago", "2 days ago", or the date. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} day${s < 2 * 86_400 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
