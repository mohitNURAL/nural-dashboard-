// QA "Open / pending" popup (2026-10-21): the open issues by project, then who filed them, then
// who has them, like Projects at work. Pending and Overdue at every level; a count closes the
// popup and opens exactly those issues.
import { useApi } from '../../api/queries';
import type { QaOpen, QaOpenCounts } from '../../api/types';
import { useFilterSummary } from '../filters/useFilters';
import { useQaParams } from './api';
import { useOpenPopup } from './openPopup';
import { IssueTreeDialog, type TreeCol } from './IssueTreeDialog';

const COLS: TreeCol<QaOpenCounts>[] = [
  {
    key: 'pending',
    label: 'Pending',
    info: 'Open issues: bugs and feedback not yet resolved (behind QA Backlog) and not on hold.',
  },
  {
    key: 'overdue',
    label: 'Overdue',
    info: 'Open issues whose deadline has passed (IST).',
    bad: true,
    params: { overdue: 'true' },
  },
];

export function OpenDialog({
  onOpen,
}: {
  /** Opens "All issues: Open" narrowed to these params. */
  onOpen: (label: string, params: Record<string, string>) => void;
}) {
  const { open, close } = useOpenPopup();
  const { data, isLoading } = useApi<QaOpen>('/api/qa/open', useQaParams(), { enabled: open });
  const showing = useFilterSummary('qa');
  if (!open) return null;

  return (
    <IssueTreeDialog
      title="Open / pending"
      description="Open issues by project, most overdue first. Open a project for who filed them, and a creator for who has them; click a count for the issues."
      rows={data?.rows}
      isLoading={isLoading}
      cols={COLS}
      totalKey="pending"
      creatorNote={(n) => `with ${n} ${n === 1 ? 'person' : 'people'}`}
      empty="No open issue."
      searchLabel="Search open issues"
      onClose={close}
      onCount={(label, c, params) => onOpen(`Open · ${label} · ${c.label}`, params)}
      onExport={async (kind, rows, q) => {
        const m = await import('./filedExport');
        const title = 'Open / pending issues';
        const note = `Open issues${showing ? ` · ${showing}` : ''}${q ? ` · search “${q}”` : ''}`;
        if (kind === 'xlsx') await m.exportOpenExcel(title, note, rows);
        else m.exportOpenPdf(title, note, rows);
      }}
    />
  );
}
