// Tasks in hand by assignee or project on the KPI tab: KPI open tasks, deadline ahead.
import { useState } from 'react';
import { useApi, withGroupBy } from '../../api/queries';
import type { GroupBy, InHand } from '../../api/types';
import { InHandCard } from '../../components/InHandCard';
import { useFocusRow } from '../filters/useFilters';
import { useKpiParams } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';

export function KpiInHandCard() {
  const [by, setBy] = useState<GroupBy>('assignee');
  const { data, isLoading } = useApi<InHand>('/api/kpi/inhand', withGroupBy(useKpiParams(), by));
  const open = useOpenKpiList();
  const focus = useFocusRow();
  return (
    <InHandCard
      data={data}
      isLoading={isLoading}
      by={by}
      onBy={setBy}
      info={KPI_INFO.inHandBy}
      tableId="kpi-inhand"
      onFocus={(r) => focus(by, r.id)}
      onOpen={(w, label, row) =>
        open(
          {
            label,
            params: { kpi: 'open', due: w, ...(row ? { [by]: String(row.id) } : {}) },
            info: KPI_INFO.inHand,
          },
          row ? { by, id: row.id } : undefined,
        )
      }
    />
  );
}
