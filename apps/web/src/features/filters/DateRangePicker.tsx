// Date range filter (DEV-00): created or deadline date, default all time. Presets use
// APP_TIMEZONE so "Today" matches the dashboard's own idea of today.
import { dayKey } from '@nural/shared';
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { ClearButton } from '../../components/SearchCombobox';
import { DROPDOWN_BOX, DropdownChevron } from '../../components/ui/Select';
import { APP_TIMEZONE } from '../../config';
import type { DateField, FilterState } from './toParams';

type Range = Pick<FilterState, 'dateField' | 'from' | 'to'>;

interface Props {
  value: Range;
  onChange: (r: Range) => void;
}

/** YYYY-MM-DD plus n calendar days. */
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const short = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function rangeLabel(r: Range): string {
  if (!r.from && !r.to) return 'Date range: all time';
  const field = r.dateField === 'deadline' ? 'Deadline' : 'Created';
  if (r.from && r.to)
    return r.from === r.to
      ? `${field}: ${short(r.from)}`
      : `${field}: ${short(r.from)} to ${short(r.to)}`;
  return r.from ? `${field}: from ${short(r.from)}` : `${field}: until ${short(r.to!)}`;
}

export function DateRangePicker({ value, onChange }: Props) {
  const today = dayKey(new Date(), APP_TIMEZONE);
  const field: DateField = value.dateField ?? 'created';
  const active = Boolean(value.from || value.to);
  const presets = [
    { label: 'Today', from: today, to: today },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
    { label: 'This month', from: `${today.slice(0, 8)}01`, to: today },
  ];
  const set = (patch: Partial<Range>) =>
    onChange({ dateField: field, from: value.from, to: value.to, ...patch });

  return (
    <Popover.Root>
      <div className="relative flex h-10 min-w-0">
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx(
              'flex h-full w-full min-w-0 items-center gap-2 px-3 text-left',
              DROPDOWN_BOX,
              active ? 'border-primary pr-14 text-primary-dark' : 'border-border',
            )}
          >
            <span className="flex-1 truncate">{rangeLabel(value)}</span>
            <DropdownChevron />
          </button>
        </Popover.Trigger>
        {active && (
          <ClearButton
            label="Clear date range"
            onClear={() => onChange({ dateField: null, from: null, to: null })}
          />
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-popup w-72 space-y-3 rounded-card border border-border bg-surface p-3 shadow-pop"
        >
          <div className="flex rounded-control bg-primary-soft-100 p-0.5" role="radiogroup">
            {(['created', 'deadline'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={field === f}
                onClick={() => set({ dateField: f })}
                className={clsx(
                  'flex-1 rounded px-2 py-1 font-heading text-button',
                  field === f ? 'bg-surface text-primary shadow-sm' : 'text-text-muted',
                )}
              >
                {f === 'created' ? 'Created date' : 'Deadline'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set({ from: p.from, to: p.to })}
                className={clsx(
                  'rounded border px-2 py-1 text-left',
                  value.from === p.from && value.to === p.to
                    ? 'border-primary bg-primary-soft-100 text-primary-dark'
                    : 'border-border hover:border-primary-muted',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['from', 'to'] as const).map((k) => (
              <label key={k} className="space-y-1">
                <span className="block font-heading text-label font-bold uppercase text-text-muted">
                  {k}
                </span>
                <input
                  type="date"
                  value={value[k] ?? ''}
                  max={k === 'from' ? (value.to ?? undefined) : undefined}
                  min={k === 'to' ? (value.from ?? undefined) : undefined}
                  onChange={(e) => set({ [k]: e.target.value || null })}
                  className="w-full rounded border border-border px-2 py-1"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!active}
              onClick={() => onChange({ dateField: null, from: null, to: null })}
              className="font-heading text-button text-primary hover:underline disabled:text-text-muted disabled:no-underline"
            >
              All time
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
