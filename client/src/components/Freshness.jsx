import { fmtDateTime, fmtTime } from '../format.js';

/** Live / "data as of …" indicator (SRS §7 Availability, §9). */
export default function Freshness({ sync }) {
  if (!sync) return null;
  return (
    <div className={`freshness${sync.stale ? ' stale' : ' live'}`} role="status">
      <span className="dot" aria-hidden="true" />
      {sync.stale
        ? <span>Data as of {fmtDateTime(sync.lastSuccessAt)}</span>
        : <span><b>Live</b> · checked {fmtTime(sync.lastSuccessAt)}</span>}
      {sync.lastChangeAt && <span>· last change {fmtTime(sync.lastChangeAt)}</span>}
      {sync.quickSyncSeconds && <span>· checks Bitrix24 every {sync.quickSyncSeconds}s</span>}
      {sync.lastError && <span>· Bitrix24 sync failed ({sync.lastError}) — showing last known good data</span>}
      {sync.source === 'mock' && <span className="mode">Mock portal data</span>}
    </div>
  );
}
