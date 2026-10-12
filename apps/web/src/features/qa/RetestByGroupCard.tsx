// Retesting awaited per assignee or project: tasks and issues waiting for QA, in QA Backlog and
// In QA. Every number opens those tasks; a row's number also sets the Assignee or Project filter.
import { stageWithRole } from '@nural/shared';
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { GroupBy, QaRetest } from '../../api/types';
import { Card, GroupToggle } from '../../components/Card';
import { CountButton } from '../../components/CountButton';
import { DataTable, type Columns } from '../../components/DataTable';
import { GROUP_LABEL } from '../dev/format';
import { useFocusRow } from '../filters/useFilters';
import { INFO } from '../info';
import { useQaRetest } from './api';
import { useOpenIssues } from './issueList';

type Row = QaRetest['rows'][number];
type Key = Exclude<keyof QaRetest['totals'], never>;
const col = createColumnHelper<Row>();

/** Each column: its count, header, stage(s) and whether issues, dev tasks or both. */
type Column = { key: Key; header: string; stage?: string; issue?: boolean };
/** Each column: its count, header, stage and whether issues, dev tasks or both; the stages are
 *  the workflow's QA entry and testing stages (QA Backlog and In QA by default). */
function columnsNow(): Column[] {
  const qa = stageWithRole('qaEntry') ?? 'QA entry';
  const test = stageWithRole('testing') ?? 'Testing';
  return [
    { key: 'qaBacklogDev', header: `${qa} · Dev`, stage: qa, issue: false },
    { key: 'qaBacklogIssues', header: `${qa} · Issues`, stage: qa, issue: true },
    { key: 'qaBacklog', header: qa, stage: qa },
    { key: 'inQaDev', header: `${test} · Dev`, stage: test, issue: false },
    { key: 'inQaIssues', header: `${test} · Issues`, stage: test, issue: true },
    { key: 'inQa', header: test, stage: test },
    { key: 'total', header: 'Total' },
  ];
}

export function RetestByGroupCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaRetest(by);
  const openIssues = useOpenIssues();
  const focus = useFocusRow();

  const columns = useMemo(() => {
    const open = (r: Row | null, c: Column) =>
      openIssues(
        {
          kind: 'all',
          preset: 'retest',
          label: [r?.name, 'Retesting awaited', c.header].filter(Boolean).join(' · '),
          params: {
            ...(c.stage ? { stage: c.stage } : {}),
            ...(c.issue === undefined ? {} : { issue: String(c.issue) }),
            ...(r ? { [by]: String(r.id) } : {}),
          },
        },
        r ? { by, id: r.id } : undefined,
      );
    return [
      col.accessor('name', {
        header: GROUP_LABEL[by],
        cell: (c) => (
          <button
            type="button"
            title={`Show only this ${by}`}
            onClick={() => focus(by, c.row.original.id)}
            className="whitespace-nowrap text-left font-bold text-primary-dark hover:text-primary hover:underline"
          >
            {c.getValue()}
          </button>
        ),
        footer: 'Total',
      }),
      ...columnsNow().map((c) =>
        col.accessor(c.key, {
          header: c.header,
          meta: { align: 'right' },
          cell: (x) => (
            <CountButton
              n={x.getValue()}
              className={c.issue === undefined ? 'font-bold' : undefined}
              onClick={() => open(x.row.original, c)}
            />
          ),
          footer: () => <CountButton n={data?.totals[c.key]} onClick={() => open(null, c)} />,
        }),
      ),
    ] as Columns<Row>;
  }, [by, data, openIssues, focus]);

  return (
    <Card
      title={`Retesting awaited by ${by}`}
      info={INFO.retestByGroup}
      className={className}
      loading={isLoading}
      empty={!!data && data.rows.length === 0}
      emptyText="Nothing is waiting for QA in these filters."
      action={<GroupToggle value={by} onChange={setBy} />}
    >
      {data && (
        <DataTable
          columns={columns}
          data={data.rows}
          rowKey={(r) => r.id}
          initialSorting={[{ id: 'total', desc: true }]}
          showFooter
          maxHeight={360}
          dense
        />
      )}
    </Card>
  );
}
