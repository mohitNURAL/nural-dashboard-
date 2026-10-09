import { useEffect, useState } from 'react';

type ApiStatus = 'checking' | 'ok' | 'down';

function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>('checking');
  useEffect(() => {
    let cancelled = false;
    fetch('/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { status?: string }) => !cancelled && setStatus(b.status === 'ok' ? 'ok' : 'down'))
      .catch(() => !cancelled && setStatus('down'));
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

export default function App() {
  const api = useApiStatus();
  const chip = {
    checking: 'bg-primary-soft text-primary-dark',
    ok: 'bg-accent-soft text-accent-dark',
    down: 'bg-bad-soft text-bad-dark',
  }[api];

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between bg-primary-dark px-6 py-3 text-white">
        <h1 className="text-2xl">Nural Dev &amp; QA Dashboard</h1>
        <span
          className={`rounded-full px-3 py-1 font-heading text-[10px] font-bold tracking-[0.04em] ${chip}`}
        >
          API {api}
        </span>
      </header>
      <main className="p-6">
        <div className="rounded-card border border-border bg-surface p-6">
          <h2 className="text-lg text-primary-dark">Scaffold ready</h2>
          <p className="mt-2">
            Development and QA tabs arrive in milestones 6 to 8 (see docs/SRS.md section 10.5).
          </p>
        </div>
      </main>
    </div>
  );
}
