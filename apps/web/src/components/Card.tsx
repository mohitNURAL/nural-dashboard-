// Card (SRS 6): title, optional toggle (table or chart), body, empty state and loading skeleton.
import clsx from 'clsx';
import type { GroupBy } from '@nural/shared';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  action?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  className?: string;
  children?: ReactNode;
}

export function Card({
  title,
  action,
  loading,
  empty,
  emptyText = 'Nothing matches these filters.',
  className,
  children,
}: Props) {
  return (
    <section
      className={clsx(
        'flex min-w-0 flex-col rounded-card border border-border bg-surface p-4',
        className,
      )}
    >
      <header className="mb-3 flex min-h-7 items-center justify-between gap-3">
        <h2 className="text-h3 text-primary-dark">{title}</h2>
        {action}
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
