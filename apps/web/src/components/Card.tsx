// Card (SRS 6): title, optional toggle (table or chart), body, empty state and loading skeleton.
import clsx from 'clsx';
import type { GroupBy } from '@nural/shared';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useInfoContext } from './infoContext';
import { InfoTip } from './InfoTip';
import { useFocusBox } from './layout/useFocusBox';
import { IconClose, IconExcel, IconPdf } from './ui/icons';
import { Tip } from './ui/Tip';

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
  const showing = useInfoContext();
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  // Focus view: export this data point only (loaded on first use).
  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    if (!focus.ref.current) return;
    setBusy(kind);
    try {
      const m = await import('./layout/exportPoint');
      await (kind === 'xlsx' ? m.exportPointExcel : m.exportPointPdf)(
        focus.ref.current,
        title,
        showing,
      );
    } catch (e) {
      toast.error('Export failed', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(null);
    }
  };
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
          'flex min-w-0 flex-col rounded-card border border-border bg-surface p-4 transition-shadow duration-200 hover:shadow-pop',
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
              <span data-no-export className="flex items-center gap-1.5">
                {(['xlsx', 'pdf'] as const).map((k) => (
                  <Tip
                    key={k}
                    label={k === 'xlsx' ? 'Export to Excel' : 'Export to PDF'}
                    hint={k === 'xlsx' ? 'This card’s data only' : 'A picture of this card'}
                    side="bottom"
                  >
                    <button
                      type="button"
                      onClick={() => void exportAs(k)}
                      disabled={!!busy || loading}
                      aria-label={k === 'xlsx' ? 'Export to Excel' : 'Export to PDF'}
                      className={clsx(
                        'grid h-8 w-8 place-items-center rounded-lg border border-border text-text-muted transition hover:border-primary hover:text-primary disabled:opacity-50',
                        busy === k && 'animate-pulse',
                      )}
                    >
                      {k === 'xlsx' ? <IconExcel size={16} /> : <IconPdf size={16} />}
                    </button>
                  </Tip>
                ))}
              </span>
            )}
            {focus.focused && (
              <Tip label="Close" hint="Or press Escape, or click outside" side="bottom">
                <button
                  type="button"
                  data-no-export
                  onClick={focus.close}
                  aria-label="Close focus view"
                  className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100 hover:text-primary"
                >
                  <IconClose size={16} />
                </button>
              </Tip>
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
