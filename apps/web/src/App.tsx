import { TaskDrawer } from './components/TaskDrawer';
import { TopBar } from './components/TopBar';
import { DevTab } from './features/dev/DevTab';
import { FilterBar } from './features/filters/FilterBar';
import { useMe } from './api/me';
import { useTab } from './features/filters/useFilters';
import { KpiTab } from './features/kpi/KpiTab';
import { QaTab } from './features/qa/QaTab';
import { useLiveUpdates } from './hooks/useLiveUpdates';

export default function App() {
  const [urlTab, setTab] = useTab();
  const { data: me } = useMe();
  // NFR-4: the KPI tab is for full access only; members open on Development.
  const kpiAllowed = me?.full ?? false;
  const tab = urlTab === 'kpi' && !kpiAllowed ? 'dev' : urlTab;
  useLiveUpdates();

  return (
    <div className="min-h-screen">
      <TopBar tab={tab} onTab={setTab} kpiAllowed={kpiAllowed} />
      <FilterBar tab={tab} />
      <main className="mx-auto max-w-page px-4 py-4 lg:px-6">
        {!me ? null : tab === 'kpi' ? <KpiTab /> : tab === 'dev' ? <DevTab /> : <QaTab />}
      </main>
      <TaskDrawer />
    </div>
  );
}
