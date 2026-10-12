// Tasks in hand by assignee or project on the Development tab: pending tasks, deadline ahead.
import { useState } from 'react';
import { useApi, withGroupBy } from '../../api/queries';
import type { GroupBy, InHand } from '../../api/types';
import { InHandCard } from '../../components/InHandCard';
import { useFocusRow } from '../filters/useFilters';
import { INFO } from '../info';
import { useDevParams } from './api';
import { rowParams, useDrillTo } from './drill';

export function DevInHandCard() {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useApi<InHand>('/api/dev/inhand', withGroupBy(useDevParams(), by));
  const drill = useDrillTo();
  const focus = useFocusRow();
  return (
    <InHandCard
      data={data}
      isLoading={isLoading}
      by={by}
      onBy={setBy}
      info={INFO.inHandBy}
      tableId="dev-inhand"
      onFocus={(r) => focus(by, r.id)}
      onOpen={(w, label, row) =>
        drill(
          { label, preset: 'pending', params: { due: w, ...(row ? rowParams(by, row.id) : {}) } },
          row ? { by, id: row.id } : undefined,
        )
      }
    />
  );
}
