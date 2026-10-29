// DEV-04: speed ranking, how early tasks reached QA Backlog against their deadline. A row sets the
// Assignee filter and opens the tasks it counts (sent to QA, with a deadline).
import clsx from 'clsx';
import { Card } from '../../components/Card';
import { Avatar } from '../../components/chips';
import { CountButton } from '../../components/CountButton';
import type { RankingRow } from '../../api/types';
import { useDevRanking } from './api';
import { useDrillTo } from './drill';
import { daysEarlyText } from './format';
import { INFO } from '../info';

const MEDALS = ['#E0A100', '#9AA3B5', '#B87333'];

export function RankingCard({ className }: { className?: string }) {
  const { data, isLoading } = useDevRanking();
  const ranked = data?.rows.filter((r) => r.rank !== null) ?? [];
  const unranked = data?.rows.filter((r) => r.rank === null) ?? [];
  const drill = useDrillTo();
  const open = (r: RankingRow) =>
    drill(
      {
        label: `${r.person.name} · Fastest to QA Backlog`,
        preset: 'completed',
        params: { assignee: String(r.id), ranked: 'true' },
      },
      { by: 'assignee', id: r.id },
    );

  return (
    <Card
      title="Fastest to QA Backlog"
      info={INFO.ranking}
      className={className}
      loading={isLoading}
      empty={data?.rows.length === 0}
      emptyText="No completed tasks with a deadline in these filters."
    >
      <div className="nural-table-wrap max-h-[300px] overflow-y-auto">
        <table className="nural-table w-full border-separate border-spacing-0 text-table">
          <thead>
            <tr className="font-heading text-label font-bold uppercase text-text-muted">
              <th className="sticky top-0 bg-surface px-2 py-1.5 text-left">#</th>
              <th className="sticky top-0 bg-surface px-2 py-1.5 text-left">Employee</th>
              <th className="sticky top-0 bg-surface px-2 py-1.5 text-center">Tasks</th>
              <th className="sticky top-0 bg-surface px-2 py-1.5 text-center">Avg early</th>
              <th className="sticky top-0 bg-surface px-2 py-1.5 text-center">On time</th>
            </tr>
          </thead>
          <tbody>
            {[...ranked, ...unranked].map((r) => (
              <tr
                key={r.id}
                onClick={() => open(r)}
                title={`Show ${r.person.name}: tasks counted here`}
                className={clsx(
                  'cursor-pointer hover:bg-primary-soft-100',
                  r.rank === null && 'text-text-muted',
                )}
              >
                <td className="border-b border-primary-soft-100 px-2 py-1.5">
                  {r.badge && r.rank ? (
                    <span
                      className="grid h-5 w-5 place-items-center rounded-full font-heading text-label font-bold text-white"
                      style={{ background: MEDALS[r.rank - 1] }}
                      title={`Top ${r.rank}`}
                    >
                      {r.rank}
                    </span>
                  ) : (
                    <span className="pl-1.5 font-heading font-bold">{r.rank ?? '-'}</span>
                  )}
                </td>
                <td className="border-b border-primary-soft-100 px-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <Avatar name={r.person.name} highlight={r.badge} />
                    <span className={clsx(r.rank !== null && 'font-bold text-primary-dark')}>
                      {r.person.name}
                    </span>
                  </span>
                </td>
                <td className="border-b border-primary-soft-100 px-2 py-1.5 text-center tabular-nums">
                  <CountButton n={r.completed} onClick={() => open(r)} />
                </td>
                <td
                  className={clsx(
                    'whitespace-nowrap border-b border-primary-soft-100 px-2 py-1.5 text-center tabular-nums',
                    r.rank !== null && (r.avgDaysEarly >= 0 ? 'text-good' : 'text-bad'),
                  )}
                >
                  {daysEarlyText(r.avgDaysEarly)}
                </td>
                <td className="border-b border-primary-soft-100 px-2 py-1.5 text-center tabular-nums">
                  {r.onTimePct.toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && unranked.length > 0 && (
        <p className="mt-2 text-table text-text-muted">
          Fewer than {data.minTasks} completed tasks with a deadline: listed, not ranked.
        </p>
      )}
    </Card>
  );
}
