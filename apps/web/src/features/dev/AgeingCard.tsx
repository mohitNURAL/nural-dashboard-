// DEV-03: open tasks by days past deadline. Chart: one bar per bucket; Table: buckets per assignee.
import type { AgeingBucket } from '../../api/types';
import { BucketCard, type Bucket } from '../../components/BucketCard';
import { useDevAssignees } from './api';

/** Teal for not due, then deepening reds as tasks get later. */
const BUCKETS: Bucket<AgeingBucket | 'noDeadline'>[] = [
  { key: 'notDue', label: 'Not due', color: '--accent-dark' },
  { key: '0-2', label: '0 to 2', color: '--bad-soft' },
  { key: '3-7', label: '3 to 7', color: '#EE7C7E' },
  { key: '8-14', label: '8 to 14', color: '--bad' },
  { key: '15+', label: 'over 14', color: '--bad-dark' },
];
const EXTRA: Bucket<AgeingBucket | 'noDeadline'>[] = [
  { key: 'noDeadline', label: 'No deadline', color: '' },
];

export function AgeingCard({ className }: { className?: string }) {
  const { data, isLoading } = useDevAssignees();
  const noDeadline = data?.ageing.totals.noDeadline ?? 0;

  return (
    <BucketCard
      title="Task ageing, days past deadline"
      chartLabel="Open tasks by days past deadline"
      className={className}
      buckets={BUCKETS}
      extraColumns={EXTRA}
      totals={data?.ageing.totals}
      rows={data?.ageing.rows}
      loading={isLoading}
      emptyText="No open tasks in these filters."
      footnote={
        noDeadline > 0 && (
          <p className="text-table text-text-muted">
            Plus {noDeadline} open {noDeadline === 1 ? 'task' : 'tasks'} with no deadline.
          </p>
        )
      }
    />
  );
}
