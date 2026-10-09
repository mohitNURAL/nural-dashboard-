// Skeleton layout of each tab from the SRS 6 wireframes. Milestones 7 (Development) and
// 8 (QA) replace these blocks with live cards.
import clsx from 'clsx';
import { Card } from '../components/Card';
import type { Tab } from './filters/toParams';

const LAYOUT = {
  dev: {
    tiles: ['Total tasks', 'Sent to QA', 'Pending', 'Ready', 'Deployed', 'Overdue', 'Done today'],
    statusTile: 'Overdue',
    cards: [
      ['Assignee-wise tasks', 'lg:col-span-7'],
      ['Pending vs Done', 'lg:col-span-5'],
      ['Task ageing, days past deadline', 'lg:col-span-6'],
      ['Fastest to QA Backlog', 'lg:col-span-6'],
      ['Tasks by stage and assignee', 'lg:col-span-12'],
    ],
    accordions: ['Tasks due today', 'Overdue tasks', 'All tasks'],
  },
  qa: {
    tiles: ['Total issues filed', 'Open / waiting', 'Last filed', 'Rework issues'],
    statusTile: 'Rework issues',
    cards: [
      ['Issues by assignee', 'lg:col-span-6'],
      ['Issues by Kanban stage', 'lg:col-span-6'],
      ['Testing team workload', 'lg:col-span-6'],
      ['Waiting for retest, by creator', 'lg:col-span-6'],
      ['Age of open issues', 'lg:col-span-6'],
      ['Rework by developer', 'lg:col-span-6'],
    ],
    accordions: ['Latest filed issues', 'All issues (bug and feedback)'],
  },
} as const;

export function TabPlaceholder({ tab }: { tab: Tab }) {
  const l = LAYOUT[tab];
  return (
    <div className="space-y-4">
      <div
        className={clsx(
          'grid grid-cols-2 gap-3 sm:grid-cols-4',
          l.tiles.length === 7 ? 'lg:grid-cols-7' : 'lg:grid-cols-4',
        )}
      >
        {l.tiles.map((t) => (
          <div
            key={t}
            className={clsx(
              'rounded-card border bg-surface p-3',
              t === l.statusTile ? 'border-bad' : 'border-border',
            )}
          >
            <div className="font-heading text-label uppercase text-text-muted">{t}</div>
            <div className="skeleton mt-2 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {l.cards.map(([title, span]) => (
          <Card key={title} title={title} loading className={span} />
        ))}
      </div>
      {l.accordions.map((a) => (
        <div
          key={a}
          className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3"
        >
          <span className="text-text-muted">›</span>
          <span className="font-heading text-h3 text-primary-dark">{a}</span>
        </div>
      ))}
    </div>
  );
}
