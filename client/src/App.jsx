import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, filterQuery, setToken, streamUrl } from './api.js';
import TopBar from './components/TopBar.jsx';
import Freshness from './components/Freshness.jsx';
import FilterBar from './components/FilterBar.jsx';
import KpiRow from './components/KpiRow.jsx';
import LeadFunnel from './components/LeadFunnel.jsx';
import DealFunnel from './components/DealFunnel.jsx';
import LeadSources from './components/LeadSources.jsx';
import PipelineBreakdown from './components/PipelineBreakdown.jsx';
import TrendChart from './components/TrendChart.jsx';
import DealsAtRisk from './components/DealsAtRisk.jsx';
import ErrorListModal from './components/ErrorListModal.jsx';
import RecordsModal from './components/RecordsModal.jsx';
import FollowUpModal from './components/FollowUpModal.jsx';
import FollowUpRow from './components/FollowUpRow.jsx';
import CustomRangeModal from './components/CustomRangeModal.jsx';
import SignIn from './components/SignIn.jsx';
import DataMapping from './components/DataMapping.jsx';
import { exportCsv } from './exportCsv.js';

const VIEW_KEY = 'nural.crm.savedView';
const DEFAULT_FILTERS = { pipeline: 'all', period: 'quarter', from: '', to: '' };
// Live updates arrive over the /api/stream connection; this slow poll is only a fallback.
const FALLBACK_POLL_MS = 60_000;

function initialFilters() {
  const q = new URLSearchParams(window.location.search);
  if (q.has('pipeline') || q.has('period')) {
    return { ...DEFAULT_FILTERS, ...Object.fromEntries(['pipeline', 'period', 'from', 'to'].filter((k) => q.has(k)).map((k) => [k, q.get(k)])) };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    if (saved) return { ...DEFAULT_FILTERS, ...saved };
  } catch { /* ignore */ }
  return DEFAULT_FILTERS;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = needs sign-in
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null);
  const [mappingIssues, setMappingIssues] = useState(null);
  const [modal, setModal] = useState(null); // 'missing' | 'range' | null
  const [followUpTab, setFollowUpTab] = useState(null); // follow-up window whose list is open
  const [drill, setDrill] = useState(null); // { title, query } — client list behind a card
  const [toast, setToast] = useState('');
  const versionSeen = useRef(null);
  const loadRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }, []);

  const handleAuthError = useCallback((err) => {
    if (err instanceof ApiError && err.status === 401) {
      setToken('');
      setUser(null);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    api.me().then(setUser).catch((err) => (handleAuthError(err) ? null : setError(err.message)));
  }, [handleAuthError]);

  // `silent` refreshes (live updates) swap numbers in place without dimming the page.
  const load = useCallback((signal, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    return api.dashboard(filters, signal)
      .then((d) => {
        setData(d);
        setError(null);
        versionSeen.current = d.sync?.version ?? null;
      })
      .catch((err) => {
        if (err.name === 'AbortError' || handleAuthError(err)) return;
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [filters, handleAuthError]);

  // FR-1.4: filters re-query the backend without a reload.
  useEffect(() => {
    if (!user) return;
    const ctrl = new AbortController();
    load(ctrl.signal);
    window.history.replaceState(null, '', `?${filterQuery(filters)}`);
    return () => ctrl.abort();
  }, [user, filters, load]);

  useEffect(() => {
    if (!user) return;
    api.pipelines().then(setMeta).catch(() => {});
  }, [user, data?.sync?.lastFullAt]); // pipelines only change on a full sync

  // Unmapped stages/statuses can appear whenever data changes (e.g. a new Kanban column).
  useEffect(() => {
    if (!user) return;
    api.mappingIssues().then(setMappingIssues).catch(() => {});
  }, [user, data?.sync?.version]);

  const pendingMappings = mappingIssues ? mappingIssues.summary.unmapped + mappingIssues.summary.unconfirmed : 0;

  loadRef.current = load;

  // Live updates: the server pushes a status after every Bitrix check; reload
  // the panels only when the data version moved.
  useEffect(() => {
    if (!user) return;
    const onStatus = (s) => {
      setData((d) => (d ? { ...d, sync: s } : d));
      if (versionSeen.current != null && s.version !== versionSeen.current) {
        versionSeen.current = s.version;
        loadRef.current(undefined, { silent: true });
      }
    };
    const stream = new EventSource(streamUrl());
    stream.addEventListener('sync', (e) => onStatus(JSON.parse(e.data)));
    const poll = setInterval(() => api.lastSync().then(onStatus).catch(() => {}), FALLBACK_POLL_MS);
    return () => {
      stream.close();
      clearInterval(poll);
    };
  }, [user]);

  if (user === undefined) return <div className="center-card"><div className="panel-sub">Loading…</div></div>;
  if (user === null) return <SignIn onSignedIn={(u) => setUser(u)} />;

  const saveView = () => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(filters));
      showToast('View saved — it opens by default next time');
    } catch {
      showToast('Could not save view in this browser');
    }
  };

  const syncNow = async () => {
    try {
      await api.syncNow();
      await load();
      showToast('Synced with Bitrix24');
    } catch (err) {
      showToast(err.message);
    }
  };

  return (
    <div className="wrap">
      <TopBar
        user={user}
        onExport={() => data && exportCsv(data)}
        onSaveView={saveView}
        onSyncNow={user.role === 'admin' ? syncNow : null}
        onSignOut={() => { setToken(''); setUser(null); }}
      />
      <Freshness sync={data?.sync} />
      <FilterBar
        filters={filters}
        label={data ? `Showing: ${data.filters.pipelineLabel} · ${data.filters.periodLabel}` : ''}
        onChange={(f) => setFilters((cur) => ({ ...cur, ...f }))}
        onCustom={() => setModal('range')}
      />

      {pendingMappings > 0 && (
        <div className="mapping-alert" role="status">
          <span>
            <b>{pendingMappings} data point{pendingMappings === 1 ? '' : 's'} need mapping</b>
            {mappingIssues.summary.unmapped > 0 &&
              ` — ${mappingIssues.summary.affectedDeals} deals and ${mappingIssues.summary.affectedLeads} leads are not in a funnel bar`}
          </span>
          <a className="link-btn" href="#data-mapping">Review</a>
        </div>
      )}

      {error && !data && <div className="panel"><div className="panel-title">Dashboard unavailable</div><div className="panel-sub">{error}</div></div>}

      {data && (
        <div className={loading ? 'loading' : ''} aria-busy={loading}>
          {error && <div className="freshness stale"><span className="dot" />Latest refresh failed: {error}. Showing the previous result.</div>}
          <KpiRow
            kpis={data.kpis}
            filters={data.filters}
            onMissingClick={() => setModal('missing')}
            onDrill={(view) => setDrill({
              title: `${view === 'at-risk' ? 'Deals at Risk' : 'Open Deals'} · ${data.filters.pipelineLabel}`,
              query: { view },
            })}
          />
          <FollowUpRow summary={data.kpis.followUps} onOpen={setFollowUpTab} />
          <div className="row two">
            <LeadFunnel
              funnel={data.leadFunnel}
              onSelect={(s) => setDrill({ title: `Lead Funnel · ${s.label}`, query: { view: 'lead-stage', bucket: s.key } })}
            />
            <DealFunnel
              funnel={data.dealFunnel}
              onSelect={(s) => setDrill({
                title: `Deal Stage · ${s.label}${s.key === 'won' || s.key === 'lost' ? ` · ${data.filters.periodLabel}` : ''}`,
                query: { view: 'deal-stage', bucket: s.key },
              })}
            />
          </div>
          <div className="row">
            <LeadSources sources={data.leadSources} />
          </div>
          <div className="row">
            <PipelineBreakdown
              breakdown={data.pipelineBreakdown}
              onSelect={(p) => setDrill({
                title: `Open Deals · ${p.label}`,
                query: p.categoryId ? { view: 'pipeline', family: p.family, categoryId: p.categoryId } : { view: 'pipeline', family: p.family },
              })}
            />
          </div>
          <div className="row two">
            <TrendChart trend={data.trend} period={data.filters.period} />
            <DealsAtRisk risk={data.dealsAtRisk} />
          </div>
          <div className="row">
            <DataMapping
              issues={mappingIssues}
              canEdit={user.role === 'admin'}
              onSaved={(next) => {
                setMappingIssues(next);
                load(undefined, { silent: true });
                showToast('Mapping saved — dashboard updated');
              }}
            />
          </div>
        </div>
      )}

      <div className="footer">POWERED BY NURAL</div>

      {modal === 'range' && (
        <CustomRangeModal
          initial={filters}
          onClose={() => setModal(null)}
          onApply={(from, to) => { setFilters((f) => ({ ...f, period: 'custom', from, to })); setModal(null); }}
        />
      )}
      {drill && <RecordsModal title={drill.title} filters={filters} query={drill.query} onClose={() => setDrill(null)} />}
      {followUpTab && data && (
        <FollowUpModal filters={filters} summary={data.kpis.followUps} initialTab={followUpTab} onClose={() => setFollowUpTab(null)} />
      )}
      {modal === 'missing' && (
        <ErrorListModal
          filters={filters}
          meta={meta}
          canEdit={user.role === 'admin'}
          onClose={() => setModal(null)}
          onUpdated={() => load()}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
