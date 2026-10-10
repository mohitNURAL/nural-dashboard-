// DEV-03: open tasks by days past deadline, per assignee (or project). Every count opens the
// pending tasks behind it and, for one row, sets that filter.
import { useState } from 'react';
import type { GroupBy } from '../../api/types';
import { AgeingCard } from '../../components/AgeingCard';
import { INFO } from '../info';
import { useDevAssignees } from './api';
import { rowParams, useDrillTo } from './drill';

export function TaskAgeingCard({ className }: { className?: string }) {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useDevAssignees(by);
  const drill = useDrillTo();
  return (
    <AgeingCard
      title="Task ageing, days past deadline"
      info={INFO.ageing}
      noun="tasks"
      className={className}
      by={by}
      onBy={setBy}
      data={data?.ageing}
      loading={isLoading}
      onOpen={(key, label, row) =>
        drill(
          {
            label,
            preset: 'pending',
            params: { ageing: key, ...(row ? rowParams(by, row.id) : {}) },
          },
          row ? { by, id: row.id } : undefined,
        )
      }
    />
  );
}
