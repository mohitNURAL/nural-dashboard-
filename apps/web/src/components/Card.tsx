// Card (SRS 6): title, optional toggle (table or chart), body, empty state and loading skeleton.
import clsx from 'clsx';
import type { GroupBy } from '@nural/shared';
import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';
import { useFocusBox } from './layout/useFocusBox';

interface Props {
  title: string;
  action?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  className?: string;
  children?: ReactNode;
  /** One-line explanation behind the "i" icon next to the title. */
  info?: string;
}

export function Card({
  title,
  action,
  loading,
  empty,
  emptyText = 'Nothing matches these filters.',
  className,
  children,
  info,
}: Props) {
  // Clicking the title or empty area brings the card to the centre (focus view).
  const focus = useFocusBox<HTMLElement>();
  return (
    <>
      {focus.placeholder}
      {focus.backdrop}
      <section
        ref={focus.ref}
        onClick={focus.onClick}
        style={focus.style}
        role={focus.focused ? 'dialog' : undefined}
        aria-label={focus.focused ? title : undefined}
        className={clsx(
          'flex min-w-0 flex-col rounded-card border border-border bg-surface p-4',
          focus.focused && 'h-auto',
          className,
        )}
      >
        <header className="mb-3 flex min-h-7 items-center justify-between gap-3">
          <h2
            className={clsx(
              'flex items-center gap-1.5 text-h3 text-primary-dark',
              !focus.focused && 'cursor-zoom-in',
            )}
            title={focus.focused ? undefined : 'Click to focus'}
          >
            {title}
            {info && <InfoTip text={info} label={title} />}
          </h2>
          <div className="flex items-center gap-2">
            {action}
            {focus.focused && (
              <button
                type="button"
                onClick={focus.close}
                aria-label="Close focus view"
                title="Close (Esc)"
                className="grid h-7 w-7 place-items-center rounded-control text-text-muted hover:bg-primary-soft-100 hover:text-primary"
              >
                ✕
              </button>
            )}
          </div>
        </header>
        {loading ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-4" style={{ width: `${90 - i * 12}%` }} />
            ))}
          </div>
        ) : empty ? (
          <p className="py-6 text-center text-text-muted">{emptyText}</p>
        ) : (
          children
        )}
      </section>
    </>
  );
}

/** Two-way switch for a card's header, e.g. Chart / Table. */
export function ViewToggle<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <div className="flex rounded-control bg-primary-soft-100 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded px-2 py-0.5 font-heading text-label font-bold',
            value === o.value ? 'bg-surface text-primary shadow-sm' : 'text-text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Assignee / Project switch on the breakdown cards (DEV-02, 03, 05; QA-02, 04, 05). */
export function GroupToggle({
  value,
  onChange,
}: {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
}) {
  return (
    <ViewToggle
      value={value}
      onChange={onChange}
      options={[
        { value: 'assignee', label: 'Assignee' },
        { value: 'project', label: 'Project' },
      ]}
    />
  );
}

/** Card header controls side by side. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
