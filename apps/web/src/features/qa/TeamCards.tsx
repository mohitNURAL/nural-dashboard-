// QA-06 testing team workload and QA-07 waiting for retest, by creator.
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import { useMemo } from 'react';
import type { QaIssues, TestingRow } from '../../api/types';
import { Card } from '../../components/Card';
import { DataTable, type Columns } from '../../components/DataTable';
import { fmtDate } from '../dev/format';
import { useQaIssues, useQaTesting } from './api';
import { INFO } from '../info';

const tcol = createColumnHelper<TestingRow>();
const num = { meta: { align: 'right' } } as const;

export function TestingCard({ className }: { className?: string }) {
  const { data, isLoading } = useQaTesting();
  const totals = useMemo(() => {
    const t = { total: 0, pending: 0, done: 0, dueToday: 0, overdue: 0 };
    for (const r of data?.rows ?? []) {
      t.total += r.total;
      t.pending += r.pending;
      t.done += r.done;
      t.dueToday += r.dueToday;
      t.overdue += r.overdue;
    }
    return t;
  }, [data]);

  const columns = useMemo(
    () =>
      [
        tcol.accessor((r) => r.person.name, {
          id: 'name',
          header: 'Tester',
          cell: (c) => (
            <span className="flex items-center gap-2">
              <span className="font-bold text-primary-dark">{c.getValue()}</span>
              {c.row.original.isTester && (
                <span className="rounded-full bg-accent-soft px-1.5 font-heading text-label text-accent-darker">
                  QA team
                </span>
              )}
            </span>
          ),
          footer: 'Total',
        }),
        tcol.accessor('total', { header: 'Total', ...num, footer: () => totals.total }),
        tcol.accessor('pending', { header: 'Pending', ...num, footer: () => totals.pending }),
        tcol.accessor('done', { header: 'Done', ...num, footer: () => totals.done }),
        tcol.accessor('dueToday', { header: 'Due today', ...num, footer: () => totals.dueToday }),
        tcol.accessor('overdue', {
          header: 'Late',
          ...num,
          cell: (c) => (
            <span className={clsx(c.getValue() > 0 && 'font-bold text-bad')}>{c.getValue()}</span>
          ),
          footer: () => totals.overdue,
        }),
        tcol.accessor('nextDeadline', {
          header: 'Next deadline',
          cell: (c) => <span className="whitespace-nowrap">{fmtDate(c.getValue())}</span>,
        }),
      ] as Columns<TestingRow>,
    [totals],
  );

  return (
    <Card
      title="Testing team workload"
      info={INFO.testing}
      className={className}
      loading={isLoading}
      empty={data?.rows.length === 0}
      emptyText="No testing work in these filters."
      action={
        data && (
          <span className="text-table text-text-muted">
            {data.total.toLocaleString('en-IN')} testing tasks
          </span>
        )
      }
    >
      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        rowKey={(r) => r.id}
        initialSorting={[{ id: 'pending', desc: true }]}
        showFooter
        maxHeight={300}
        dense
      />
    </Card>
  );
}

type RetestRow = QaIssues['waitingForRetest']['byCreator'][number];
const rcol = createColumnHelper<RetestRow>();
const retestColumns = [
  rcol.accessor((r) => r.person.name, { id: 'name', header: 'Creator (tester)' }),
  rcol.accessor('count', { header: 'Issues', ...num }),
  rcol.accessor('oldestDays', {
    header: 'Oldest, days',
    ...num,
    cell: (c) => (
      <span className={clsx(c.getValue() > 7 && 'font-bold text-bad')}>{c.getValue()}</span>
    ),
  }),
] as Columns<RetestRow>;

export function RetestCard({ className, onShow }: { className?: string; onShow: () => void }) {
  const { data, isLoading } = useQaIssues();
  const retest = data?.waitingForRetest;

  return (
    <Card
      title="Waiting for retest, by creator"
      info={INFO.retest}
      className={className}
      loading={isLoading}
      empty={retest?.total === 0}
      emptyText="Nothing waiting in QA Backlog or In QA."
      action={
        retest && retest.total > 0 ? (
          <button
            type="button"
            onClick={onShow}
            className="font-heading text-button text-primary hover:underline"
          >
            Show {retest.total} issues
          </button>
        ) : undefined
      }
    >
      {retest && (
        <>
          <p className="mb-2">
            <span className="font-heading text-tile text-primary-dark">{retest.total}</span>{' '}
            <span className="text-text-muted">issues in QA Backlog or In QA</span>
          </p>
          <DataTable
            columns={retestColumns}
            data={retest.byCreator}
            rowKey={(r) => r.id}
            initialSorting={[{ id: 'count', desc: true }]}
            maxHeight={240}
            dense
          />
        </>
      )}
    </Card>
  );
}
