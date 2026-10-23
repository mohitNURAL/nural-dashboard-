# Nural Pulse changelog

One line per change, newest first, with its commit. What people see on the dashboard is also in
`apps/web/src/features/tour/whatsNew.ts`; the rules behind the numbers are in `docs/SRS.md`.
Every commit adds its line here (CLAUDE.md); a line without a commit ID is the newest change,
and the next change fills its ID in.

## Open questions

- Shalini's account (user 126) shows no data: she is a member (own tasks only) with no tasks of
  her own. Her saved access grant on the live database was not checked (read not allowed).
- KPI Project health: Status (red / amber / green) still uses KPI's own "silent" rule (10+
  working days), while the Activity column uses the Development rule (30 days). Align them?
- Daily update: the Slack channel must be set once under Integration › Connections, and the
  Nural Pulse app invited to it.
- PDF guides: texts are current, screenshots are from 2026-10-12 (new pages have none yet).
  New captures need a sign-in at each access level.
- Five tables (Alert details, Projects at work, Stage matrix, Ranking, Insights list) still use
  their own markup instead of the shared table.

## 2026-10-23

- Daily update: a plan saved but not posted to Slack shows so, with Post to Slack now and Reset
  and plan again (`POST /api/daily/plan/reset`, only before Slack and the wrap-up); the failed
  post is logged with its reason. Planner: select all / unselect all box in the Plan header.

## 2026-10-22

- `52977b0` Directory sync: the hourly workgroup upsert no longer resets each project's members to empty
  before reading them again (a refused list now really keeps the stored one), and the log line
  counts the member lists read (`memberLists`). Vishal (158) is a member of 84 Motorola
  Indonesia Support on Bitrix24 but Add task listed only 82 for him.
- `63524eb` Daily update Add task: a member also gets the projects they are in on Bitrix24 (new ones too;
  `sonet_group.user.get`, read, stored as workgroups.member_ids, migration 0013). Checked live:
  sonet_group.get with IS_ADMIN lists 40 projects (37 without), 168 and 170 included. The
  refused column move now names the project's sort right (Devesh is a member of 98).
- `44070c5` Every project, private ones too: the directory sync reads workgroups as admin (sonet_group.get
  IS_ADMIN, a read), so new projects (e.g. Nural Sales International) show before their first
  task. Daily update Add task: full access (PM, team leads, admins) can pick any active project,
  their own first; members still only their own.
- `771575a` Daily update: a posted plan opens as its own view (time posted, Late planned tag, tasks with
  their state and Added hh:mm, note) with + Add more tasks for the rest of the day (added to the
  plan, the Slack message updated, a reply in its thread; `POST /api/daily/plan/add`); the first
  posting time stays when the plan changes. At 11:30 the not-planned list also goes to the daily
  work update group, each person mentioned; a plan first posted after 11:30 is Late planned
  (Slack, the page, Report › Daily task update, the 19:00 check-in).
- `3530e78` KPI Open tasks tile also shows BA (Business Analysis): tasks assigned to Yajur (user 20), set
  per person in config/departments.json `people`; BA is in the KPI department filter and the
  Daily report department dropdown too.

## 2026-10-21

- `45b434d` A refused column move says why: Bitrix24 lets only a project's members move cards on its Kanban
  (Devesh, task 42274 in 98 AKI Global); an expired sign-in asks to sign in again.
- `35870be` Member scope (NFR-4): a member sees only tasks assigned to them; a QA tester also keeps the
  issues they filed. Tasks a member created for other people no longer show (Harsh saw Umang,
  Neha and Devesh). Live updates follow (`assignees` on task.changed); reports too.
- `fd31b69` Kanban columns of private projects (170 Nural BA): a board refused to the webhook is read
  again as an admin (`readBoards`, task.stages.get with isAdmin, read only); the hourly directory
  sync also reads boards of projects known only from their tasks; a task's column title is taken
  from the stored board by its id when the sync had none.
- `ad38637` Bulk edit takes several changes at once (+ Add another change; `edits` on bulk check / apply,
  each task's changes in order). Edit fields and bulk both checked in a browser end to end.
- `c3f82f3` Fix the CI type check (a test built a BitrixError with the wrong arguments), so the Edit fields
  change deploys.
- `116adea` Task view: Edit fields changes stage, status, tags (full access also project, assignee,
  priority, deadline) together with one Save (`POST /api/tasks/:id/edit`, checked first, all or
  nothing before Bitrix24; fields, then column, then status).
- `40c1b72` Scoping check widened (auth/scoping.test.ts): Tasks in hand, Projects at work, Daily update
  projects, the Daily task update report and workflow projects; no endpoint may name a project
  or person outside a member's own tasks; the task edit dropdowns stay managers only. No leak found.
- `f73f935` Project names from the task data when the webhook cannot list the project (private projects
  the webhook user is not in: 168 Nural Sales International, 170 Nural BA) instead of "Group 168"
  (`projectsOf` in data/dataset.ts).
- `8e2b426` Check-ins to the directors switched on, to Deepak (40) only: 11:30 who has not planned, 19:00
  who has not wrapped up (`config/daily-checkins.json`).
- `bc43867` Report › Daily task update and the check-ins: nine people are not expected to post
  (`config/daily-exclude.json`: users 1, 18, 22, 40, 42, 54, 66, 68, 166).
- `08fac20` Daily update: the plan lists open tasks with no deadline (`dailyNoDeadline`); posting the plan
  sets a planned task's missing deadline to today (end of the working day, or 23:59 after it,
  `dailyDeadline`) with the person's own login, members included (CLAUDE.md, SRS 23). PDF guides
  rebuilt.
- `ea94021` QA Open / pending tile: opens a popup like Projects at work, by project, then creator, then
  assignee, with Pending and Overdue at every level (most overdue first); a count opens those
  issues; Excel and PDF (`openByCreator` in metrics.ts, `/api/qa/open`). Last filed now shares
  its table (IssueTreeDialog). PDF guides rebuilt.

## 2026-10-20

- `73c347b` Tasks in hand planner: a count opens its tasks with "‹ Back to planner", which reopens the
  planner as it was left (view, grouping, search), on KPI, Development and QA.
- `1deecad` Tasks in hand planner: Excel and PDF (a line per person or project, then what it splits into,
  every column, a totals line); PDF guides rebuilt from the current tour texts.
- `5211396` Tasks in hand planner on KPI, Development and QA: the tile opens day / week / month columns per
  person (with their projects) or per project (with its people), overdue first in red, heat by
  load, totals row; every count and name opens its tasks (`inHandCalendar` in metrics.ts).

## 2026-10-17

- `bcd3138` Check-ins to the directors: Slack DMs to Deepak, Bhanu and Balram at 11:30 (planned / not)
  and 19:00 (wrapped up / not), working days, once a day each; off until enabled in
  `config/daily-checkins.json`; admins preview and send themselves a test on the report page.
- `2967901` Report › Daily task update (new module, right `dailyReport`): who planned and wrapped up (tiles,
  table), planned vs done per person and day with stage moves, filters (dates, department,
  assignee), Excel and PDF; full data scope sees everyone, others their own days.
- `bf5e583` Daily update Add task (morning and evening): summary, description, project, tags, priority,
  deadline; created in Bitrix24 for the person with their own login and put on the plan or the
  wrap-up at once. `CREATE_FIELDS` widened (approved): DESCRIPTION, TAGS, PRIORITY, DEADLINE.
- `2e060f5` Daily update: plan and wrap-up rows show every task field and are edited in place (stage,
  status, project, priority, tags, deadline); status rules Pending / WIP / Done / On hold for dev
  tasks, issues and testing tasks (`dailyState`); carry-over of pending or WIP tasks only;
  Upcoming list to take tasks on early or report them done ahead; plan viewable all day.

## 2026-10-16

- `2207e9b` QA Last filed popup: Excel and PDF of every project shown, its creators and their assignees
  (Filed, Bug, Feedback). The Projects at work PDF takes a layout, so both print the same way.
  This changelog started, built from the git history.
- `34a86a3` Unassigned line on the Pending / Open tiles (Development, QA, KPI); Development counts
  the placeholder assignee. Overdue tiles open their breakdown in the centre: KPI Overdue card,
  Development Alert details on its Overdue view.
- `a03ba3c` Placeholder assignee (`config/unassigned.json`, user 126) shows as Unassigned in lists,
  tables, charts, alerts and the Assignee filter; keeps their own name as creator.
- `d173a58` QA Last filed: the day's issues by project, creator and assignee (bug, feedback) in a
  Projects-at-work popup; every count opens its issues.

## 2026-10-15

- `c00b6b1` Guides rebuilt: current tour texts, Daily update chapter, Workflow, Project types and
  Daily update page guides, KPI Projects tile.
- `ab80711` KPI: Projects tile with the Development rule (Active, Silent, Hold) for every
  department; Project health filters and Activity column follow it.
- `b987df9` Slack posts without link previews (no "Log in to Bitrix24" cards under task links).
- `3822982` Tasks in hand: week first, then month (Tomorrow, Rest of week, Next week, Rest of
  month, Next month).
- `43279af` Tiles: clearer text (bold blue label, body-colour parts and sub-line).
- `ef94294` Numbers centred in every table (and in the Projects PDF).
- `544ad42` Testing tasks in Issue Raised show "Issue raised", not pending or overdue; the Daily
  update opens only from its icon.

## 2026-10-14

- `f446106` Daily update: morning plan and evening wrap-up posted to the Slack group.
- `3cfc017` One table look and one dropdown look everywhere; table header readable in dark mode.
- `ec6baa2` Projects at work: Total overdue column.
- `212c21f` Projects at work: No deadline column, Columns menu, drag columns and project rows, "i"
  on every column, Excel and PDF.
- `b548105` Projects at work: hover a count for its dev tasks and issues.
- `8b0a1fb` Projects tile back to all owned projects (nothing open = Silent); task view on the right.
- `eb2b409` Projects tile: Hold part (every unfinished task on hold).

## 2026-10-13

- `7495e93` Projects tile: fixed count of projects owned by Development, QA or a PM; Active /
  Silent over 30 days; only people with open tasks.
- `c9ddc5d` Projects at work: Day / Week / Month switch (Done previous, Overdue this, Spill).
- `b6ccbb4` Projects at work: Active + Silent tile, project accordion, most active first, Back to
  Projects at work.
- `8cf1af0` Development: Projects tile and the Projects at work popup.
- `3dd3635` Docs point to the live DigitalOcean droplet; Docker files kept for a new server.
- `6d66599` SRS: live server, CI/CD and the day's UI changes; docs-only pushes skip CI.
- `b9b5806` Spotlight: a tile just opens its list, without lighting the tile.
- `1082975` Task view, focus view and spotlight: 70% of the screen, under the top bar.
- `9b6bf43`, `6b09d1c`, `8eb879a`, `bce73c8` CI/CD: check every push, deploy `main` to the live
  server (pull, build, migrate, restart PM2).
- `74c8907` Feedback: refresh every 30 s and on focus; long text wraps.

## 2026-10-12

- `ae73e55` Sync: skip a workgroup whose Kanban board the webhook user may not read.
- `83b46a4` Tasks in hand by assignee / project (chart + table) on KPI, Development and QA.
- `5a1cb2f` Tasks in hand on KPI, Development and QA: open tasks with the deadline ahead, by window.
- `2f1fd29` KPI Active projects = every active Bitrix24 project; task-list column filters.
- `45fbe06` Projects module: Workflow (diagram, stage details, admin editor, versions) and Project
  types.
- `39a4538` Workflow as data: stage rules from an admin-editable definition, versions, live refresh.
- `47ca61f` One search box and one dropdown everywhere; task lists search any column.
- `7f806f8` Guides: admin and team-lead sets printed under the Nural Pulse names.
- `e978cff` Renamed to Nural Pulse; footer "Powered by Bitrix24 and Nural" everywhere.
- `2dcf409` People directory: edit role, designation and departments; manage departments
  (Bitrix24, admin's own token, logged).
- `d9c4769` Tour names what each switch changes; guides rebuilt with Help, Finance and per-page PDFs.
- `7f52129` Access by module and page; Help (feedback with attachments, documents, FAQs); Finance
  for admins.
- `d226f63` Tables you shape (columns, column and row order); themed scrollbars.
- `b22b9bd` Spotlight: a clicked number stays lit and its list comes to the centre.
- `4dfad79` Menu by module, styled confirmations, themed Excel, Export page.

## 2026-10-11

- `bb33661` Guides: Insights and Integration in every set; CLAUDE.md rules for reports.
- `6d65724` Integration: Connections and Mailing (reports by mail and Slack, preview before live).
- `e58d2e5` Insights module: what is holding us back, scoped for everyone.
- `46f9314` Scope-wise guides (member, support, owner, manager, admin) picked by rights.
- `33138bc`, `6dceea3` One look on every page; PDF guides from the tour texts.
- `184f0aa` Side drawer navigation, icon dock, Employee module (company tree, people directory,
  access permissions).
- `2e973d7` Rights per person: role defaults, department and person overrides.
- `956266b` Tour bubbles by their data point; toolbar per data point; Customise; Excel/PDF of a
  focused card.
- `0201b07` Guided tour by role and scope, What's new walkthroughs, voice.
- `2a164c1` Drag to rearrange tiles, cards and sections; focus view for cards.
- `afe7b17` Sessions end 3 days after sign-in; per-person settings.
- `a5b4ab8` Refresh toast after a deploy (build ID vs /version.json).
- `c152d47` Support tab: coming soon, with a feedback form and inbox.
- `1f2a01f` Profile menu with monogram, theme and sign out; task list paging.
- `7a24d22`, `8a203be` Themes: Light, Dark and System.
- `14417fe`, `fe586f0` Bulk edit with validation (Check, then Apply).
- `e143307` Edit tasks in place: stage, status, project, assignee, tags, priority, deadline.
- `6962de2` Role-based scoping (NFR-4): managers see everything, members only their own tasks.
- `aa722e6`, `2bd78f9` Task actions as the signed-in person: Kanban column and Bitrix24 status.
- `1c1cd8f` Visible Sign out button.
- `3583f3a` On hold as its own group, with a tile on every tab.

## 2026-10-10

- `610a607` One pending / completed rule on every tab; Retesting awaited tile; Status column.
- `99a1904`, `6068606` KPI tab: management overview, first and default tab.
- `08d0da6`, `8dad518` Sign-in redirect fixes.
- `a4f2e69` Deploy scripts and docs (first server).
- `c8035d4` Milestone 9: Sign in with Bitrix24, health alert, production containers.
- `53e3f0c`, `d72e6d8` QA issue trend: filed vs resolved over the last 7 days.
- `4ebc994` Pending vs Done tooltip splits Dev / Issues; rework split into bug and feedback.
- `2291052` Completed = first entry into QA Backlog only.
- `b24488e` Completed yesterday, QA assignee table, Last resolved, stage totals.
- `af42863`, `62d4ad1` QA charts open their issues; issue ageing; issue lists show project and
  deadline.
- `c7a8586`, `ec58736` Rework: QA send-backs from QA Backlog, In QA or Done.
- `90f5454` QA: issues by Kanban stage as a heat matrix.
- `cb6ccdb` Export to Excel on every task list.
- `5d03c2b`, `0ae368f`, `50f16eb` Issues: Development department only on both tabs; Bug | Feedback
  split.
- `4c5c926` Info icons that explain each number, aware of the filters.
- `346f5d8` Drill-downs set the assignee / project filter; ranking clickable.
- `04a0740`, `54dc9ee`, `5dad28b`, `7db0cb7`, `8722219`, `65dbb2d`, `f859f27`, `fc1d109` Header
  alerts (overdue, over 5 days in a stage), Alert details, filtered Bitrix24 links.
- `80120d2` Filter bar: clear a filter from its closed drop-down.
- `99a39d2`, `f8fedd6`, `44037f0` Development: All / Dev / Issues switch, drill-downs, ageing,
  project-wise breakdowns.
- `64ed1af` Speed ranking: Development department only.
- `a135c0f` … `d4fe49e` Milestones 1–8: monorepo, Bitrix24 client, database and sync, metrics and
  API, real-time, web shell, Development tab, QA tab.
