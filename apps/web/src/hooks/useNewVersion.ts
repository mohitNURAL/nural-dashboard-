// After a deploy, people with the dashboard open get a toast asking them to refresh (2026-10-11).
// The running build's ID is compared with /version.json, written by the build (vite.config.ts):
// every minute, when the tab is shown again and when the browser comes back online.
import { useEffect } from 'react';
import { toast } from 'sonner';
import { TAB_LABEL } from '../features/tour/steps';
import { WHATS_NEW } from '../features/tour/whatsNew';
import type { Tab } from '../features/filters/toParams';

const CHECK_EVERY_MS = 60_000;

/** True when the server has a different build than the one running. */
export const isNewVersion = (running: string, served: unknown) =>
  typeof served === 'string' && served !== '' && served !== running;

interface News {
  id: string;
  title: string;
  tab: Tab;
}

/** What the new build brings that the running one does not know: "Title (Tab) · …". */
export function whatsNewText(served: unknown, known: string[]): string {
  const news = Array.isArray(served) ? (served as News[]) : [];
  const fresh = news.filter((n) => n && typeof n.id === 'string' && !known.includes(n.id));
  if (!fresh.length) return 'Improvements and fixes. Refresh to get the latest update.';
  const list = fresh
    .slice(0, 3)
    .map((n) => `${n.title} (${TAB_LABEL[n.tab] ?? n.tab})`)
    .join(' · ');
  const more = fresh.length > 3 ? ` and ${fresh.length - 3} more` : '';
  return `What's new: ${list}${more}. Refresh to see it; the dashboard will show you around.`;
}

export function useNewVersion() {
  useEffect(() => {
    // Only built copies have a version file; the dev server reloads by itself.
    if (!import.meta.env.PROD) return;
    // The build last announced: a later deploy asks again, even if that toast was closed.
    let announced = '';
    const check = async () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build, news } = (await res.json()) as { build?: unknown; news?: unknown };
        if (!isNewVersion(__BUILD_ID__, build) || build === announced) return;
        announced = build as string;
        toast('A new version of the dashboard is ready', {
          id: 'new-version',
          description: whatsNewText(
            news,
            WHATS_NEW.map((w) => w.id),
          ),
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
