import { TaskDrawer } from './components/TaskDrawer';
import { TopBar } from './components/TopBar';
import { DevTab } from './features/dev/DevTab';
import { FilterBar } from './features/filters/FilterBar';
import { SupportTab } from './features/support/SupportTab';
import { useMe, useSessionEnd } from './api/me';
import { useTheme } from './store/theme';
import { useTab } from './features/filters/useFilters';
import { KpiTab } from './features/kpi/KpiTab';
import { QaTab } from './features/qa/QaTab';
import { useLiveUpdates } from './hooks/useLiveUpdates';
import { useNewVersion } from './hooks/useNewVersion';

export default function App() {
  const [urlTab, setTab] = useTab();
  const { data: me } = useMe();
  // Charts read the theme's colours when they draw: a theme change redraws the tab.
  const theme = useTheme((s) => s.resolved);
  // NFR-4: the KPI tab is for full access only; members open on Development.
  const kpiAllowed = me?.full ?? false;
  const supportAllowed = me?.support ?? false;
  // KPI is for full access; Support for the support team and management. Others open on Development.
  const tab =
    (urlTab === 'kpi' && !kpiAllowed) || (urlTab === 'support' && !supportAllowed) ? 'dev' : urlTab;
  useLiveUpdates();
  useNewVersion();
  useSessionEnd();

  return (
    <div className="min-h-screen">
      <TopBar tab={tab} onTab={setTab} kpiAllowed={kpiAllowed} supportAllowed={supportAllowed} />
      {tab !== 'support' && <FilterBar tab={tab} />}
      <main key={theme} className="mx-auto max-w-page px-4 py-4 lg:px-6">
        {!me ? null : tab === 'kpi' ? (
          <KpiTab />
        ) : tab === 'dev' ? (
          <DevTab />
        ) : tab === 'support' ? (
          <SupportTab />
        ) : (
          <QaTab />
        )}
      </main>
      <TaskDrawer />
    </div>
  );
}
