// QA-06 testing team workload and QA-07 waiting for retest, by creator.
import type { DevPreset } from '@nural/shared';
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import { useMemo } from 'react';
import type { QaIssues, TestingRow } from '../../api/types';
import { Card } from '../../components/Card';
import { CountButton } from '../../components/CountButton';
import { DataTable, type Columns } from '../../components/DataTable';
import { fmtDate } from '../dev/format';
import { useQaIssues, useQaTesting } from './api';
import { useOpenIssues } from './issueList';
import { INFO } from '../info';

const tcol = createColumnHelper<TestingRow>();
const num = { meta: { align: 'center' } } as const;

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

  const openIssues = useOpenIssues();
  const columns = useMemo(() => {
    // A number opens that tester's testing tasks (and sets the Assignee filter); totals: all.
    const count = (
      key: 'total' | 'pending' | 'done' | 'dueToday' | 'overdue',
      header: string,
      preset: DevPreset,
      tone?: 'bad',
    ) =>
      tcol.accessor(key, {
        header,
        ...num,
        cell: (c) => {
          const r = c.row.original;
          return (
            <CountButton
              n={c.getValue()}
              tone={tone}
              onClick={() =>
                openIssues(
                  {
                    kind: 'testing',
                    preset,
                    label: `${r.person.name} · ${header}`,
                    params: { assignee: String(r.id) },
                  },
                  { by: 'assignee', id: r.id },
                )
              }
            />
          );
        },
        footer: () => (
          <CountButton
            n={totals[key]}
            tone={tone}
            onClick={() => openIssues({ kind: 'testing', preset, label: header })}
          />
        ),
      });
    return [
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
      count('total', 'Total', 'total'),
      count('pending', 'Pending', 'pending'),
      count('done', 'Done', 'completed'),
      count('dueToday', 'Due today', 'dueToday'),
      count('overdue', 'Late', 'overdue', 'bad'),
      tcol.accessor('nextDeadline', {
        header: 'Next deadline',
        cell: (c) => <span className="whitespace-nowrap">{fmtDate(c.getValue())}</span>,
      }),
    ] as Columns<TestingRow>;
  }, [totals, openIssues]);

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
        tableId="qa-testing"
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
/** A creator's count opens the issues they filed that wait in QA Backlog or In QA. */
const retestColumns = (open: (r: RetestRow) => void) =>
  [
    rcol.accessor((r) => r.person.name, { id: 'name', header: 'Creator (tester)' }),
    rcol.accessor('count', {
      header: 'Issues',
      ...num,
      cell: (c) => <CountButton n={c.getValue()} onClick={() => open(c.row.original)} />,
    }),
    rcol.accessor('oldestDays', {
      header: 'Oldest, days',
      ...num,
      cell: (c) => (
        <span className={clsx(c.getValue() > 7 && 'font-bold text-bad')}>{c.getValue()}</span>
      ),
    }),
  ] as Columns<RetestRow>;

export function RetestCard({ className, onShow }: { className?: string; onShow: () => void }) {
  const openIssues = useOpenIssues();
  const columns = useMemo(
    () =>
      retestColumns((r) =>
        openIssues({
          preset: 'retest',
          label: `Filed by ${r.person.name} · waiting for retest`,
          params: { createdBy: String(r.id) },
        }),
      ),
    [openIssues],
  );
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
          <button type="button" onClick={onShow} className="btn btn-link">
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
            tableId="qa-retest"
            columns={columns}
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
