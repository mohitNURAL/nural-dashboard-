// QA "Last filed" popup (2026-10-16): the issues filed on the Last filed day, by project, then
// who filed them, then who they went to. Filed, Bug and Feedback at every level; a count closes
// the popup and opens exactly those issues.
import { useApi } from '../../api/queries';
import type { QaFiled, QaFiledCounts } from '../../api/types';
import { useFilterSummary } from '../filters/useFilters';
import { useQaParams } from './api';
import { useFiledPopup } from './filedPopup';
import { lastFiledText } from './format';
import { IssueTreeDialog, type TreeCol } from './IssueTreeDialog';

const COLS: TreeCol<QaFiledCounts>[] = [
  { key: 'filed', label: 'Filed', info: 'Issues filed (created) that day: bugs and feedback.' },
  {
    key: 'bug',
    label: 'Bug',
    info: 'Issues tagged bug filed that day.',
    bad: true,
    params: { type: 'bug' },
  },
  {
    key: 'feedback',
    label: 'Feedback',
    info: 'Issues tagged feedback filed that day.',
    params: { type: 'feedback' },
  },
];

export function FiledDialog({
  onOpen,
}: {
  /** Opens "All issues" narrowed to these params. */
  onOpen: (label: string, params: Record<string, string>) => void;
}) {
  const { open, close } = useFiledPopup();
  const { data, isLoading } = useApi<QaFiled>('/api/qa/filed', useQaParams(), { enabled: open });
  const showing = useFilterSummary('qa');
  if (!open) return null;

  const day = data?.day ?? null;
  const when = lastFiledText(day ? { date: day, isToday: !!data?.isToday } : null);
  const dayParams: Record<string, string> = day ? { dateField: 'created', from: day, to: day } : {};

  return (
    <IssueTreeDialog
      title={`Last filed: ${when}`}
      description="Issues filed that day, by project. Open a project for who filed them, and a creator for who they went to; click a count for the issues."
      rows={data?.rows}
      isLoading={isLoading}
      cols={COLS}
      totalKey="filed"
      creatorNote={(n) => `filed for ${n} ${n === 1 ? 'person' : 'people'}`}
      empty="No issue was filed that day."
      searchLabel="Search filed issues"
      onClose={close}
      onCount={(label, c, params) =>
        onOpen(`Filed ${when} · ${label} · ${c.label}`, { ...dayParams, ...params })
      }
      onExport={async (kind, rows, q) => {
        const m = await import('./filedExport');
        const title = `Last filed · ${when}`;
        const note = `Issues filed ${when}${showing ? ` · ${showing}` : ''}${q ? ` · search “${q}”` : ''}`;
        if (kind === 'xlsx') await m.exportFiledExcel(title, note, rows);
        else m.exportFiledPdf(title, note, rows);
      }}
    />
  );
}
