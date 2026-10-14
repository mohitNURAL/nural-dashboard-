// Opens the Daily update by itself (SRS 23): the plan on the first visit of a working day and the
// wrap-up from the end of the working day, until posted; "Later" waits 2 hours (when.ts). It
// waits for a running tour, checks again every few minutes while the page stays open, and never
// shows to people without the Daily update right or to automated browsers.
import { useEffect } from 'react';
import { apiGet } from '../../api/client';
import { useMe } from '../../api/me';
import { usePrefs } from '../../api/prefs';
import { tourRunning } from '../tour/runTour';
import type { DailyToday } from './api';
import { DailyDialog } from './DailyDialog';
import { useDailyDialog } from './store';
import { dailyPrompt } from './when';

const CHECK_MS = 5 * 60_000;

export function DailyPrompt() {
  const { data: me } = useMe();
  const { data: prefs } = usePrefs();
  const on = !!me && me.dailyUpdate !== false && me.auth !== 'off' && !navigator.webdriver;

  useEffect(() => {
    if (!on || !prefs) return;
    let stop = false;
    const check = async () => {
      if (stop || tourRunning() || useDailyDialog.getState().mode) return;
      const today = await apiGet<DailyToday>('/api/daily/today').catch(() => null);
      const mode = today && dailyPrompt(today, prefs.tour, Date.now());
      if (mode && !stop) useDailyDialog.getState().open(mode);
    };
    // A little after the page settles, then every few minutes (the 18:30 wrap-up).
    const first = window.setTimeout(() => void check(), 4000);
    const every = window.setInterval(() => void check(), CHECK_MS);
    return () => {
      stop = true;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [on, prefs?.tour.shown?.dailysnooze]); // eslint-disable-line react-hooks/exhaustive-deps

  return on ? <DailyDialog /> : null;
}
