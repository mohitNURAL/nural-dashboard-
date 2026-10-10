// Retesting awaited per assignee or project: tasks and issues waiting for QA, in QA Backlog and
// In QA. Every number opens those tasks; a row's number also sets the Assignee or Project filter.
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
const COLUMNS: { key: Key; header: string; stage?: string; issue?: boolean }[] = [
  { key: 'qaBacklogDev', header: 'QA Backlog · Dev', stage: 'QA Backlog', issue: false },
  { key: 'qaBacklogIssues', header: 'QA Backlog · Issues', stage: 'QA Backlog', issue: true },
  { key: 'qaBacklog', header: 'QA Backlog', stage: 'QA Backlog' },
  { key: 'inQaDev', header: 'In QA · Dev', stage: 'In QA', issue: false },
  { key: 'inQaIssues', header: 'In QA · Issues', stage: 'In QA', issue: true },
  { key: 'inQa', header: 'In QA', stage: 'In QA' },
  { key: 'total', header: 'Total' },
];

export function RetestByGroupCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useQaRetest(by);
  const openIssues = useOpenIssues();
  const focus = useFocusRow();

  const columns = useMemo(() => {
    const open = (r: Row | null, c: (typeof COLUMNS)[number]) =>
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
      ...COLUMNS.map((c) =>
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
