import { TaskDrawer } from './components/TaskDrawer';
import { TopBar } from './components/TopBar';
import { DevTab } from './features/dev/DevTab';
import { FilterBar } from './features/filters/FilterBar';
import { useTab } from './features/filters/useFilters';
import { KpiTab } from './features/kpi/KpiTab';
import { QaTab } from './features/qa/QaTab';
import { useLiveUpdates } from './hooks/useLiveUpdates';

export default function App() {
  const [tab, setTab] = useTab();
  useLiveUpdates();

  return (
    <div className="min-h-screen">
      <TopBar tab={tab} onTab={setTab} />
      <FilterBar tab={tab} />
      <main className="mx-auto max-w-page px-4 py-4 lg:px-6">
        {tab === 'kpi' ? <KpiTab /> : tab === 'dev' ? <DevTab /> : <QaTab />}
      </main>
      <TaskDrawer />
    </div>
  );
}
