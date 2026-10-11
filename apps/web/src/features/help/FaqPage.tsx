// Help › FAQs (SRS 20): common questions by topic, searchable, each opening its answer.
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { IconChevron, IconHelp, IconSearch } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { FAQ } from './faq';

export function FaqPage() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(FAQ[0]?.items[0]?.q ?? null);
  const topics = useMemo(
    () =>
      FAQ.map((t) => ({
        ...t,
        items: t.items.filter((i) => !q || `${i.q} ${i.a}`.toLowerCase().includes(q.toLowerCase())),
      })).filter((t) => t.items.length),
    [q],
  );
  return (
    <div className="space-y-4">
      <PageHead
        title="FAQs"
        sub="Answers to the questions people ask most"
        icon={<IconHelp size={24} />}
      >
        <label className="relative block w-72">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
            <IconSearch size={15} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the answers"
            className="h-10 w-full rounded-control border border-border bg-surface pl-8 pr-3 text-body focus:border-primary focus:outline-none"
          />
        </label>
      </PageHead>
      <SortableGroup
        group="faq.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        items={
          topics.length
            ? topics.map((t) => ({
                id: t.topic.toLowerCase().replace(/[^a-z]+/g, '-'),
                className: 'xl:col-span-6',
                node: (
                  <Card title={t.topic}>
                    <ul className="space-y-1.5">
                      {t.items.map((i) => (
                        <li key={i.q} className="rounded-xl border border-border bg-bg/50">
                          <button
                            type="button"
                            aria-expanded={open === i.q}
                            onClick={() => setOpen(open === i.q ? null : i.q)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left font-heading text-button text-primary-dark"
                          >
                            <IconChevron
                              size={13}
                              className={clsx(
                                'shrink-0 text-accent transition-transform',
                                open === i.q && 'rotate-90',
                              )}
                            />
                            {i.q}
                          </button>
                          {open === i.q && (
                            <p className="px-3 pb-3 pl-8 text-table text-text">{i.a}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ),
              }))
            : [
                {
                  id: 'none',
                  className: 'xl:col-span-12',
                  node: (
                    <Card
                      title="No answer found"
                      empty
                      emptyText="Try other words, or ask us in Help › Feedback."
                    />
                  ),
                },
              ]
        }
      />
    </div>
  );
}
