import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import RecordsTable, { CLIENT_COLUMNS } from './RecordsTable.jsx';
import { api } from '../api.js';
import { fmtLakh, plural } from '../format.js';

/** Drill-down: the clients behind a dashboard number. */
export default function RecordsModal({ title, filters, query, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api.records(filters, query).then(setData).catch((err) => setError(err.message));
  }, [filters, query]);

  // Deals at Risk: show how long each deal has sat in its stage.
  const columns = useMemo(() => (query.view !== 'at-risk' ? CLIENT_COLUMNS : CLIENT_COLUMNS.map((c) => (c.key !== 'stage' ? c : {
    ...c,
    cell: (r) => <>{r.stage}{r.daysInStage != null && <div className="mval-hint">{r.daysInStage} days in stage</div>}</>,
  }))), [query.view]);
  const unit = data?.entity === 'lead' ? 'lead' : 'deal';

  return (
    <Modal
      wide
      title={title}
      subtitle={data ? `${plural(data.count, unit)}${data.totalValue ? ` · ${fmtLakh(data.totalValue)} total value` : ''}` : error ? '' : 'Loading…'}
      onClose={onClose}
    >
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      {data && data.count === 0 && <div className="empty">No {unit}s here right now.</div>}
      {data && data.count > 0 && <RecordsTable rows={data.rows} columns={columns} />}
      <div className="modal-sub-note">
        Age is days since the {unit} was created. Click a column to sort; click a company to open the record in Bitrix24.
      </div>
    </Modal>
  );
}
