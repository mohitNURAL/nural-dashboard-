import { useState } from 'react';
import { api } from '../api.js';
import { fmtLakh } from '../format.js';

const GROUPS = [
  { kind: 'dealStage', title: 'Deal Kanban stages', unit: 'deals', mapTo: 'Funnel bar' },
  { kind: 'leadStatus', title: 'Lead statuses', unit: 'leads', mapTo: 'Lead funnel bar' },
  { kind: 'pipeline', title: 'Pipelines', unit: 'deals', mapTo: 'Flagship bucket' },
];
const STATUS = {
  unmapped: { label: 'Unmapped', cls: 'badge-warn' },
  unconfirmed: { label: 'Auto: Nural Custom', cls: 'badge-sample' },
  manual: { label: 'Mapped manually', cls: 'badge-live' },
};
const ORDER = { unmapped: 0, unconfirmed: 1, manual: 2 };
const keyOf = (i) => `${i.kind}:${i.id}`;

function Row({ item, options, unit, canEdit, onSave }) {
  const [value, setValue] = useState(item.current ?? '');
  const [state, setState] = useState({ saving: false, error: '' });
  const st = STATUS[item.status];

  const save = async (next) => {
    setState({ saving: true, error: '' });
    try {
      await onSave({ kind: item.kind, id: item.id, value: next });
    } catch (err) {
      setState({ saving: false, error: err.message });
      return;
    }
    setState({ saving: false, error: '' });
  };

  // Confirming the automatic Nural Custom placement is a valid save with no change of value.
  const unchanged = item.status === 'manual' ? value === item.current : item.status === 'unmapped' && !value;
  return (
    <>
      <tr className={state.error ? 'has-error' : ''}>
        <td>
          <div className="map-name">{item.name}</div>
          <div className="mval-hint">{item.context} · {item.id}</div>
        </td>
        <td className="num">{item.count} {unit}{item.value ? <div className="mval-hint">{fmtLakh(item.value)} open</div> : null}</td>
        <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
        <td>
          <select className="mtag-select" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit || state.saving}
            aria-label={`Map ${item.name} to`}>
            {item.status === 'unmapped' && <option value="">Choose…</option>}
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </td>
        <td>
          <div className="map-actions">
            <button className="mbtn-update" onClick={() => save(value)} disabled={!canEdit || state.saving || unchanged}>
              {state.saving ? 'Saving…' : item.status === 'unconfirmed' && value === item.current ? 'Confirm' : 'Save'}
            </button>
            {item.status === 'manual' && canEdit && (
              <button className="link-btn" onClick={() => save(null)} disabled={state.saving} title="Go back to the automatic rule">Reset</button>
            )}
          </div>
        </td>
      </tr>
      {state.error && <tr className="row-error"><td colSpan={5}><div className="form-error" role="alert">{state.error}</div></td></tr>}
    </>
  );
}

/** Lists Kanban stages, lead statuses and pipelines the mapping can't place, with an update control per row. */
export default function DataMapping({ issues, canEdit, onSaved }) {
  const [showManual, setShowManual] = useState(false);
  if (!issues) return null;
  const { summary, items, options } = issues;
  const pending = summary.unmapped + summary.unconfirmed;

  const save = async (change) => onSaved(await api.updateMapping(change));

  return (
    <section className="panel" id="data-mapping">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Data Mapping</h2>
          <div className="panel-sub">
            Kanban stages, lead statuses and pipelines the dashboard can't place automatically. Choices are saved in the dashboard only —
            nothing changes in Bitrix24.
          </div>
        </div>
        {pending
          ? <span className="badge badge-warn">{pending} need attention</span>
          : <span className="badge badge-live">All mapped</span>}
      </div>

      {summary.unmapped > 0 && (
        <div className="stage-note map-impact">
          {summary.affectedDeals > 0 && `${summary.affectedDeals} deals`}
          {summary.affectedDeals > 0 && summary.affectedLeads > 0 && ' and '}
          {summary.affectedLeads > 0 && `${summary.affectedLeads} leads`} currently sit in Unmapped. They are counted in the totals but not in a
          funnel bar until mapped.
        </div>
      )}

      {GROUPS.map((g) => {
        const rows = items[g.kind]
          .filter((i) => showManual || i.status !== 'manual')
          .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.count - a.count);
        if (!rows.length) return null;
        return (
          <div key={g.kind} className="map-group">
            <h3 className="map-group-title">{g.title}</h3>
            <div className="table-scroll">
              <table className="mtable">
                <thead>
                  <tr><th>Name on Bitrix24</th><th className="num">Records</th><th>Status</th><th>{g.mapTo}</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <Row key={`${keyOf(i)}:${i.status}:${i.current}`} item={i} options={options[g.kind]} unit={g.unit} canEdit={canEdit} onSave={save} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {pending === 0 && !showManual && <div className="empty">Every Kanban stage, lead status and pipeline on the portal maps to a dashboard bar.</div>}

      <div className="map-footer">
        {summary.manual > 0 && (
          <button className="link-btn" onClick={() => setShowManual((s) => !s)}>
            {showManual ? 'Hide manual mappings' : `Show ${summary.manual} manual mapping${summary.manual === 1 ? '' : 's'}`}
          </button>
        )}
        {!canEdit && <span className="panel-sub">You have view access — the Pipeline admin role is needed to change mappings.</span>}
      </div>
    </section>
  );
}
