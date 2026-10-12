// Contextual search dropdown (DEV-00): type to filter, multi-select with chips, "Clear".
// Options come from /api/filters/options, so they already reflect every other filter.
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { Command } from 'cmdk';
import { useMemo, useRef, useState } from 'react';
import { IconClose, IconSearch } from './ui/icons';

export interface ComboOption {
  value: string;
  label: string;
  count?: number;
  group?: string;
}

interface Props {
  label: string;
  options: ComboOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Single choice (Bug or Feedback); picking the selected value clears it. */
  single?: boolean;
  loading?: boolean;
  className?: string;
}

const MAX_CHIPS = 2;

export function SearchCombobox({
  label,
  options,
  selected,
  onChange,
  single,
  loading,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Remember labels, so a selected value that drops out of the narrowed options keeps its name.
  const labels = useRef(new Map<string, string>());
  for (const o of options) labels.current.set(o.value, o.label);
  const labelOf = (v: string) => labels.current.get(v) ?? v;

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const known = new Set(options.map((o) => o.value));
    // Selected values missing from the options stay listed so they can be unticked.
    const all: ComboOption[] = [
      ...selected
        .filter((v) => !known.has(v))
        .map((v) => ({ value: v, label: labels.current.get(v) ?? v, count: 0 })),
      ...options,
    ];
    const shown = q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all;
    const byGroup = new Map<string, ComboOption[]>();
    for (const o of shown) {
      const g = o.group ?? '';
      byGroup.set(g, [...(byGroup.get(g) ?? []), o]);
    }
    return [...byGroup];
  }, [options, selected, search]);

  const toggle = (v: string) => {
    if (single) {
      onChange(selected.includes(v) ? [] : [v]);
      setOpen(false);
    } else {
      onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch('');
      }}
    >
      <div className={clsx('relative flex h-10 min-w-0', className)}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx(
              'flex h-full w-full min-w-0 items-center gap-2 rounded-control border bg-surface px-3 text-left',
              selected.length ? 'border-primary pr-14' : 'border-border',
              'hover:border-primary-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              {selected.length === 0 ? (
                <span className="truncate text-text">{label}</span>
              ) : (
                <>
                  <span className="shrink-0 font-heading text-label font-bold uppercase text-primary-dark">
                    {label}
                  </span>
                  {selected.slice(0, MAX_CHIPS).map((v) => (
                    <span
                      key={v}
                      className="max-w-[9rem] shrink truncate rounded-full bg-primary-soft px-2 py-0.5 font-heading text-label text-primary-dark"
                    >
                      {labelOf(v)}
                    </span>
                  ))}
                  {selected.length > MAX_CHIPS && (
                    <span className="shrink-0 font-heading text-label text-primary">
                      +{selected.length - MAX_CHIPS}
                    </span>
                  )}
                </>
              )}
            </span>
            <Chevron />
          </button>
        </Popover.Trigger>
        {selected.length > 0 && (
          <ClearButton label={`Clear ${label.toLowerCase()} filter`} onClear={() => onChange([])} />
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[16rem] rounded-card border border-border bg-surface shadow-pop"
        >
          <Command shouldFilter={false} label={label}>
            {/* The same search box look as everywhere (ui/SearchInput): icon, clear ×. */}
            <div className="relative border-b border-border">
              <IconSearch
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full bg-transparent py-2.5 pl-9 pr-9 outline-none placeholder:text-text-muted"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear the search"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-text-muted hover:bg-primary-soft-100 hover:text-primary"
                >
                  <IconClose size={12} />
                </button>
              )}
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-4 text-center text-text-muted">
                {loading ? 'Loading…' : 'No matches'}
              </Command.Empty>
              {groups.map(([group, items]) => (
                <Command.Group
                  key={group}
                  heading={group || undefined}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-heading [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-text-muted"
                >
                  {items.map((o) => {
                    const on = selected.includes(o.value);
                    return (
                      <Command.Item
                        key={o.value}
                        value={o.value}
                        onSelect={() => toggle(o.value)}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 data-[selected=true]:bg-primary-soft-100"
                      >
                        <span
                          className={clsx(
                            'grid h-3.5 w-3.5 shrink-0 place-items-center border text-[9px] text-white',
                            single ? 'rounded-full' : 'rounded-sm',
                            on ? 'border-primary bg-primary' : 'border-primary-soft-300',
                          )}
                          aria-hidden
                        >
                          {on && '✓'}
                        </span>
                        <span className="flex-1 truncate">{o.label}</span>
                        {o.count !== undefined && (
                          <span className="text-table text-text-muted">{o.count}</span>
                        )}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-text-muted">{selected.length} selected</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-heading text-button text-primary hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0 text-text">
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Clears a filter from its closed trigger, without opening the drop-down. Sits over the
 * trigger's right edge, just before the chevron (a button cannot nest inside the trigger).
 */
export function ClearButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClear}
      className="absolute right-8 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-text-muted hover:bg-bad-soft hover:text-bad-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
