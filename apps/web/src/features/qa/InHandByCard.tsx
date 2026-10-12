// Tasks in hand by assignee or project on the QA tab: the testing team's pending tasks.
import { useState } from 'react';
import { useApi, withGroupBy } from '../../api/queries';
import type { GroupBy, InHand } from '../../api/types';
import { InHandCard } from '../../components/InHandCard';
import { rowParams } from '../dev/drill';
import { useFocusRow } from '../filters/useFilters';
import { INFO } from '../info';
import { useQaParams } from './api';
import { useOpenIssues } from './issueList';

export function QaInHandCard() {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useApi<InHand>('/api/qa/inhand', withGroupBy(useQaParams(), by));
  const open = useOpenIssues();
  const focus = useFocusRow();
  return (
    <InHandCard
      data={data}
      isLoading={isLoading}
      by={by}
      onBy={setBy}
      info={INFO.qaInHandBy}
      tableId="qa-inhand"
      onFocus={(r) => focus(by, r.id)}
      onOpen={(w, label, row) =>
        open(
          {
            kind: 'testing',
            preset: 'pending',
            label,
            params: { due: w, ...(row ? rowParams(by, row.id) : {}) },
          },
          row ? { by, id: row.id } : undefined,
        )
      }
    />
  );
}
