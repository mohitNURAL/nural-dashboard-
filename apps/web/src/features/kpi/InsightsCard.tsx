// KPI-09 insights: plain-language findings from the same numbers; each opens its tasks.
import { Card } from '../../components/Card';
import { useKpiInsights } from './api';
import { KPI_INFO } from './info';
import { useOpenKpiList } from './kpiList';

export function InsightsCard({ className }: { className?: string }) {
  const { data, isLoading } = useKpiInsights();
  const openList = useOpenKpiList();

  return (
    <Card
      title="Insights"
      info={KPI_INFO.insights}
      className={className}
      loading={isLoading}
      empty={!!data && data.insights.length === 0}
      emptyText="Nothing stands out in these filters."
    >
      {data && (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {data.insights.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => openList({ label: i.text, params: i.params, info: i.text })}
                className="flex h-full w-full items-start gap-2 rounded-card border border-border p-3 text-left hover:border-primary hover:bg-primary-soft-100"
              >
                <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span>{i.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
