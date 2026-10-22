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
  /**
   * For a switch or filter (2026-10-12): the data points it changes. They glow while the step
   * shows, so it is clear what follows the switch and what does not.
   */
  affects?: string[];
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
  insights: 'Insights',
  org: 'Company tree',
  people: 'People directory',
  access: 'Access permissions',
  connections: 'Connections',
  mailing: 'Mailing',
  feedback: 'Feedback',
  docs: 'Documents',
  faq: 'FAQs',
  finance: 'Cost to company',
  workflow: 'Workflow',
  projecttypes: 'Project types',
  daily: 'Daily update',
  dailyreport: 'Daily task update',
};

/** Shown once per sign-in, before the first tab tour: the top bar, the same on every tab. */
export const COMMON_STEPS: TourStep[] = [
  {
    title: 'One number, two places',
    text: 'The same data point can show a different number on two pages, because each counts within its own department or group: Development counts the Development department, QA the bugs and feedback, KPI the whole company, Insights the period you chose. Click any number to see exactly which tasks it counts.',
  },
  {
    target: tour('drawer'),
    title: 'The menu',
    text: 'Every page, by module (Dashboard, Insights, Employees, Integration). The module of the page you are on is highlighted and open; click another module to open it. Drag ⠿ to put modules in your order, and pages within their own module. Hover the icons to open the menu; click ☰ to pin it open.',
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
    text: 'On the right: Customise (choose the tiles and cards to show), the guided tour of this page, the PDF guides, Export page (every data point on the page as one Excel workbook or PDF), reading tours aloud, and resetting the layout. Hover any icon for its name. Each data point also has a small toolbar on hover: ⠿ to move it, ? to explain it, the eye to hide it. Tables have Columns (choose and order them) and ⠿ on each row to put rows in your own order.',
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
      text: 'Development department only. Dev = development tasks, Issues = bugs and feedback, All = both. It changes every tile, card and list on this page (they glow now).',
      affects: ['[data-group="dev.tiles"]', '[data-group="dev.cards"]'],
    },
    { target: slot('dev.tiles', 'projects'), title: 'Projects', text: INFO.devProjects },
    {
      target: slot('dev.tiles', 'total'),
      title: 'Total',
      text: `${INFO.total} Under the number: the split into Dev and Issues (or Bug and Feedback). ${CLICK_COUNT}`,
      member: `Your tasks (assigned to you; testers also the issues they filed) for the switch. ${CLICK_COUNT}`,
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
    { target: slot('dev.tiles', 'inHand'), title: 'Tasks in hand', text: INFO.inHand },
    {
      target: slot('dev.cards', 'inHand'),
      title: 'Tasks in hand by assignee',
      text: INFO.inHandBy,
    },
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
    { target: slot('qa.tiles', 'inHand'), title: 'Tasks in hand', text: INFO.qaInHand },
    {
      target: slot('qa.cards', 'inHand'),
      title: 'Tasks in hand by assignee',
      text: INFO.qaInHandBy,
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
      text: `The period changes only the glowing data points: Closed, On-time, Project health (closed in the period) and People (delivered in the period), each compared with the period before. Open, On hold, Overdue, Projects and No deadline are counted as of now, whatever the period. ${KPI_INFO.tab}`,
      affects: [
        slot('kpi.tiles', 'closed'),
        slot('kpi.tiles', 'onTime'),
        slot('kpi.cards', 'projectHealth'),
        slot('kpi.cards', 'people'),
      ],
    },
    {
      target: slot('kpi.tiles', 'open'),
      title: 'Open tasks',
      text: `${KPI_INFO.open} ${CLICK_COUNT}`,
    },
    { target: slot('kpi.tiles', 'overdue'), title: 'Overdue', text: KPI_INFO.overdue },
    { target: slot('kpi.tiles', 'closed'), title: 'Closed', text: KPI_INFO.closed },
    { target: slot('kpi.tiles', 'onTime'), title: 'On-time', text: KPI_INFO.onTime },
    { target: slot('kpi.tiles', 'active'), title: 'Projects', text: KPI_INFO.active },
    { target: slot('kpi.tiles', 'inHand'), title: 'Tasks in hand', text: KPI_INFO.inHand },
    {
      target: slot('kpi.cards', 'inHand'),
      title: 'Tasks in hand by assignee',
      text: KPI_INFO.inHandBy,
    },
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
  insights: [
    {
      target: tour('insights-window'),
      title: 'Insights',
      text: 'What is holding us back, worked out from Bitrix24 data. 7, 14 or 30 days sets how far back activity is looked at: it changes the glowing data points (lagging projects and people, has room, the findings, projects, load and pulls). Overload, people split across projects and the release plan are counted as of now.',
      member:
        'What is holding your work back. 7, 14 or 30 days sets how far back your activity is looked at: it changes the glowing data points; overload, split work and the release plan are as of now.',
      affects: [
        slot('insights.tiles', 'laggingProjects'),
        slot('insights.tiles', 'laggingPeople'),
        slot('insights.tiles', 'underloaded'),
        slot('insights.cards', 'holding'),
        slot('insights.cards', 'projects'),
        slot('insights.cards', 'load'),
        slot('insights.cards', 'overlap'),
      ],
    },
    {
      target: slot('insights.tiles', 'laggingProjects'),
      title: 'At a glance',
      text: 'Lagging projects and people, the overloaded, those with room to help, people split across projects and releases at risk. Click a tile for the projects or people it counts, with why each is there; click one of them for its tasks.',
    },
    {
      target: slot('insights.cards', 'holding'),
      title: 'What is holding us back',
      text: 'The findings ranked, causes first: a project taking people’s time while another project’s tasks go overdue, then lagging projects and people, overload, people with room and risky releases. Click one for its tasks.',
      member:
        'Your findings ranked, causes first: a project taking your time while your tasks in another go overdue, then your late work and releases at risk. Click one for its tasks.',
    },
    {
      target: slot('insights.cards', 'projects'),
      title: 'Projects',
      text: 'Open tasks per project with the overdue part; ⚠ marks a lagging project. Hover for why; click for the tasks.',
    },
    {
      target: slot('insights.cards', 'load'),
      title: 'Load',
      text: 'Open tasks per person: overdue, due in the next 5 working days and the rest. ▲ overloaded, ▽ has room to take tasks over.',
    },
    {
      target: slot('insights.cards', 'overlap'),
      title: 'Projects pulling people away',
      text: 'Who has open work in several projects, how much they do in each, and which project is taking their time while another goes overdue.',
    },
    {
      target: slot('insights.cards', 'releases'),
      title: 'Release plan',
      text: 'Tasks due this week and next with their planned date, stage and risk of slipping. Click a row for the task.',
    },
    {
      target: slot('insights.cards', 'absences'),
      title: 'Leave and attendance',
      text: 'From Infowan once connected: leave, late arrivals and early leaving, and the tasks and projects they put at risk. Until then insights use Bitrix24 data.',
    },
  ],
  connections: [
    {
      target: slot('connections.cards', 'mail'),
      title: 'Connections',
      text: 'Where reports go and where leave comes from: Microsoft 365 mail, Slack and Infowan. Each shows whether it is connected, sends a test to you, and explains how to connect it.',
    },
  ],
  mailing: [
    {
      target: tour('mailing-new'),
      title: 'New report',
      text: 'Design a performance report: when (daily, weekly, monthly, or when someone’s numbers are very poor or very good), who (by role or by name; each gets their own part), what (topics and questions) and how (mail with CC, Slack messages, Slack channels).',
    },
    {
      target: tour('mailing-list'),
      title: 'Your reports',
      text: 'New reports start in Preview: only admins get them, with the list of who would. Preview shows the mail as any person would get it; Send test sends it to you; Go live sends it to everyone on schedule. Last runs show what went out.',
    },
  ],
  workflow: [
    {
      target: slot('workflow.cards', 'diagram'),
      title: 'How work flows',
      text: 'A task moves left to right through the Kanban stages to LIVE. Each lane is a department: the PM or team lead plans it (To do), Development builds it (In progress, Pushed to Master, Merged to Development, Pending for QA), QA tests it (QA Backlog, In QA, Done, or Issue Raised to send it back) and Release puts it live. Solid arrows are the usual moves, red dashed ones QA sending work back. The band underneath shows what each stage counts as. Click a stage for details.',
    },
    {
      target: slot('workflow.cards', 'stage'),
      title: 'One stage',
      text: 'What the stage means, who acts there, where it moves on to, the board column names that mean it, and which numbers on the dashboard it feeds.',
    },
    {
      target: slot('workflow.cards', 'departments'),
      title: 'Who does what',
      text: 'Each department and the stages where the next step is theirs.',
    },
    {
      target: tour('workflow-edit'),
      title: 'Edit the workflow (admins)',
      text: 'Admins change the stages: order, names, departments, what each counts as, its roles, column names and arrows, and the rework rule. Once saved, every number on every page counts with it. Every version is kept and can be restored.',
    },
  ],
  projecttypes: [
    {
      target: slot('projecttypes.tiles', 'differ'),
      title: 'Projects that differ',
      text: 'Most projects follow the full development flow to LIVE. Support desks, DevOps and personal projects use short boards (New › In progress › Finished), others skip the code or release stages. Their numbers follow the same rules, with fewer stages.',
    },
    {
      target: slot('projecttypes.cards', 'type-support'),
      title: 'Projects by type',
      text: 'Each type with its rule and its projects. Every project shows its own columns and the stage each counts as; a column the workflow does not know is outlined in red. Admins set a project’s type by hand, map an unknown column to a stage, and edit the types.',
    },
  ],
  dailyreport: [
    {
      target: slot('dailyreport.tiles', 'notPlanned'),
      title: 'Who has not planned or wrapped up',
      text: 'Everyone expected to post (Daily update on), and who has planned and wrapped up their day. Click Not planned or Not wrapped up to list them. Without full data access you see only your own days.',
    },
    {
      target: slot('dailyreport.cards', 'who'),
      title: 'Who planned and wrapped up',
      text: 'One line per person and working day: when they posted, how many tasks they planned, and how many ended Done, WIP, Pending or On hold. Pick the dates, department and assignee above; Excel and PDF take the whole report.',
    },
    {
      target: slot('dailyreport.cards', 'detail'),
      title: 'Planned vs done',
      text: 'Open a person’s day for every task: on the plan or added in the evening, what was reported, where it is now, its stage, status, priority, tags and deadline, and its Kanban moves that day.',
    },
  ],
  daily: [
    {
      target: tour('daily-plan'),
      title: 'Plan your day',
      text: 'Open it from the Daily update icon in the dock: what carries over from your last plan (still pending or WIP), your overdue and due-today tasks, upcoming ones you can take on early, and those with no deadline (plan one and its deadline is set to today when you post). Change any task right in its row (stage, status, tags…), keep, remove or add, write a note and post it to the daily work update group on Slack. Post it by 11:30: after that it is tagged Late planned. Once posted it opens as your posted plan, where Edit plan changes it.',
    },
    {
      target: tour('daily-add'),
      title: 'Add more tasks in the day',
      text: 'Picked up something new after posting? + Add more tasks puts any of your open tasks (or a new one) on today’s plan and tells the team in your plan’s Slack thread.',
    },
    {
      target: tour('daily-wrap'),
      title: 'Wrap up your day',
      text: 'In the evening from the same icon, or when you sign out, your plan comes back with each task Pending, WIP, Done or On hold (from its stage). Report one as Done to complete it in Bitrix24, add tasks you finished ahead, and work outside the plan becomes a Bitrix24 task assigned to you. Then it goes to the same Slack thread.',
    },
    {
      target: slot('daily.cards', 'history'),
      title: 'My last 30 days',
      text: 'Each day you posted: tasks planned, done, WIP and outside the plan. Open the Daily update any time from its icon in the dock on the right.',
    },
  ],
  feedback: [
    {
      target: slot('feedback.cards', 'form'),
      title: 'Tell us',
      text: 'An issue, an idea or a wish: about the dashboard, a page, a project or a person (only the ones you can see). Add screenshots (paste them with Ctrl+V), PDF, Excel or Word files, up to 5.',
    },
    {
      target: slot('feedback.cards', 'mine'),
      title: 'My feedback',
      text: 'What you sent, whether it has been reviewed, and the reply.',
    },
  ],
  docs: [
    {
      target: slot('docs.cards', 'whole'),
      title: 'Guides',
      text: 'PDF guides for your level of access: the whole dashboard, and module by module. Only the pages you can open are in them.',
    },
  ],
  faq: [
    {
      target: slot('faq.cards', 'the-numbers'),
      title: 'FAQs',
      text: 'Answers to the questions people ask most, by topic. Search at the top.',
    },
  ],
  finance: [
    {
      target: slot('finance.cards', 'form'),
      title: 'Cost to company',
      text: 'Coming soon, for admins only. Tell us what it should show and which decisions it should help with.',
    },
  ],
  org: [
    {
      target: slot('org.tiles', 'departments'),
      title: 'The company at a glance',
      text: 'Departments, people, department heads and departments without a head, from Bitrix24. Click a tile to open the tree; drag ⠿ to rearrange them.',
    },
    {
      target: slot('org.cards', 'tree'),
      title: 'Company tree',
      text: 'Departments as in Bitrix24, each with its head and people; sub-departments sit under their parent. Click a department to open or close it; search finds a person or department and opens the way to it.',
    },
  ],
  people: [
    {
      target: slot('people.tiles', 'employees'),
      title: 'Who uses the dashboard',
      text: 'Employees, who is signed in, who is active right now and who has never signed in. Click a tile to list them; click again to show everyone.',
    },
    {
      target: slot('people.cards', 'directory'),
      title: 'People directory',
      text: 'Everyone with designation and department, what they can open (access areas), their dashboard status and sign-ins, when they were last active, and their open and overdue tasks. Search and filter above; Excel at the top right.',
    },
    {
      target: tour('people-departments'),
      title: 'Edit people and departments',
      text: 'Admins: Edit on a row changes the person’s dashboard role (here) and their designation and departments (in Bitrix24). Manage departments adds, renames and moves departments and sets their heads in Bitrix24. Every change is confirmed first and logged.',
    },
  ],
  access: [
    {
      target: slot('access.tiles', 'people'),
      title: 'Access permissions',
      text: 'Who may open which page and what they may do there. Pick a person or a department on the left.',
    },
    {
      target: tour('access-tree'),
      title: 'Module by module',
      text: 'Every menu module with a master switch; open it for its pages (each with its own switch) and the permissions under them: data scope, editing, inboxes. Grey dots come from the role, blue from a department, teal from the person, amber are not saved yet; ↺ goes back to inherited. Save at the bottom.',
    },
    {
      target: slot('access.cards', 'changes'),
      title: 'Recent changes',
      text: 'Every change: who made it, for whom, what it was before.',
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
  ba: 'As a business analyst, Development shows the work on the projects you analyse and QA shows the bugs and feedback raised on it.',
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
      `You see your own work: tasks assigned to you (testers also the issues they filed). Every number counts only those. Your tabs: ${list}.`,
      'You can change the stage, status and tags of your tasks from here; other fields are for team leads and admins. Changes are made in Bitrix24 in your name.',
      DEPT_USE[me.dept ?? 'other'],
    );
  }
  if (me.inbox) parts.push('You also read the Support feedback inbox.');
  return { title: 'Your role', text: parts.filter(Boolean).join(' ') };
}
