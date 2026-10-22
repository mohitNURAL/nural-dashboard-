import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { fmtLakh, plural } from '../format.js';

const keyOf = (r) => `${r.type}-${r.id}`;
const parseRupees = (s) => Number(String(s).replace(/[₹,\s]/g, ''));

const ISSUES = {
  value: { label: 'No value', chip: 'No value' },
  customer: { label: 'No customer name', chip: 'No customer name' },
};

function PipelineSelect({ row, meta, value, onChange, disabled, disabledReason }) {
  return (
    <select className="mtag-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      title={disabledReason} aria-label={`Assign pipeline for ${row.company ?? row.title}`}>
      {row.categoryId ? <option value={row.categoryId}>Keep: {row.pipeline}</option> : <option value="">Select pipeline…</option>}
      {meta?.families.map((f) => {
        const options = f.categories.filter((c) => c.id !== row.categoryId);
        return options.length ? (
          <optgroup key={f.family} label={f.label}>
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

/** FR-7 Error List — open deals and active leads with no value and/or no customer name. */
export default function ErrorListModal({ filters, meta, canEdit, onClose, onUpdated }) {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [edits, setEdits] = useState({}); // key → { categoryId, value, saving, error }
  const [show, setShow] = useState('all'); // all | value | customer
  const [notice, setNotice] = useState('');

  const reload = useCallback(() => api.missingValue(filters)
    .then((d) => { setRows(d.rows); setLoadError(''); })
    .catch((err) => setLoadError(err.message)), [filters]);

  useEffect(() => { reload(); }, [reload]);

  const edit = (key, patch) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  async function update(row) {
    const key = keyOf(row);
    const state = edits[key] ?? {};
    const body = {};
    if (state.categoryId && state.categoryId !== row.categoryId) body.categoryId = state.categoryId;
    if (state.value) {
      const value = parseRupees(state.value);
      if (!Number.isFinite(value) || value <= 0) return edit(key, { error: 'Enter the value in rupees, e.g. 450000' });
      body.value = value;
    }
    if (!Object.keys(body).length) {
      return edit(key, { error: row.issues.includes('value') ? 'Enter a potential value or choose a pipeline' : 'Add the customer name in Bitrix24 using the link in this row' });
    }

    edit(key, { saving: true, error: '' });
    try {
      await api.updateRecord(row.type, row.id, body);
      // Success only after Bitrix24 confirmed: refresh the list (a row leaves once all its errors are fixed) and the tile.
      setEdits((e) => { const { [key]: _done, ...rest } = e; return rest; });
      await reload();
      onUpdated();
    } catch (err) {
      // FR-7: failed writes keep the row and show the error inline.
      edit(key, { saving: false, error: err.message });
    }
  }

  // Creates (or reuses) a Bitrix24 Contact from the suggested lead and links it to the deal.
  async function applyCustomer(row) {
    const key = keyOf(row);
    edit(key, { applying: true, error: '' });
    try {
      const res = await api.applyCustomer(row.id, row.suggestion.leadId);
      edit(key, { applying: false });
      setNotice(`${row.company}: ${res.created ? `contact #${res.contactId} created` : `existing contact #${res.contactId} reused`} and linked in Bitrix24`);
      await reload();
      onUpdated();
    } catch (err) {
      edit(key, { applying: false, error: err.message });
    }
  }

  const count = (issue) => rows?.filter((r) => r.issues.includes(issue)).length ?? 0;
  const visible = rows?.filter((r) => show === 'all' || r.issues.includes(show)) ?? [];
  const deals = rows?.filter((r) => r.type === 'deal').length ?? 0;
  const leads = (rows?.length ?? 0) - deals;

  return (
    <Modal
      wide
      title="Error List"
      subtitle={rows ? `${plural(rows.length, 'record')} to fix — ${plural(deals, 'open deal')} · ${plural(leads, 'active lead')}` : 'Loading…'}
      onClose={onClose}
    >
      {loadError && <div className="form-error" style={{ marginTop: 12 }}>{loadError}</div>}
      {notice && <div className="stage-note" role="status" style={{ marginTop: 12 }}>{notice}</div>}
      {rows && rows.length === 0 && <div className="empty">No errors — every open deal and active lead has a value and a customer name.</div>}
      {rows && rows.length > 0 && (
        <>
          <div className="error-filters" role="group" aria-label="Show errors">
            <button type="button" className="chip" aria-pressed={show === 'all'} onClick={() => setShow('all')}>All ({rows.length})</button>
            {Object.entries(ISSUES).map(([k, v]) => count(k) > 0 && (
              <button key={k} type="button" className="chip" aria-pressed={show === k} onClick={() => setShow(k)}>{v.label} ({count(k)})</button>
            ))}
          </div>
          <div className="table-scroll">
            <table className="mtable error-table">
              <thead>
                <tr><th>Type</th><th>Company / Customer</th><th>Errors</th><th>Current Pipeline</th><th>Assign Pipeline</th><th>Potential Value (₹)</th><th /></tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const key = keyOf(row);
                  const s = edits[key] ?? {};
                  const leadTagOff = row.type === 'lead' && !meta?.leadTaggingEnabled;
                  const preview = s.value && parseRupees(s.value) > 0 ? `= ${fmtLakh(parseRupees(s.value))}` : '';
                  return [
                    <tr key={key} className={s.error ? 'has-error' : ''}>
                      <td><span className={`type-tag type-${row.type}`}>{row.type}</span></td>
                      <td>
                        <div className="rec-company">
                          {row.link ? <a href={row.link} target="_blank" rel="noreferrer">{row.company ?? row.title}</a> : row.company ?? row.title}
                        </div>
                        <div className="mval-hint">{row.customer ?? 'No customer name'} · {row.stage}</div>
                      </td>
                      <td>
                        <div className="issue-chips">
                          {row.issues.map((i) => (i === 'customer' && row.link
                            ? <a key={i} className="issue-chip" href={row.link} target="_blank" rel="noreferrer" title="Add the customer name in Bitrix24">{ISSUES[i].chip} ↗</a>
                            : <span key={i} className="issue-chip">{ISSUES[i].chip}</span>))}
                        </div>
                        {row.suggestion?.fromTitle && (
                          <div className="suggestion title-hint">
                            <span>
                              Lead <a href={row.link?.replace(/deal\/details\/\d+/, `lead/details/${row.suggestion.leadId}`)} target="_blank" rel="noreferrer">#{row.suggestion.leadId}</a>'s
                              title says <b>{row.suggestion.name}</b> — add as the deal's customer in Bitrix24
                            </span>
                            {row.link && <a className="link-btn" href={row.link} target="_blank" rel="noreferrer">Open deal ↗</a>}
                          </div>
                        )}
                        {row.suggestion && !row.suggestion.fromTitle && (
                          <div className="suggestion">
                            <span>
                              From lead <a href={row.link?.replace(/deal\/details\/\d+/, `lead/details/${row.suggestion.leadId}`)} target="_blank" rel="noreferrer">#{row.suggestion.leadId}</a>:{' '}
                              <b>{row.suggestion.name}</b>
                              {row.suggestion.alternatives > 0 && <span className="mval-hint"> (+{row.suggestion.alternatives} other name)</span>}
                            </span>
                            {canEdit && (
                              <button className="link-btn" onClick={() => applyCustomer(row)} disabled={s.applying}
                                title="Create (or reuse) a Bitrix24 Contact with this name and link it to the deal">
                                {s.applying ? 'Applying…' : 'Apply'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={row.pipeline ? '' : 'untagged'}>{row.pipeline ?? '— untagged —'}</td>
                      <td>
                        <PipelineSelect row={row} meta={meta} value={s.categoryId ?? row.categoryId ?? ''}
                          onChange={(v) => edit(key, { categoryId: v, error: '' })}
                          disabled={!canEdit || s.saving || leadTagOff}
                          disabledReason={leadTagOff ? 'Lead pipeline tagging is not configured yet' : undefined} />
                      </td>
                      <td>
                        <input className="mval-input" inputMode="numeric" value={s.value ?? ''}
                          placeholder={row.value > 0 ? fmtLakh(row.value) : '₹ amount'}
                          onChange={(e) => edit(key, { value: e.target.value, error: '' })}
                          onKeyDown={(e) => e.key === 'Enter' && update(row)}
                          disabled={!canEdit || s.saving} aria-label={`Potential value for ${row.company ?? row.title}`} />
                        <div className="mval-hint">{preview}</div>
                      </td>
                      <td><button className="mbtn-update" onClick={() => update(row)} disabled={!canEdit || s.saving}>{s.saving ? 'Saving…' : 'Update'}</button></td>
                    </tr>,
                    s.error && (
                      <tr key={key + '-err'} className="row-error"><td colSpan={7}><div className="form-error" role="alert">{s.error}</div></td></tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="modal-sub-note">
        Open deals and active leads (In Progress / Hot / Warm) with no potential value, or no customer name. “Update” writes the pipeline
        and value straight to the Bitrix24 record and is logged with your name. Where a deal's lead (or a lead for the same company) has the customer's
        name, “Apply” creates a Bitrix24 Contact from it — or reuses one with that name — and links it to the deal. Otherwise add the name in
        Bitrix24 — the “No customer name ↗” link opens the record. A row leaves this list once all its errors are fixed.
        {!canEdit && ' You have view access — the Pipeline admin role is needed to update records.'}
      </div>
    </Modal>
  );
}
