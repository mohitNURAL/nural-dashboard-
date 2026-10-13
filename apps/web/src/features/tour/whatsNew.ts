// What's new (SRS 16). Every update that changes what people see adds one entry here, newest first,
// with the steps that walk through it. People who have not seen an entry get a "New" dot on its
// tab and a toast; opening the tab walks them through it once. Entries for tabs a person cannot
// open are skipped.
import type { Tab } from '../filters/toParams';
import type { TourStep } from './steps';

export interface WhatsNew {
  /** Stable id, saved in each person's settings once seen. */
  id: string;
  date: string;
  tab: Tab;
  title: string;
  steps: TourStep[];
}

const slot = (group: string, id: string) => `[data-group="${group}"] [data-slot="${id}"]`;

export const WHATS_NEW: WhatsNew[] = [
  {
    id: '2026-10-13-dev-projects',
    date: '2026-10-13',
    tab: 'dev',
    title: 'Development: Projects at work',
    steps: [
      {
        target: slot('dev.tiles', 'projects'),
        title: 'Projects',
        text: 'Projects = every project owned by Development, QA or a PM, as Active (open tasks and activity in the last 30 days) + Silent (nothing open, or no activity for 30 days) + Hold (every unfinished task on hold). Click a number for Projects at work, most active this week first, then the earliest deadline. Open a project to see who works on it. The Day / Week / Month switch sets Done (previous period), Overdue (this period) and Spill (previous period). A count opens its tasks, and "Back to Projects at work" brings you back.',
      },
    ],
  },
  {
    id: '2026-10-13-tile-opens-list',
    date: '2026-10-13',
    tab: 'dev',
    title: 'A tile just opens its list',
    steps: [
      {
        target: '[data-group="dev.tiles"]',
        title: 'A tile just opens its list',
        text: 'Click a tile and its tasks open in the middle of the screen, without lighting up the tile. Counts, chart bars and table cells still stay lit so you can see what you clicked.',
      },
    ],
  },
  {
    id: '2026-10-13-focus-70',
    date: '2026-10-13',
    tab: 'dev',
    title: 'Focus view and lists fit the screen',
    steps: [
      {
        target: '[data-group="dev.tiles"]',
        title: 'Focus view and lists fit the screen',
        text: 'A card you focus and a list that comes to the centre now take 70% of the screen, under the top bar, and scroll inside when they are long. A task you open still opens on the right.',
      },
    ],
  },
  {
    id: '2026-10-13-feedback-refresh',
    date: '2026-10-13',
    tab: 'feedback',
    title: 'Feedback updates by itself',
    steps: [
      {
        target: slot('feedback.cards', 'mine'),
        title: 'Feedback updates by itself',
        text: 'New feedback and replies now show within 30 seconds, with no need to sign out and in again. Long words and links wrap inside their own card instead of running over the next one.',
      },
    ],
  },
  {
    id: '2026-10-12-in-hand-by',
    date: '2026-10-12',
    tab: 'kpi',
    title: 'Tasks in hand by assignee and project',
    steps: [
      {
        target: slot('kpi.cards', 'inHand'),
        title: 'Tasks in hand by assignee or project',
        text: 'A chart and a table of the tasks in hand per assignee or project. Pick the window above the chart (Tomorrow, Rest of week, ...); the table shows every window. Click a bar or a count for those tasks. The same card is on Development and QA.',
      },
    ],
  },
  {
    id: '2026-10-12-in-hand',
    date: '2026-10-12',
    tab: 'kpi',
    title: 'Tasks in hand on KPI, Development and QA',
    steps: [
      {
        target: slot('kpi.tiles', 'inHand'),
        title: 'Tasks in hand',
        text: "Open tasks with the deadline still ahead, and when they are planned: tomorrow, the rest of this week, the rest of this month, next week and next month. Click any number for those tasks. The same tile is on Development (pending dev tasks) and QA (the testing team's tasks).",
      },
    ],
  },
  {
    id: '2026-10-12-active-projects',
    date: '2026-10-12',
    tab: 'kpi',
    title: 'KPI: Active projects = every project in Bitrix24',
    steps: [
      {
        target: slot('kpi.tiles', 'active'),
        title: 'Active projects, first',
        text: 'Now the total of active projects in Bitrix24, split into Recent action (an action in the last 30 days), Silent (no action for 10+ working days) and Others; the three add up to the total. Click a part to list those projects.',
      },
      {
        target: slot('kpi.cards', 'projectHealth'),
        title: 'Project health by activity',
        text: 'A switch lists All, Active, Recent action, Silent or Others, and the Activity column shows where each project stands.',
      },
    ],
  },
  {
    id: '2026-10-12-column-filters',
    date: '2026-10-12',
    tab: 'dev',
    title: 'Task lists: a filter on every column',
    steps: [
      {
        target: '[data-group="dev.sections"] [data-slot="all"]',
        title: 'Column filters',
        text: 'The search box finds ID and title. Under it, pick values from each column: Project, Assignee, Creator, Stage, Status, Priority, Tags, Type (type to narrow the list, pick several). "Clear column filters" removes them; the Excel export keeps them.',
      },
    ],
  },
  {
    id: '2026-10-12-projects',
    date: '2026-10-12',
    tab: 'workflow',
    title: 'Projects: the workflow and project types',
    steps: [
      {
        target: '[data-nav="workflow"]',
        title: 'Projects',
        text: 'A new module: the Workflow (how tasks move through the stages to LIVE and what each department does) and Project types (projects whose boards differ, like support and individual projects). Admins can edit both; every number follows.',
      },
    ],
  },
  {
    id: '2026-10-12-search',
    date: '2026-10-12',
    tab: 'dev',
    title: 'Search any column, one look for search and lists',
    steps: [
      {
        target: '[data-group="dev.sections"] [data-slot="all"]',
        title: 'Search any column',
        text: 'The search box of every task list now finds words in any column: project, assignee, stage, status, tags, priority… Type several words to narrow ("moto vapt to do"). The × clears it. Every search box and dropdown now looks and works the same.',
      },
    ],
  },
  {
    id: '2026-10-12-nural-pulse',
    date: '2026-10-12',
    tab: 'dev',
    title: 'Meet Nural Pulse',
    steps: [
      {
        title: 'Nural Pulse',
        text: 'The dashboard has a name: Nural Pulse, the live heartbeat of every project and person. Powered by Bitrix24 and Nural.',
      },
    ],
  },
  {
    id: '2026-10-12-people-edit',
    date: '2026-10-12',
    tab: 'people',
    title: 'Edit people and departments',
    steps: [
      {
        target: '[data-tour="people-departments"]',
        title: 'People and departments',
        text: 'Admins can now change a person (Edit on their row): their dashboard role, and in Bitrix24 their designation and departments. Manage departments adds, renames and moves departments and sets their heads in Bitrix24. Each change is confirmed first and logged.',
      },
    ],
  },
  {
    id: '2026-10-12-help',
    date: '2026-10-12',
    tab: 'feedback',
    title: 'Help: feedback, documents and FAQs',
    steps: [
      {
        target: '[data-nav="feedback"]',
        title: 'Help',
        text: 'A new Help module: send feedback with screenshots and files about the dashboard, a page, a project or a person; download the PDF guides; and find answers in the FAQs. The feedback icon in the page tools opens it from anywhere.',
      },
    ],
  },
  {
    id: '2026-10-12-access',
    date: '2026-10-12',
    tab: 'access',
    title: 'Access permissions by module and page',
    steps: [
      {
        target: '[data-tour="access-tree"]',
        title: 'Module by module',
        text: 'Every menu module opens into its pages, each with its own switch, and the permissions under them (data, editing, inboxes). Switch a whole module at once, then Save. A dot shows where each value comes from.',
      },
    ],
  },
  {
    id: '2026-10-12-tables',
    date: '2026-10-12',
    tab: 'dev',
    title: 'Tables you can shape',
    steps: [
      {
        target: '[data-group="dev.cards"] [data-slot="assignees"]',
        title: 'Columns and your own order',
        text: 'Columns: choose which columns show and their order (or drag a column header). Drag a row by ⠿ to put rows in your own order; Your order switches it on or off, and a click on a column header sorts again. Saved for you.',
      },
    ],
  },
  {
    id: '2026-10-12-spotlight',
    date: '2026-10-12',
    tab: 'insights',
    title: 'Click a number: its list comes to you',
    steps: [
      {
        target: '[data-group="insights.tiles"]',
        title: 'Spotlight and lists',
        text: 'Click any number on any page: the page dims, the number stays lit and its list opens in the middle of the screen; Escape or ✕ puts it back. Here, a tile first lists the projects or people it counts, with why; click one for its tasks.',
      },
    ],
  },
  {
    id: '2026-10-12-menu-export',
    date: '2026-10-12',
    tab: 'dev',
    title: 'Menu by module, Export page, a fresher look',
    steps: [
      {
        target: '[data-tour="drawer"]',
        title: 'Menu by module',
        text: 'The menu now shows modules with icons. Only the module of the page you are on is open; click another to open it. Drag ⠿ to reorder modules, and pages within their module.',
      },
      {
        target: '[data-tour="export-page"]',
        title: 'Export page',
        text: 'Every data point on this page at once: an Excel workbook (a summary of the tiles, then a sheet per card and list) or a PDF, with your filters. Excel files now come in the dashboard colours.',
      },
    ],
  },
  {
    id: '2026-10-12-mailing',
    date: '2026-10-12',
    tab: 'mailing',
    title: 'Integration: reports by mail and Slack',
    steps: [
      {
        target: '[data-nav="mailing"]',
        title: 'Integration › Mailing',
        text: 'Design performance reports sent by mail and Slack: daily, weekly, monthly, or when someone’s numbers are very poor or very good. Each person gets their own part. New reports go only to admins (Preview) until you switch them to Live.',
      },
    ],
  },
  {
    id: '2026-10-12-insights',
    date: '2026-10-12',
    tab: 'dev',
    title: 'Insights: what is holding us back',
    steps: [
      {
        target: '[data-nav="insights"]',
        title: 'Insights',
        text: 'A new page in the menu: lagging projects and people, overload, people with room to help, projects pulling people off others, and releases at risk. Every number opens its tasks. Members see their own work.',
      },
    ],
  },
  {
    id: '2026-10-11-guides',
    date: '2026-10-11',
    tab: 'dev',
    title: 'New look everywhere, PDF guides',
    steps: [
      {
        target: '[data-tour="guides"]',
        title: 'User guide and Module guide',
        text: 'Two PDF guides: the whole dashboard, and every page module by module with what each tile, card and list shows. Open them here any time.',
      },
    ],
  },
  {
    id: '2026-10-11-drawer',
    date: '2026-10-11',
    tab: 'dev',
    title: 'New menu, page tools and Employee module',
    steps: [
      {
        target: '[data-tour="drawer"]',
        title: 'The new menu',
        text: 'All pages are now in this menu on the left. Hover it to open; click ☰ to pin it open, and again to unpin. Admins, PM and team leads also find the Employee module here: Company tree, People directory and, for admins, Access permissions.',
      },
      {
        target: '[data-tour="dock"]',
        title: 'Page tools',
        text: 'Customise, the guided tour, reading aloud and Reset layout are now icons on the right. Hover any icon for its name.',
      },
    ],
  },
  {
    id: '2026-10-11-customise',
    date: '2026-10-11',
    tab: 'dev',
    title: 'Customise, tour any point, export one card',
    steps: [
      {
        target: '[data-tour="customise"]',
        title: 'Customise',
        text: 'Choose which tiles and cards to show on each tab. Hidden ones leave no gap, and you bring them back here.',
      },
      {
        target: slot('dev.cards', 'assignees'),
        title: 'A toolbar on every data point',
        text: 'Hover any tile, card or list: ⠿ moves it, ? explains just that point, the eye hides it.',
      },
      {
        target: slot('dev.cards', 'ageing'),
        title: 'Export one card',
        text: 'Click a card’s title to bring it to the centre, then Excel or PDF exports only that card, with the filters and time on it.',
      },
    ],
  },
  {
    id: '2026-10-11-tour',
    date: '2026-10-11',
    tab: 'dev',
    title: 'Guided tour',
    steps: [
      {
        target: '[data-tour="profile"]',
        title: 'Guided tour',
        text: 'Your profile menu now has "Take the tour of this tab": it explains every tile, card and list on the tab you are on, for your role. Turn on "Read the tour aloud" to hear it. New features will be shown to you like this.',
      },
    ],
  },
  {
    id: '2026-10-11-layout',
    date: '2026-10-11',
    tab: 'dev',
    title: 'Arrange your dashboard',
    steps: [
      {
        target: slot('dev.tiles', 'total'),
        title: 'Drag to rearrange',
        text: 'Hover a tile, card or section and drag the grip ⠿ at its top to move it. Each stays in its own group, and cards resize to fill their row: drop a half card next to a full one and both become half. Your layout is saved for you on any computer; Profile → Layout → Reset puts it back.',
      },
      {
        target: slot('dev.cards', 'assignees'),
        title: 'Focus view',
        text: 'Click a card’s title or empty area to bring it to the centre, larger, with the page blurred behind. Click outside or press Escape to put it back.',
      },
    ],
  },
  {
    id: '2026-10-11-support-tab',
    date: '2026-10-11',
    tab: 'support',
    title: 'Support tab',
    steps: [
      {
        target: '[data-tour="support-hero"]',
        title: 'The Support tab',
        text: 'Coming soon, and built from your answers: tell us what you track, the reports you make by hand and the numbers you wish you had.',
      },
      {
        target: slot('support.cards', 'form'),
        title: 'Share your needs',
        text: 'A few ticks and one sentence about your biggest problem is enough.',
      },
    ],
  },
  {
    id: '2026-10-11-bulk-edit',
    date: '2026-10-11',
    tab: 'dev',
    title: 'Edit tasks in place and in bulk',
    steps: [
      {
        target: slot('dev.sections', 'all'),
        title: 'Edit in place and in bulk',
        text: 'Open a task list: click a Stage, Status or Tags cell to change it in Bitrix24 (team leads also Project, Assignee, Priority and Deadline). Tick rows, or the header box for all, then Check and Apply to change many at once. Pages of 10, 25, 50 or 100 rows.',
        member:
          'Open a task list: click a Stage, Status or Tags cell of your task to change it in Bitrix24. Tick rows, or the header box for all, then Check and Apply to change many at once.',
      },
    ],
  },
];
