// After a deploy, people with the dashboard open get a toast asking them to refresh (2026-10-11).
// The running build's ID is compared with /version.json, written by the build (vite.config.ts):
// every minute, when the tab is shown again and when the browser comes back online.
import { useEffect } from 'react';
import { toast } from 'sonner';

const CHECK_EVERY_MS = 60_000;

/** True when the server has a different build than the one running. */
export const isNewVersion = (running: string, served: unknown) =>
  typeof served === 'string' && served !== '' && served !== running;

export function useNewVersion() {
  useEffect(() => {
    // Only built copies have a version file; the dev server reloads by itself.
    if (!import.meta.env.PROD) return;
    let shown = false;
    const check = async () => {
      if (shown || !navigator.onLine || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: unknown };
        if (!isNewVersion(__BUILD_ID__, build)) return;
        shown = true;
        toast('A new version of the dashboard is ready', {
          id: 'new-version',
          description: 'Refresh to get the latest update.',
          duration: Infinity,
          action: { label: 'Refresh', onClick: () => window.location.reload() },
          actionButtonStyle: { background: 'var(--primary)', color: 'var(--on-primary)' },
        });
      } catch {
        // Offline or mid-deploy: try again next time.
      }
    };
    const onVisible = () => void (document.visibilityState === 'visible' && check());
    const onOnline = () => void check();
    const timer = window.setInterval(onOnline, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
