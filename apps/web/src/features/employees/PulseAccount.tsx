// Pulse sign-in for a person (People directory › Edit person, admins; 2026-11-02): whether they
// have a Pulse account (work email and password), a temporary password to hand them (they must
// choose their own at the first sign-in), or removing the account. No mail needed.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError, apiPost } from '../../api/client';
import { API_KEY, useApi } from '../../api/queries';
import { confirm } from '../../components/ui/ConfirmDialog';
import { IconLock } from '../../components/ui/icons';

interface AccountInfo {
  email: string | null;
  allowed: boolean;
  domains: string[];
  account: {
    email: string;
    mustChange: boolean;
    locked: boolean;
    lastSignInAt: string | null;
  } | null;
}

const MIN = 10;

/** 14 characters without look-alikes (0/O, 1/l/I), from the browser's secure random source. */
function makePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const r = new Uint32Array(14);
  crypto.getRandomValues(r);
  return Array.from(r, (n) => chars[n % chars.length]).join('');
}

export function PulseAccount({ id, name }: { id: number; name: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useApi<AccountInfo>(`/api/accounts/${id}`, {});
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [given, setGiven] = useState<{ email: string; password: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: [API_KEY, `/api/accounts/${id}`] });

  const save = async () => {
    if (password.length < MIN) return toast.error(`Use at least ${MIN} characters`);
    setBusy(true);
    try {
      const r = await apiPost<{ email: string }>(`/api/accounts/${id}`, { password }, 'PUT');
      setGiven({ email: r.email, password });
      setPassword('');
      toast.success(`Temporary password set for ${name}`, {
        description: 'They choose their own the first time they sign in with it.',
      });
      void refresh();
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${name}'s Pulse account?`,
      message:
        'They can no longer sign in with their email and password. Sign in with Bitrix24 still works.',
      confirmLabel: 'Remove account',
      tone: 'bad',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiPost(`/api/accounts/${id}`, {}, 'DELETE');
      setGiven(null);
      toast.success(`${name}'s Pulse account removed`);
      void refresh();
    } catch (e) {
      toast.error('Not removed', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  // A copy with sign-in off has no Pulse accounts: nothing to show.
  if (error instanceof ApiError && error.status === 404) return null;
  const acc = data?.account;
  const field =
    'h-10 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 font-mono text-body text-text focus:border-primary focus:outline-none';

  return (
    <section className="rounded-card border border-border p-3" data-tour="people-pulse-account">
      <span className="mb-1.5 flex items-center gap-2 font-heading text-label uppercase text-text-muted">
        Pulse sign-in <span className="normal-case tracking-normal">· work email and password</span>
      </span>
      {isLoading ? (
        <p className="text-table text-text-muted">Loading…</p>
      ) : error || !data ? (
        <p className="text-table text-bad">
          {error instanceof Error ? error.message : 'Could not load.'}
        </p>
      ) : (
        <>
          <p className="mb-2 text-table text-text">
            {acc ? (
              <>
                Has an account as <b>{acc.email}</b>
                {acc.mustChange
                  ? ' · temporary password, not changed yet'
                  : acc.lastSignInAt
                    ? ` · last signed in ${new Date(acc.lastSignInAt).toLocaleString()}`
                    : ''}
                {acc.locked && (
                  <span className="ml-1 inline-flex items-center gap-1 text-bad">
                    <IconLock size={12} /> locked for a few minutes (wrong passwords)
                  </span>
                )}
              </>
            ) : data.allowed ? (
              <>
                No Pulse account yet. Set a temporary password for <b>{data.email}</b>.
              </>
            ) : (
              <span className="text-text-muted">
                No Pulse account possible:{' '}
                {data.email
                  ? `${data.email} is not a ${data.domains.map((d) => '@' + d).join(' or ')} email, or the person is not active in Bitrix24.`
                  : 'no work email in Bitrix24.'}
              </span>
            )}
          </p>
          {data.allowed && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={acc ? 'New temporary password' : 'Temporary password'}
                autoComplete="off"
                spellCheck={false}
                maxLength={200}
                className={field}
              />
              <button
                type="button"
                onClick={() => setPassword(makePassword())}
                className="btn btn-stroke h-10 px-3"
              >
                Generate
              </button>
              <button
                type="button"
                disabled={busy || password.length < MIN}
                onClick={() => void save()}
                className="btn btn-page h-10 px-3 disabled:opacity-40"
              >
                {acc ? 'Reset' : 'Create'}
              </button>
            </div>
          )}
          {given && (
            <div className="mt-2 rounded-control bg-accent/10 p-2 text-table text-text">
              Give {name} these to sign in (shown only now):
              <div className="mt-1 font-mono">
                {given.email} · {given.password}
              </div>
              <button
                type="button"
                className="mt-1 text-primary hover:underline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(
                      `${location.origin}\nEmail: ${given.email}\nPassword: ${given.password}`,
                    )
                    .then(() => toast.success('Copied'))
                }
              >
                Copy
              </button>
            </div>
          )}
          {acc && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="mt-2 text-table text-bad hover:underline disabled:opacity-40"
            >
              Remove Pulse account
            </button>
          )}
        </>
      )}
    </section>
  );
}
