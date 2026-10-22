import { useState } from 'react';
import Modal from './Modal.jsx';
import { isoDate } from '../format.js';

/** FR-1.1 — exact date range; every panel re-queries real records for it. */
export default function CustomRangeModal({ initial, onApply, onClose }) {
  const today = new Date();
  const [from, setFrom] = useState(initial.from || isoDate(new Date(today.getTime() - 30 * 86_400_000)));
  const [to, setTo] = useState(initial.to || isoDate(today));
  const [error, setError] = useState('');

  const apply = (e) => {
    e.preventDefault();
    if (!from || !to) return setError('Pick both a start and end date.');
    if (from > to) return setError('Start date must be on or before the end date.');
    onApply(from, to);
  };

  return (
    <Modal small title="Custom Date Range" subtitle="The whole dashboard will reflect this range" onClose={onClose}>
      <form onSubmit={apply} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
        <div>
          <label className="field-label" htmlFor="range-from">From</label>
          <input id="range-from" type="date" className="mval-input full" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="range-to">To</label>
          <input id="range-to" type="date" className="mval-input full" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions">
          <button type="button" className="pill-stroke pill-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="pill-primary pill-btn">Apply range</button>
        </div>
      </form>
    </Modal>
  );
}
