import { daysBetween } from '../format.js';

const PIPELINES = [
  ['all', 'All'], ['sales', 'Nural Sales'], ['service', 'Nural Service'], ['assets', 'Nural Assets'], ['custom', 'Nural Custom'],
];

function Chip({ active, onClick, children }) {
  return <button type="button" className="chip" aria-pressed={active} onClick={onClick}>{children}</button>;
}

/** FR-1 — Period + Pipeline filters with live status line. */
export default function FilterBar({ filters, label, onChange, onCustom }) {
  const customLabel = filters.period === 'custom' && filters.from && filters.to ? `Custom (${daysBetween(filters.from, filters.to)}d)` : 'Custom';
  return (
    <div className="filterbar">
      <div className="group" role="group" aria-label="Period">
        <span className="group-label">Period</span>
        <Chip active={filters.period === 'quarter'} onClick={() => onChange({ period: 'quarter' })}>This Quarter</Chip>
        <Chip active={filters.period === 'month'} onClick={() => onChange({ period: 'month' })}>This Month</Chip>
        <Chip active={filters.period === 'custom'} onClick={onCustom}>{customLabel}</Chip>
      </div>
      <div className="group" role="group" aria-label="Pipeline">
        <span className="group-label">Pipeline</span>
        {PIPELINES.map(([key, text]) => (
          <Chip key={key} active={filters.pipeline === key} onClick={() => onChange({ pipeline: key })}>{text}</Chip>
        ))}
      </div>
      <div className="spacer" />
      <div className="filter-status" aria-live="polite">{label}</div>
    </div>
  );
}
