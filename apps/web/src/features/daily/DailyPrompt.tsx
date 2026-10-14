// Hosts the Daily update dialog (SRS 23) for people with the Daily update right. It never opens
// by itself (2026-10-15): only from the dock icon, the Daily update page, or Sign out (wrap-up).
import { useMe } from '../../api/me';
import { DailyDialog } from './DailyDialog';

export function DailyPrompt() {
  const { data: me } = useMe();
  const on = !!me && me.dailyUpdate !== false && me.auth !== 'off';
  return on ? <DailyDialog /> : null;
}
