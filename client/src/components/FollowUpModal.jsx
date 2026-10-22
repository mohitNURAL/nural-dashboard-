import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import RecordsTable, { CLIENT_COLUMNS } from './RecordsTable.jsx';
import { api } from '../api.js';
import { fmtLakh, plural } from '../format.js';

// Tabs; "attention" shows Overdue and No Deadline as two separate lists.
const TABS = [
  { key: 'today', label: 'Today', windows: ['today'] },
  { key: 'week', label: 'This Week', windows: ['week'] },
  { key: 'month', label: 'This Month', windows: ['month'] },
  { key: 'quarter', label: 'This Quarter', windows: ['quarter'] },
  { key: 'nextQuarter', label: 'Next Quarter', windows: ['nextQuarter'] },
  { key: 'attention', label: 'Overdue & No Deadline', windows: ['overdue', 'noDeadline'] },
];
const SECTION_TITLES = { overdue: 'Overdue', noDeadline: 'No Deadline' };
const DAY = 86_400_000;

function dueLabel(due, window) {
  if (due == null) return 'No deadline';
  const d = new Date(due);
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  if (window === 'today') return `Today ${time}`;
  const date = d.toLocaleDateString('en-IN', { weekday: window === 'week' ? 'short' : undefined, day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
  return `${date}, ${time}`;
}

const columnsFor = (window) => [
  {
    key: 'followUp',
    label: 'Next Follow-up',
    sortValue: (r) => r.followUp.due,
    cell: (r) => (
      <>
        <div className={window === 'overdue' ? 'due overdue' : window === 'noDeadline' ? 'due none' : 'due'}>
          {dueLabel(r.followUp.due, window)}
          {window === 'overdue' && <span> · {Math.max(1, Math.floor((Date.now() - r.followUp.due) / DAY))}d late</span>}
        </div>
        <div className="mval-hint">{r.followUp.kind}: {r.followUp.subject}{r.followUp.more > 0 && ` (+${r.followUp.more} more)`}</div>
      </>
    ),
  },
  ...CLIENT_COLUMNS.map((c) => (c.key !== 'company' ? c : {
    ...c,
    cell: (r) => <><span className={`type-tag type-${r.type}`}>{r.type}</span> {c.cell(r)}</>,
  })),
];

function windowText(window, summary) {
  if (window === 'quarter') return `this quarter (${summary.quarterLabel})`;
  if (window === 'nextQuarter') return `next quarter (${summary.nextQuarterLabel})`;
  return TABS.find((t) => t.windows.includes(window)).label.toLowerCase();
}

function emptyText(window, summary) {
  if (window === 'overdue') return 'No follow-ups overdue.';
  if (window === 'noDeadline') return 'Every follow-up has a deadline.';
  return `No follow-ups due ${windowText(window, summary)}.`;
}

/** Follow-up popup: customers with a follow-up in each window; one list per window on the tab. */
export default function FollowUpModal({ filters, summary, initialTab = 'today', onClose }) {
  const [tab, setTab] = useState(initialTab);
  const [lists, setLists] = useState(null); // window → list
  const [error, setError] = useState('');
  const { windows } = TABS.find((t) => t.key === tab);

  useEffect(() => {
    setLists(null);
    setError('');
    Promise.all(windows.map((w) => api.followUps(filters, w)))
      .then((results) => setLists(Object.fromEntries(results.map((r) => [r.window, r]))))
      .catch((err) => setError(err.message));
  }, [filters, windows]);

  const single = windows.length === 1 ? lists?.[windows[0]] : null;
  const subtitle = !lists ? (error ? '' : 'Loading…')
    : single ? `${plural(single.count, 'customer')} · ${windowText(windows[0], summary)}${single.totalValue ? ` · ${fmtLakh(single.totalValue)} value` : ''}`
      : windows.map((w) => `${lists[w].count} ${SECTION_TITLES[w].toLowerCase()}`).join(' · ');

  return (
    <Modal wide title="Follow-ups" subtitle={subtitle} onClose={onClose}>
      <div className="error-filters" role="tablist" aria-label="Follow-up window">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" className="chip" aria-selected={tab === t.key} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.key === 'attention' ? `Overdue (${summary.overdue}) · No Deadline (${summary.noDeadline})` : `${t.label} (${summary[t.key]})`}
            {t.key === 'quarter' && <span className="chip-sub"> {summary.quarterLabel.split(' · ')[0]}</span>}
            {t.key === 'nextQuarter' && <span className="chip-sub"> {summary.nextQuarterLabel.split(' · ')[0]}</span>}
          </button>
        ))}
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      {lists && windows.map((w) => (
        <div key={w} className={windows.length > 1 ? 'followup-group' : undefined}>
          {windows.length > 1 && (
            <h3 className={`map-group-title${w === 'overdue' ? ' overdue-title' : ''}`}>{SECTION_TITLES[w]} · {plural(lists[w].count, 'customer')}</h3>
          )}
          {lists[w].count === 0
            ? <div className="empty">{emptyText(w, summary)}</div>
            : <RecordsTable key={w} rows={lists[w].rows} columns={columnsFor(w)} initialSort={{ key: 'followUp', dir: 1 }} />}
        </div>
      ))}
      <div className="modal-sub-note">
        Open Bitrix24 activities (to-dos, tasks, calls, meetings) on leads and deals. One row per customer, showing the next follow-up in the
        window; Responsible Person is who the follow-up is assigned to. Week, Month and This Quarter run from today; quarters follow the
        financial year (Apr–Jun = Q1 … Jan–Mar = Q4). No Deadline lists follow-ups created without a due date — open them in Bitrix24 to set one.
      </div>
    </Modal>
  );
}
