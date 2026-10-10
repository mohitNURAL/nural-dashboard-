// Small pieces of the KPI tab: status chip and sparkline.
import clsx from 'clsx';
import type { Health } from '../../api/types';

const HEALTH: Record<Health, { label: string; cls: string }> = {
  red: { label: 'Red', cls: 'bg-bad text-white' },
  amber: { label: 'Amber', cls: 'bg-warn text-white' },
  green: { label: 'Green', cls: 'bg-good text-white' },
};

export function HealthChip({ status }: { status: Health }) {
  return (
    <span
      className={clsx(
        'inline-block rounded px-1.5 py-0.5 font-heading text-label font-bold',
        HEALTH[status].cls,
      )}
    >
      {HEALTH[status].label}
    </span>
  );
}

/** A tiny line of counts, oldest first; the last point is marked. */
export function Sparkline({
  values,
  width = 80,
  height = 20,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label: string;
}) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1] ?? 0;
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
      <title>{label}</title>
      <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="1.5" />
      <circle cx={(values.length - 1) * step} cy={y(last)} r="2" fill="var(--primary)" />
    </svg>
  );
}
