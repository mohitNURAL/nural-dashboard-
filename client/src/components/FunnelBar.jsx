// Stage colours from the prototype: brand blue shades, Won in cyan, Lost in red.
export const STAGE_COLORS = {
  in_progress: ['--p300', '--p700'], hot: ['--p400', '--white'], warm: ['--p500', '--white'], converted: ['--p700', '--white'],
  cold: ['--p200', '--p700'], lost: ['--r500', '--white'],
  proposal: ['--p300', '--p700'], revised: ['--p400', '--white'], negotiation: ['--p500', '--white'], po: ['--p600', '--white'],
  won: ['--s500', '--p700'], unmapped: ['--n300', '--black'],
};

/** One funnel row; with `onClick` it becomes a button that opens the stage's client list. */
export default function FunnelBar({ stageKey, label, count, max, aside, onClick }) {
  const [bg, fg] = STAGE_COLORS[stageKey] ?? STAGE_COLORS.unmapped;
  const width = max > 0 ? Math.max(2, (count / max) * 100) : 2;
  const content = (
    <>
      <div className="funnel-label">{label}</div>
      <div className="funnel-track" role={onClick ? undefined : 'img'} aria-label={onClick ? undefined : `${label}: ${count}`}>
        <div className="funnel-fill" style={{ width: `${width}%`, background: `var(${bg})`, color: `var(${fg})` }}>{count}</div>
      </div>
      <div className="funnel-conv">{aside}</div>
    </>
  );
  return onClick && count > 0
    ? <button type="button" className="funnel-stage" onClick={onClick} aria-label={`${label}: ${count} — show list`}>{content}</button>
    : <div className="funnel-stage">{content}</div>;
}
