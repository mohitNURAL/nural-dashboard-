import { TopBar } from './components/TopBar';
import { FilterBar } from './features/filters/FilterBar';
import { useTab } from './features/filters/useFilters';
import { TabPlaceholder } from './features/TabPlaceholder';
import { useLiveUpdates } from './hooks/useLiveUpdates';

export default function App() {
  const [tab, setTab] = useTab();
  useLiveUpdates();

  return (
    <div className="min-h-screen">
      <TopBar tab={tab} onTab={setTab} />
      <FilterBar tab={tab} />
      <main className="mx-auto max-w-page px-4 py-4 lg:px-6">
        <TabPlaceholder tab={tab} />
      </main>
    </div>
  );
}
