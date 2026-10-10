// Header alerts (top bar, right): a bell with the number of alert lines. Clicking it opens the
// Alert details accordion on the Development tab (overdue, and over N days in a stage).
import { useAlerts } from '../features/dev/alerts';
import { useDrillStore } from '../features/dev/drill';
import type { Tab } from '../features/filters/toParams';

export function AlertsBell({ onTab }: { onTab: (t: Tab) => void }) {
  const { data } = useAlerts();
  const openAlerts = useDrillStore((s) => s.openAlerts);
  const total = data?.total ?? 0;
  const label = data
    ? `Alerts: ${data.overdue.length} overdue, ${data.stuck.length} over ${data.stuckDays} days in a stage`
    : 'Alerts';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        onTab('dev');
        openAlerts();
      }}
      className="relative grid h-8 w-8 place-items-center rounded-full text-white hover:bg-primary"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.5A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      {total > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-bad px-1 text-center font-heading text-[10px] font-bold leading-[18px] text-white">
          {total > 99 ? '99+' : total}
        </span>
      )}
    </button>
  );
}
