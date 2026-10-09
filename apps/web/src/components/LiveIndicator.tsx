// "Live" dot plus the time of the last change received from Bitrix24 (DEV-00).
import clsx from 'clsx';
import { APP_TIMEZONE } from '../config';
import { useLive } from '../store/live';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIMEZONE,
  });

export function LiveIndicator() {
  const status = useLive((s) => s.status);
  const lastChangeAt = useLive((s) => s.lastChangeAt);
  const label = status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline';

  return (
    <span
      className="flex items-center gap-2 font-heading text-button"
      title={lastChangeAt ? `Last change from Bitrix24 at ${time(lastChangeAt)}` : undefined}
    >
      <span className="relative flex h-2.5 w-2.5">
        {status === 'live' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        )}
        <span
          className={clsx(
            'relative inline-flex h-2.5 w-2.5 rounded-full',
            status === 'live' ? 'bg-accent' : status === 'connecting' ? 'bg-warn' : 'bg-bad',
          )}
        />
      </span>
      {label}
      {lastChangeAt && <span className="font-normal opacity-70">· {time(lastChangeAt)}</span>}
    </span>
  );
}
