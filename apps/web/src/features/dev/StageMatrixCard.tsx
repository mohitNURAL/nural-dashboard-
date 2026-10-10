// DEV-05: tasks by stage and assignee (or project), heat-shaded by count; the tag toggle filters
// the matrix. Each cell splits into not overdue and overdue (red); both open their tasks.
import { useState } from 'react';
import type { GroupBy } from '../../api/types';
import { Actions, Card, GroupToggle } from '../../components/Card';
import { SearchCombobox } from '../../components/SearchCombobox';
import { StageMatrixTable } from '../../components/StageMatrixTable';
import { useFocusRow } from '../filters/useFilters';
import { useDevMatrix } from './api';
import { rowParams, useDrillTo } from './drill';
import { GROUP_LABEL } from './format';
import { INFO } from '../info';

export function StageMatrixCard({ className }: { className?: string }) {
  const [tag, setTag] = useState<string | null>(null);
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useDevMatrix(tag, by);
  const focus = useFocusRow();
  const drill = useDrillTo();
  // The tag toggle narrows the drill-down too.
  const tagParams: Record<string, string> = tag ? { tag } : {};
  const open = (r: { id: number; name: string }, extra: Record<string, string>, what: string) =>
    drill(
      {
        label: [r.name, what, tag].filter(Boolean).join(' · '),
        preset: 'total',
        params: { ...rowParams(by, r.id), ...tagParams, ...extra },
      },
      { by, id: r.id },
    );

  return (
    <Card
      title={`Tasks by stage and ${by}`}
      info={INFO.matrix}
      className={className}
      loading={isLoading}
      empty={data?.rows.length === 0}
      action={
        <Actions>
          <GroupToggle value={by} onChange={setBy} />
          <SearchCombobox
            label={tag ? 'Tag' : 'Tag: all'}
            single
            className="h-8 w-56"
            options={(data?.tags ?? []).map((t) => ({
              value: t.value,
              label: t.value,
              count: t.count,
            }))}
            selected={tag ? [tag] : []}
            onChange={(v) => setTag(v[0] ?? null)}
          />
        </Actions>
      }
    >
      {data && (
        <StageMatrixTable
          data={data}
          rowLabel={GROUP_LABEL[by]}
          noun="tasks"
          onName={(r) => focus(by, r.id)}
          onOpen={open}
        />
      )}
    </Card>
  );
}
