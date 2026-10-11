// Guided tour content (SRS 16). One list of steps per tab, each pointing at an element by a CSS
// selector. Steps whose element is not on screen (another person's scope, a tab they cannot open)
// are left out when the tour starts. `member` replaces `text` for members, whose numbers count
// only their own tasks. Add a step here whenever a tile, card or section is added.
import type { Me } from '../../api/me';
import type { Tab } from '../filters/toParams';
import { KPI_INFO } from '../kpi/info';
import { INFO } from '../info';

export interface TourStep {
  /** CSS selector of the element to highlight; none = a centred message. */
  target?: string;
  title: string;
  text: string;
  /** Wording for members (their own tasks only). */
  member?: string;
}

/** A tile, card or section in a drag group (components/layout/SortableGroup.tsx). */
const slot = (group: string, id: string) => `[data-group="${group}"] [data-slot="${id}"]`;
const tour = (id: string) => `[data-tour="${id}"]`;

const CLICK_COUNT = 'Click any count to list those tasks below.';
const CARD_USE = 'Click the title to focus it in the centre; drag ⠿ at the top to move it.';

export const TAB_LABEL: Record<Tab, string> = {
  kpi: 'KPI',
  dev: 'Development',
  qa: 'QA',
  support: 'Support',
  org: 'Company tree',
  people: 'People directory',
  access: 'Access permissions',
};

/** Shown once per sign-in, before the first tab tour: the top bar, the same on every tab. */
export const COMMON_STEPS: TourStep[] = [
  {
    target: tour('drawer'),
    title: 'The menu',
    text: 'Every page is here: the dashboard tabs and, for managers, the Employee module. Hover the icons to open it; click ☰ to pin it open, and again to unpin.',
  },
  {
    target: tour('filters'),
    title: 'Filters',
    text: 'Project, assignee, tag and date range narrow every number on the tab. Reset filters clears them. The "i" icons say exactly what each number counts.',
    member:
      'Project, assignee, tag and date range narrow every number on the tab, within your own tasks. The "i" icons say exactly what each number counts.',
  },
  {
    target: tour('bell'),
    title: 'Alerts',
    text: 'The bell counts overdue tasks and tasks stuck over 5 days in one stage. Click it for the list and jump to the tasks.',
  },
  {
    target: tour('live'),
    title: 'Live',
    text: 'Live means changes in Bitrix24 reach the dashboard within seconds; numbers refresh by themselves. Offline means the connection dropped and it is reconnecting.',
  },
  {
    target: tour('dock'),
    title: 'Page tools',
    text: 'On the right: Customise (choose the tiles and cards to show), the guided tour of this page, reading tours aloud, and resetting the layout. Hover any icon for its name. Each data point also has a small toolbar on hover: ⠿ to move it, ? to explain it, the eye to hide it.',
  },
  {
    target: tour('profile'),
    title: 'Your profile',
    text: 'Your name and role, the theme (Light, Dark, System), live-update toasts, Reset layout, this tour (replay, voice on or off) and Sign out. You are signed out 3 days after signing in.',
  },
];

export const TAB_STEPS: Record<Tab, TourStep[]> = {
  dev: [
    {
      target: tour('dev-scope'),
      title: 'All, Dev or Issues',
      text: 'Development department only. Dev = development tasks, Issues = bugs and feedback, All = both. Every number on this tab follows this switch.',
    },
    {
      target: slot('dev.tiles', 'total'),
      title: 'Total',
      text: `${INFO.total} Under the number: the split into Dev and Issues (or Bug and Feedback). ${CLICK_COUNT}`,
      member: `Your tasks (assigned to you or created by you) for the switch. ${CLICK_COUNT}`,
    },
    {
      target: slot('dev.tiles', 'pending'),
      title: 'Pending',
      text: `${INFO.pending} ${CLICK_COUNT}`,
    },
    { target: slot('dev.tiles', 'hold'), title: 'On hold', text: INFO.hold },
    {
      target: slot('dev.tiles', 'ready'),
      title: 'Ready to deploy',
      text: `${INFO.ready} Then Deployed: in the LIVE stage.`,
    },
    {
      target: slot('dev.tiles', 'overdue'),
      title: 'Overdue',
      text: `${INFO.overdue} The first number to act on each day.`,
    },
    { target: slot('dev.tiles', 'doneToday'), title: 'Done today', text: INFO.doneToday },
    {
      target: slot('dev.cards', 'assignees'),
      title: 'Per person or project',
      text: `${INFO.assigneeTable} Switch Assignee / Project at the top. Every count opens its tasks. ${CARD_USE}`,
    },
    {
      target: slot('dev.cards', 'pendingDone'),
      title: 'Pending vs Done',
      text: `${INFO.pendingVsDone} Click a bar to open those tasks.`,
    },
    {
      target: slot('dev.cards', 'ageing'),
      title: 'Task ageing',
      text: `${INFO.ageing} The darker the red, the later. Chart or Table at the top.`,
    },
    { target: slot('dev.cards', 'ranking'), title: 'On-time ranking', text: INFO.ranking },
    {
      target: slot('dev.cards', 'matrix'),
      title: 'Tasks by stage',
      text: `${INFO.matrix} Click a cell for those tasks.`,
    },
    {
      target: slot('dev.sections', 'dueToday'),
      title: 'Task lists',
      text: 'Due today, Overdue, All tasks and Alert details open here. Clicking any number above opens All tasks narrowed to it. In a list: click a cell to change stage, status or tags (and more for leads), tick rows for bulk edit, and export to Excel.',
      member:
        'Due today, Overdue, All tasks and Alert details open here. Clicking any number above opens All tasks narrowed to it. In a list you can change stage, status and tags of your tasks, tick rows for bulk edit, and export to Excel.',
    },
  ],
  qa: [
    {
      target: slot('qa.tiles', 'qaTotal'),
      title: 'Issues filed',
      text: `${INFO.qaTotal} Bug and Feedback under the number. ${CLICK_COUNT}`,
      member: `Bugs and feedback assigned to you or filed by you. ${CLICK_COUNT}`,
    },
    { target: slot('qa.tiles', 'qaOpen'), title: 'Open / pending', text: INFO.qaOpen },
    { target: slot('qa.tiles', 'hold'), title: 'On hold', text: INFO.hold },
    {
      target: slot('qa.tiles', 'qaLastFiled'),
      title: 'Last filed and resolved',
      text: `${INFO.qaLastFiled} Next to it, Last resolved: ${INFO.qaLastResolved}`,
    },
    { target: slot('qa.tiles', 'qaRework'), title: 'Rework', text: INFO.qaRework },
    {
      target: slot('qa.tiles', 'retestAwaited'),
      title: 'Retesting awaited',
      text: `${INFO.retestAwaited} The QA team's queue.`,
    },
    {
      target: slot('qa.cards', 'issuesByAssignee'),
      title: 'Issues by person',
      text: `${INFO.issuesByAssignee} ${CARD_USE}`,
    },
    { target: slot('qa.cards', 'rework'), title: 'Rework by developer', text: INFO.rework },
    { target: slot('qa.cards', 'testing'), title: 'Testing tasks', text: INFO.testing },
    { target: slot('qa.cards', 'retest'), title: 'Waiting for retest', text: INFO.retest },
    {
      target: slot('qa.cards', 'retestByGroup'),
      title: 'Retest queue by person',
      text: INFO.retestByGroup,
    },
    {
      target: slot('qa.cards', 'issueTrend'),
      title: 'Issue trend',
      text: `${INFO.issueTrend} Click a point for that day's issues.`,
    },
    { target: slot('qa.cards', 'issueAgeing'), title: 'Issue ageing', text: INFO.issueAge },
    { target: slot('qa.cards', 'issueStage'), title: 'Issues by stage', text: INFO.issuesByStage },
    {
      target: slot('qa.sections', 'latest'),
      title: 'Issue lists',
      text: 'Latest filed, Latest resolved and All issues. Any number above opens All issues narrowed to it. Edit in place, bulk edit and Excel export work as on Development.',
    },
  ],
  kpi: [
    {
      target: tour('kpi-period'),
      title: 'Day, Week or Month',
      text: `The period for closed, on-time and the people table, compared with the period before. ${KPI_INFO.tab}`,
    },
    {
      target: slot('kpi.tiles', 'open'),
      title: 'Open tasks',
      text: `${KPI_INFO.open} ${CLICK_COUNT}`,
    },
    { target: slot('kpi.tiles', 'overdue'), title: 'Overdue', text: KPI_INFO.overdue },
    { target: slot('kpi.tiles', 'closed'), title: 'Closed', text: KPI_INFO.closed },
    { target: slot('kpi.tiles', 'onTime'), title: 'On-time', text: KPI_INFO.onTime },
    { target: slot('kpi.tiles', 'active'), title: 'Active projects', text: KPI_INFO.active },
    { target: slot('kpi.tiles', 'noDeadline'), title: 'No deadline', text: KPI_INFO.noDeadline },
    {
      target: slot('kpi.cards', 'insights'),
      title: 'Insights',
      text: `${KPI_INFO.insights} Start here each morning. ${CARD_USE}`,
    },
    {
      target: slot('kpi.cards', 'projectHealth'),
      title: 'Project health',
      text: KPI_INFO.projects,
    },
    { target: slot('kpi.cards', 'overdue'), title: 'Overdue breakdown', text: KPI_INFO.overdue2 },
    { target: slot('kpi.cards', 'workload'), title: 'Workload', text: KPI_INFO.workload },
    { target: slot('kpi.cards', 'people'), title: 'People', text: KPI_INFO.people },
    { target: slot('kpi.cards', 'activity'), title: 'Activity', text: KPI_INFO.activity },
    {
      target: tour('kpi-all'),
      title: 'All tasks',
      text: 'Every number on this tab opens its tasks here. Edit in place, bulk edit and Excel export work as on the other tabs.',
    },
  ],
  org: [
    {
      target: tour('org-tree'),
      title: 'Company tree',
      text: 'Departments as in Bitrix24, each with its head and people; sub-departments sit under their parent. Click a department to open or close it; search finds a person or department and opens the way to it.',
    },
  ],
  people: [
    {
      target: tour('people-tiles'),
      title: 'Who uses the dashboard',
      text: 'Employees, who is signed in, who is active right now and who has never signed in. Click a tile to list them.',
    },
    {
      target: '[data-tour="people-tiles"] ~ div table',
      title: 'People directory',
      text: 'Everyone with designation and department, what they can open (access areas), their dashboard status and sign-ins, when they were last active, and their open and overdue tasks. Search and filter above; Excel at the top right.',
    },
  ],
  access: [
    {
      target: tour('access-table'),
      title: 'Rights per person or department',
      text: 'Each column is a right: data (all or own tasks), KPI, Support, Inbox, Employees, edit (all fields or limited) and Admin. Click a value to inherit it, allow it or deny it. The dot shows where it comes from: grey the role, blue the department, teal the person. Locked admins cannot be changed.',
    },
    {
      target: tour('access-audit'),
      title: 'Recent changes',
      text: 'Every change: who made it, for whom, and what changed. A change applies from the person’s next click.',
    },
  ],
  support: [
    {
      target: tour('support-hero'),
      title: 'The Support tab is coming',
      text: 'It will be built from what the support team and management need, so it starts by asking you.',
    },
    {
      target: slot('support.cards', 'form'),
      title: 'Share your needs',
      text: 'Tick what you would like to see, how often you would use it, and describe your biggest problem today. Must have, should have or nice to have helps us plan.',
    },
    {
      target: slot('support.cards', 'mine'),
      title: 'My feedback',
      text: 'What you sent, and whether it has been reviewed. Only you, the admins and the Support lead see your entries.',
    },
    {
      target: slot('support.cards', 'inbox'),
      title: 'Feedback inbox',
      text: 'Every entry from everyone. Filter New or Must have, open one to read it all, add a private note, mark it reviewed, or download all as Excel.',
    },
  ],
};

const ROLE_NAME: Record<Me['role'], string> = {
  admin: 'an Admin',
  pm: 'a Project Manager',
  teamLead: 'a Team lead',
  productOwner: 'a Product owner',
  member: 'a team member',
  local: 'on a local copy',
};

const DEPT_USE: Record<NonNullable<Me['dept']>, string> = {
  dev: 'As a developer, Development is your daily view: what is due today, overdue, and sent to QA. The QA tab shows the bugs and feedback raised on your work.',
  qa: 'As a tester, the QA tab shows the issues you filed, what is waiting for retest and your testing tasks; Development shows what is coming to QA.',
  support:
    'As part of Tech Support, the Support tab is where you tell us what you need; Development and QA show the work on the issues you raise.',
  other:
    'Development shows development work and its progress; QA shows bugs, feedback and testing.',
};

/** The first step of a sign-in's tour: who the person is here and what they can see and do. */
export function roleStep(me: Me, tabs: Tab[]): TourStep {
  const who = me.position ? `${me.name}, ${me.position}` : me.name;
  const names = tabs.map((t) => TAB_LABEL[t]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  const parts = [`Welcome, ${who}. You are ${ROLE_NAME[me.role]} on this dashboard.`];
  if (me.full) {
    parts.push(
      `You see every project and every person, on the ${list} tabs.`,
      'You can change any task from here: stage, status, project, assignee, tags, priority and deadline, one at a time or in bulk. Changes are made in Bitrix24 in your name.',
    );
    if (tabs.includes('kpi')) parts.push('KPI is the management overview: start there.');
  } else {
    parts.push(
      `You see your own work: tasks assigned to you or created by you. Every number counts only those. Your tabs: ${list}.`,
      'You can change the stage, status and tags of your tasks from here; other fields are for team leads and admins. Changes are made in Bitrix24 in your name.',
      DEPT_USE[me.dept ?? 'other'],
    );
  }
  if (me.inbox) parts.push('You also read the Support feedback inbox.');
  return { title: 'Your role', text: parts.filter(Boolean).join(' ') };
}
