import { useEffect } from 'react';
import clsx from 'clsx';
import { TaskDrawer } from './components/TaskDrawer';
import { TopBar } from './components/TopBar';
import { ActionDock } from './components/shell/ActionDock';
import { allowedPage, firstPage, navFor } from './components/shell/nav';
import { useDrawer } from './components/shell/drawerStore';
import { ConfirmHost } from './components/ui/ConfirmDialog';
import { trackClicks } from './components/spotlight/spotlight';
import { AppFooter } from './components/shell/AppFooter';
import { SideDrawer } from './components/shell/SideDrawer';
import { DevTab } from './features/dev/DevTab';
import { AccessPage } from './features/employees/AccessPage';
import { OrgTree } from './features/employees/OrgTree';
import { PeoplePage } from './features/employees/PeoplePage';
import { FilterBar } from './features/filters/FilterBar';
import { ConnectionsPage } from './features/integrations/ConnectionsPage';
import { MailingPage } from './features/integrations/MailingPage';
import { FinancePage } from './features/finance/FinancePage';
import { DocsPage } from './features/help/DocsPage';
import { FaqPage } from './features/help/FaqPage';
import { FeedbackNudge } from './features/help/FeedbackNudge';
import { DailyPrompt } from './features/daily/DailyPrompt';
import { DailyUpdatePage } from './features/daily/DailyUpdatePage';
import { FeedbackPage } from './features/help/FeedbackPage';
import { InsightsPage } from './features/insights/InsightsPage';
import { isDashboardTab } from './features/filters/toParams';
import { SupportTab } from './features/support/SupportTab';
import { useMe, useSessionEnd } from './api/me';
import { useTheme } from './store/theme';
import { useTab } from './features/filters/useFilters';
import { KpiTab } from './features/kpi/KpiTab';
import { QaTab } from './features/qa/QaTab';
import { useApplyWorkflow } from './features/projects/api';
import { ProjectTypesPage } from './features/projects/ProjectTypesPage';
import { WorkflowPage } from './features/projects/WorkflowPage';
import { useLiveUpdates } from './hooks/useLiveUpdates';
import { useNewVersion } from './hooks/useNewVersion';
import { useGuidedTour, useNewTabs } from './features/tour/useGuidedTour';

export default function App() {
  const [urlTab, setTab] = useTab();
  const { data: me } = useMe();
  // Charts read the theme's colours when they draw: a theme change redraws the tab.
  const theme = useTheme((s) => s.resolved);
  const pinned = useDrawer((s) => s.pinned);
  // Each page needs its right (the server enforces the same); anything else opens Development.
  const tab = !me || allowedPage(me, urlTab) ? urlTab : firstPage(me);
  useLiveUpdates();
  // The workflow every stage rule follows (SRS 22): in place before the pages draw.
  const workflowReady = useApplyWorkflow(!!me);
  useNewVersion();
  useSessionEnd();
  useGuidedTour(tab, setTab);
  const newTabs = useNewTabs();
  // Which data point a click came from, for the spotlight (components/spotlight).
  useEffect(() => trackClicks(), []);

  return (
    <div className="min-h-screen">
      <TopBar tab={tab} onTab={setTab} />
      <ConfirmHost />
      <SideDrawer groups={navFor(me)} tab={tab} onTab={setTab} newTabs={newTabs} />
      <div
        className={clsx(
          'transition-[padding] duration-200 ease-out md:pr-14',
          pinned ? 'md:pl-[264px]' : 'md:pl-16',
        )}
      >
        {isDashboardTab(tab) && tab !== 'support' && <FilterBar tab={tab} />}
        <main key={theme} className="mx-auto max-w-page px-4 py-4 lg:px-6">
          {!me || !workflowReady ? null : tab === 'kpi' ? (
            <KpiTab />
          ) : tab === 'dev' ? (
            <DevTab />
          ) : tab === 'support' ? (
            <SupportTab />
          ) : tab === 'insights' ? (
            <InsightsPage />
          ) : tab === 'org' ? (
            <OrgTree />
          ) : tab === 'people' ? (
            <PeoplePage />
          ) : tab === 'connections' ? (
            <ConnectionsPage />
          ) : tab === 'mailing' ? (
            <MailingPage />
          ) : tab === 'workflow' ? (
            <WorkflowPage />
          ) : tab === 'projecttypes' ? (
            <ProjectTypesPage />
          ) : tab === 'feedback' ? (
            <FeedbackPage />
          ) : tab === 'docs' ? (
            <DocsPage />
          ) : tab === 'faq' ? (
            <FaqPage />
          ) : tab === 'finance' ? (
            <FinancePage />
          ) : tab === 'access' ? (
            <AccessPage />
          ) : tab === 'daily' ? (
            <DailyUpdatePage />
          ) : (
            <QaTab />
          )}
        </main>
        <AppFooter />
      </div>
      <TaskDrawer />
      {me && <ActionDock tourable onFeedback={() => setTab('feedback')} />}
      {me && <FeedbackNudge onGo={setTab} />}
      {me && <DailyPrompt />}
    </div>
  );
}
