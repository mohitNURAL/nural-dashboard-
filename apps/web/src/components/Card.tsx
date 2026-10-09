// Card (SRS 6): title, optional action, body, loading skeleton and empty state.
import clsx from 'clsx';
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
    <section className={clsx('rounded-card border border-border bg-surface p-4', className)}>
      <header className="mb-3 flex items-center justify-between gap-3">
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
