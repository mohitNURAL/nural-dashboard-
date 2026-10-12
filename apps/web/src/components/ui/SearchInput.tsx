// One search box for the whole dashboard (2026-10-12): search icon, a clear × once there is text,
// Escape clears, the same height, radius and focus ring everywhere. Optionally debounced, for
// searches that ask the server.
import clsx from 'clsx';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { IconClose, IconSearch } from './icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Names the box for screen readers (defaults to the placeholder). */
  label?: string;
  /** Waits this long after typing before calling onChange (clearing is immediate). */
  debounceMs?: number;
  size?: 'sm' | 'md';
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label,
  debounceMs = 0,
  size = 'md',
  className,
  autoFocus,
  onKeyDown,
}: Props) {
  const [text, setText] = useState(value);
  const timer = useRef<number>(undefined);
  // Follow the value when it changes from outside (e.g. Reset filters).
  useEffect(() => setText(value), [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const set = (v: string, now = false) => {
    setText(v);
    window.clearTimeout(timer.current);
    if (!debounceMs || now) onChange(v);
    else timer.current = window.setTimeout(() => onChange(v), debounceMs);
  };
  return (
    <label className={clsx('relative block', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
        <IconSearch size={size === 'sm' ? 14 : 16} />
      </span>
      <input
        type="text"
        role="searchbox"
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.stopPropagation();
            set('', true);
          }
          onKeyDown?.(e);
        }}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className={clsx(
          'w-full rounded-control border border-border bg-surface pl-9 pr-9 text-text outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15',
          size === 'sm' ? 'h-9 text-table' : 'h-10 text-body',
        )}
      />
      {text && (
        <button
          type="button"
          aria-label="Clear the search"
          title="Clear"
          onClick={() => set('', true)}
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-text-muted transition hover:bg-primary-soft-100 hover:text-primary"
        >
          <IconClose size={12} />
        </button>
      )}
    </label>
  );
}
