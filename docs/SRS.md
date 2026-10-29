# Nural Pulse (formerly Nural Dev & QA Dashboard): Software Requirements Specification

**Name (2026-10-12):** the product is **Nural Pulse**, "the live heartbeat of every project and person". The name shows in the top bar (Nural · Pulse with a live dot), the browser title, the sign-in page, report mails, Excel and PDF exports, and the guides (files "Nural Pulse - User guide.pdf", "Nural Pulse - Module guide.pdf"). Every page ends with **Powered by Bitrix24 and Nural**, as do report mails, exports and guide footers.

Oct 9, 2026 · @Mohit

## 1. Introduction

The dashboard is a React web app with two tabs, **Development** and **QA**, that reads tasks from the Nural Bitrix24 portal (nural.bitrix24.in) and refreshes within seconds when a task changes, using a small backend that holds the Bitrix24 webhooks.

**Purpose.** Give the PM and team leads one live view of where every development task sits on the Kanban, who is late, who is fast, and how many bugs and feedback items QA has raised and how many came back as rework.

**In scope**

- KPI tab (first, default; section 13): management overview of every project: open, overdue, closed and on-time per period, project health, workload, people, activity and silent projects, insights.
- Development tab: summary tiles, assignee-wise table and chart, task ageing and speed ranking, stage x assignee x tag counts, "Due today" and "All tasks" accordions.
- QA tab: issue tiles, testing-team workload, issues waiting for retest, "Last filed" and "All issues" accordions.
- Global filters for project (workgroup), assignee, tag and date range; every dropdown is a type-to-search (contextual) dropdown.
- Task actions from the dashboard (move a task's Kanban column, change its status), made by the signed-in person as themselves (section 7, Task actions).
- Read-only connection to Bitrix24 through an inbound REST webhook, and live updates through outbound webhooks (ONTASKADD, ONTASKUPDATE, ONTASKDELETE, ONTASKCOMMENTADD).

**Out of scope (v1)**

- Creating or editing tasks from the dashboard. A task row links back to Bitrix24 for that.
- Test cases, test runs, pass rate and the "Refresh live data" and test-date parts of the existing personal QA dashboard, as Mohit asked.

**Users**

| Role | Who today | Uses |
| --- | --- | --- |
| Project Manager | Balram Jha (Software Development) | Both tabs, all projects and people |
| Team leads | Adnan Mubeen (Backend), Faiz Arsalan (Flutter), Yajur (Front End, Project Analyst) | Development tab, filtered to their team |
| QA lead | Mohit Srivastava (QA Testing) | QA tab, plus Development tab for what is coming to QA |
| Developers and testers | Members of the five teams above | Read-only view of their own numbers |

**Definitions**

- **Task**: a Bitrix24 task in a development workgroup that is not tagged as a bug or feedback.
- **Issue**: a Bitrix24 task tagged `bug` or `feedback` (either linked to a parent task, or independent and assigned to a developer).
- **Stage**: the Kanban column of the task inside its workgroup (Bitrix24 `STAGE_ID`).
- **Rework**: an issue that went back from a QA stage to To do, or a new issue raised against an existing issue (section 5).
- **Testing team**: everyone in the QA Testing department of the company structure.

**Team roster and department mapping**

The dashboard groups assignees by department: the Software Development tree is the Development group, QA Testing is the Testing team, and everyone else appears only if they own tasks in a development project. The app reads this live from Bitrix24 (`user.get` with `UF_DEPARTMENT` and `WORK_POSITION`, plus `department.get`), so the table below is a starting snapshot, not something to maintain by hand.

| Dept group | Department | Name (Bitrix ID) | Designation |
| --- | --- | --- | --- |
| Development | Software Development (head) | Balram Jha (10) | Project Manager |
| Development | BackEnd (head) | Adnan Mubeen (12) | Team Lead, Backend |
| Development | BackEnd | Vijay Prajapati (28) | Sr Software Developer |
| Development | BackEnd | Bharat Chaudhary (24) | Software Developer |
| Development | BackEnd | Harsh Agrahari (26) | Software Developer |
| Development | BackEnd | Neha Gautam (30) | Software Developer |
| Development | BackEnd | Jitendra (32) | Software Developer |
| Development | Front End (head), also Business Development | Yajur (20) | Project Analyst |
| Development | Front End | Umang Singh (34) | Software Developer |
| Development | Front End | Jaiveer Yadav (36) | Software Developer |
| Development | Mobile App (head) | Faiz Arsalan (44) | Team Lead, Flutter |
| Development | Mobile App | Devesh Kumar (46) | Flutter Developer |
| Testing | QA Testing (head) | Mohit Srivastava (14) | Team Lead, QA |
| Testing | QA Testing | Ramprawesh (16) | QA |
| Other | Tech Support (head) | Kuku Jat (50) | Team Lead, Support |
| Other | Tech Support, also Nuraltech Pvt Ltd | Sagar Barnwal (68) | not set in Bitrix24 |
| Other | IT Infra | Abhishek Tonger (38) | DevOps |
| Other | Business Development | Naveen (22) | Business Development |
| Other | HR | Riya Shah (42) | HR Executive |
| Other | Marketing, also Nuraltech Pvt Ltd | Bhanu SSavant (18) | Director |
| Other | Marketing | Deepak SShetty (40) | Director |

Headcounts on the org chart: Front End 3, BackEnd 4, Mobile App 1 (plus one sub-department), Web Full Stack 1, QA Testing 1, Tech Support 2, Business Development 2, HR 1, IT Infra 2, Marketing 1, and 6 directly under Nuraltech Pvt Ltd.

Not in the Employees screenshots, so department still to confirm: Company Admin/Deepak (1), Tushar (48), Deepankar Shisodia (52), Mishaal (54), Dipika (66), Sooraj Sairam Aanand (102), Shalini Sinha (126), Vishal Chaturvedi (158), Anusha Srivastava (164). Yajur, Sagar Barnwal and Bhanu SSavant sit in two departments; the dashboard uses the development or testing one when a person has both.

## 2. Workflow

Every development workgroup uses the same 11-stage Kanban, and the dashboard reads a task's position on it to decide whether it is pending, with QA, ready or live.

![Workflow](images/workflow.png)

The top row is development and counts as Pending; the Complete button sends the task to QA Backlog, and everything from there on counts as sent to QA.

**Task creation (in Bitrix24, unchanged).** Title, description with images, deadline, assignee, tag (new development, client feedback and so on), then Create; the task lands in To do.

**Bugs and feedback.** When QA finds a problem in In QA, they create a bug or feedback task, either linked to the task (parent or related) or independent and assigned to the developer, and move the original task to Issue Raised. The bug starts at To do and runs the same board. When all linked bugs are fixed, the bugs and the task move to Done. A bug that fails retest and goes back to To do, or a new bug raised on a bug, counts as rework for that developer.

**Release.** After all bugs are resolved, modules are deployed, sanity-checked, and every ticket moves to LIVE. Any ticket that needs discussion can go to On Hold from any stage.

## 3. Development tab

The Development tab answers three questions for the PM and team leads: how much work is open, who is late, and who finishes fastest. Everything on it reacts to the global filter bar.

**DEV-00 Filter bar (sticky, top of both tabs)**

- Project (multi-select workgroup), Assignee (multi-select, grouped by department), Tag (multi-select), Date range (created or deadline, default: all time).
- Every dropdown is a contextual search: typing filters the options, and options are limited to values present in the current data (for example, picking project "Support Tool" narrows Assignee to people with tasks there).
- A filter that is set shows a × on its closed drop-down (and on the date range), so it can be cleared without opening it. "Reset filters" still clears them all.
- Filters are kept in the URL so a filtered view can be shared as a link.
- A "Live" indicator shows the time of the last change received from Bitrix24.

**DEV-00a All / Dev / Issues switch (top of the Development tab)**

- Three toggles: **All** (default), **Dev** and **Issues**. Dev = tasks (not tagged bug or feedback); Issues = bugs and feedback; All = both.
- Whatever the switch, the tab only counts work in a workgroup assigned to people in the **Development department** (Software Development tree, read from the company structure). Bugs and feedback are only ever assigned to developers, so the QA tab uses the same rule for its issues and both tabs show the same issue total. An issue assigned to a tester or another department counts on neither tab until it is reassigned in Bitrix24.
- Every tile, card, drop-down option and task list on the tab follows the switch. It is kept in the URL (`scope=dev|issues`; All is the default and is left out).

**Drill-down from any count.** Every count on the Development tab opens the "All tasks" accordion (DEV-08) narrowed to exactly that count, and the accordion title takes the count's label, for example "All tasks: Neha Gautam · Pending" or "All tasks: Umang Singh · To do, overdue". This covers the tiles, every number and the totals row of the DEV-02 and DEV-03 tables, the bars of the DEV-02 and DEV-03 charts, and each part of a DEV-05 cell. A count that belongs to one assignee or project (a table row, a chart bar, a matrix cell, an ageing segment, a speed-ranking row) **also sets that Assignee or Project filter**, so the whole tab follows the click. Clearing, resetting or changing the filters afterwards returns "All tasks" to its default (title and list); "Show all tasks" does the same. Clicking a name (not a number) sets the filter only.

**DEV-01 Summary tiles (one row: Projects, then the tiles below)**

| # | Tile | Counts |
| --- | --- | --- |
| 1 | Total tasks | All tasks in scope, with a sub-line split by project or by employee when that filter is set |
| 2 | Pending | Tasks in To do, In progress, Pushed to Master, Merged to Development, Pending for QA or Issue Raised (behind QA Backlog, not on hold) |
| 2a | On hold | Tasks in On Hold: neither pending nor completed |
| 3 | Ready for deployment | Tasks in Done |
| 4 | Deployed to live | Tasks in LIVE |
| 5 | Overdue | Pending tasks whose deadline has passed (a subset of tile 2, shown in red) |
| 6 | Done today | Tasks completed today (Complete pressed, moved to QA Backlog) |

Clicking a tile opens the "All tasks" accordion pre-filtered to that tile.

**Projects tile and popup (2026-10-13).** The first Development tile, like Active projects on KPI. It counts a **fixed set of projects**: every project still active in Bitrix24 whose owner (the Bitrix24 group owner) is in the Development or QA Testing department, or is a PM (config/roles.json `pms`, or the PM role set in the People directory). The All / Dev / Issues switch and the other filters do not change it; only the Project filter narrows it, and a person who sees only their own tasks counts the projects of those tasks (`ownedProjects` in routes/dev.ts). Projects owned by anyone else (Tech Support, Other) are left out. It splits into **Hold** (nothing open and at least one task in On Hold: every unfinished task is on hold), **Active** (open tasks and activity in the last 30 days, `SILENT_PROJECT_DAYS`) and **Silent** (everything else: no open task, or no activity for 30 days), which add up to the total. Every owned project counts, finished ones too (2026-10-14: a project with nothing open is Silent). These use all the project's tasks, so the switch and filters do not change them.
- **Activity** = a task changed in Bitrix24 or moved between stages (`lastActivity`). A **bulk change** is not activity: a minute in which 10 or more tasks of one project were touched (`BULK_TOUCH_MIN`, `bulkTouchedIds`), e.g. a clean-up moving 179 tasks at once.
- Open, Done, Overdue, Spill and the people follow the tab's switch and filters; a project with none of them there still appears, with zeros.
- The number, Active and Silent open the **Projects at work** popup on that set ("Show all projects" returns to all), with a search for a project or person. Projects are sorted by **activity this week** (tasks touched in the last 7 days, bulk changes left out), then by **deadline**, earliest first (none last).
- A **Day / Week / Month** switch in its header (default Day; weeks Monday to Sunday, IST) sets three columns, named after it: **Done prev day / week / month** (pushed to QA Backlog in the previous period, `isDonePrev`), **Overdue today / this week / this month** (overdue now, deadline in the current period, `isOverdueInPeriod`) and **Spill of prev day / week / month** (`isSpill`). Their task lists use the presets `donePrev`, `overduePeriod` and `spill` with `period=day|week|month`.
- Each project is an **accordion row**; opening one closes the one open before. The row shows Active or Silent, the number of people, activity (7 days), its **deadline** (the latest deadline of its tasks) and its totals. Opened, it lists who works on it: one line per assignee **with open tasks in it** (people with none are not listed; the project line keeps every total), with activity, their **last deadline**, **Open** (pending) and the three period columns. (The All tasks column was removed, 2026-10-13.)
- **Spill** of a period = the deadline was in the previous day, week or month and the task was not pushed to QA Backlog by its end: still pending or on hold, or completed later.
- **No deadline** column (2026-10-14): open (pending) tasks with no deadline set (`isOpenNoDeadline`; task-list preset `noDeadline`).
- **Total overdue** column (2026-10-14), next to Overdue: every pending task (not on hold) past its deadline, whenever the deadline was; it does not follow the Day / Week / Month switch (`overdueAll` on each row and person line, `isOverdue`; task-list preset `overdue`). Red badge, with the Dev tasks / Issues split on hover.
- **Like every table** (2026-10-14, `features/dev/projectsColumns.ts`, table id `dev-projects-at-work`): a **Columns** menu (show, hide, order), column headers dragged into another order, project rows dragged by the grip into the reader's own order ("Your order ×" returns to most active first), and an "i" on every column header. Saved per person. Project lines carry a status stripe (green Active, amber Silent, blue Hold), counts are badges (red for No deadline, Overdue and Spill), people lines are striped with initials.
- **Excel** and **PDF** (`projectsExport.ts`): the whole table as shown (search and Active / Silent / Hold applied, every project whether opened or not, the reader's columns in their order), one line per project ("All") then one per person: Excel in the dashboard's Excel look, PDF as a printed table on landscape A4 with the period and filters.
- Hovering any count shows its split: **Dev tasks N · Issues M** (issues = tagged bug or feedback; `issues` on each row).
- Any count closes the popup and opens those tasks in "All tasks" (project, and assignee on a person line). That list then shows **‹ Back to Projects at work**, which reopens the popup as it was left (same set, period and open project). `GET /api/dev/projects` returns `summary` (projects, active, silent) and `rows` (`projectWork`, `projectWorkSummary` in `metrics.ts`; `features/dev/ProjectsDialog.tsx`, `projectsPopup.ts`).

Under each tile's number, a breakdown follows the All / Dev / Issues switch (DEV-00a): **All** splits it into Dev and Issues, **Issues** into Bug and Feedback, and **Dev** shows the number alone. The parts add up to the tile, and each part opens its own list, e.g. "All tasks: Pending · Bug". The former "Completed (sent to QA)" tile was removed (2026-10-10) as not relevant to the Development tab; the completed stage group still feeds the Done column of DEV-02 and the speed ranking.

**Assignee / Project switch.** The breakdown cards DEV-02, DEV-03 (chart and table), DEV-05, QA-02, QA-04 (table view) and QA-05 each have an Assignee / Project switch in their header. "Assignee" (the default) gives one row or bar per person; "Project" gives one per workgroup, with the same columns and counts. Clicking a row or bar then sets the Assignee or the Project filter. Cards that are about people by nature (DEV-04 speed ranking, QA-06 testing workload, QA-07 retest by creator) have no switch.

**DEV-02 Assignee-wise (or project-wise) table and chart**

- Table: one row per assignee (or project) with Total, Pending, Done, Due today, Completed today, **Completed yesterday** (first reached QA Backlog yesterday, IST). Sortable, sticky header, totals row.
- Chart beside it: horizontal stacked bars per assignee (or project) (Pending vs Done), sorted by Total. The tooltip splits Pending and Done the same way as the tiles: Dev tasks and Issues (All), Bug and Feedback (Issues), no split (Dev).
- Clicking a name sets the Assignee (or Project) filter.

**DEV-03 Task ageing**

- Ageing buckets for open (pending) tasks by days past deadline: Not due, 0 to 2, 3 to 7, 8 to 14, 15 to 30, over 30 days, plus No deadline.
- Chart: one stacked bar per assignee (or project), one segment per bucket; above it, the total of each bucket. Table: bucket counts per assignee (or project) with a totals row.
- Every count, bar segment and bucket total opens those tasks (drill-down). On Hold tasks are pending, so they appear in the buckets, but they are not Overdue (open question 6).

**DEV-04 Speed ranking**

- Ranks employees by how early, on average, their tasks reached QA Backlog compared to the deadline (formula in section 5). Shows rank, name, tasks completed, average days early or late, on-time %. Top 3 get a badge. Clicking a row (or its Tasks number) sets the Assignee filter and opens the tasks it counts: sent to QA, with a deadline (`/api/tasks?ranked=true`).

**DEV-05 Stage x assignee x tag counts**

- A matrix: rows are assignees (or projects), columns are the 11 Kanban stages, each cell is a count; a tag toggle above it splits or filters by tag (new development, client feedback, testing and so on). Heat shading by count.
- Each stage's colour bar at the top shows that stage's total (both tabs).
- Each cell is split into not overdue and **overdue** (shown in red). Only pending stages can have overdue tasks. Both parts, and the row total, open those tasks (drill-down, including the selected tag).

**DEV-06 Accordion: Tasks due today** (closed by default)

- Tasks whose deadline is today, in the current filters. Columns: Bitrix ID (links to the task), Title, Assignee, Project, Stage, Tags, Priority, Deadline, Ageing. Sorted by deadline, latest first.

**DEV-07 Accordion: Overdue tasks** (closed by default)

- Pending tasks whose deadline has passed, in the current filters (the same set as the Overdue tile). Same columns as DEV-06, with Ageing shown as days overdue in red. Sorted by deadline, latest first, and opened by clicking the Overdue tile.

**DEV-08 Accordion: All tasks** (closed by default)

- Same columns as DEV-06 plus Creator and Created date, for every task in the filters. Sorted by deadline, latest first. Paginated at 50 rows with a search box.
- Clicking a row opens a side drawer with the full task: description, tags, priority, deadline and ageing, stage history (timeline of stage moves with who and when), linked bugs and feedback, and an "Open in Bitrix24" button.

## 4. QA tab

The QA tab shows how many bugs and feedback items were filed, how many are still open, what is waiting for retest, and how much rework each developer generated. It follows the layout of Mohit's existing QA Pulse dashboard, without test cases, test runs, pass rate, test dates or the manual Refresh button (data is live).

**QA-01 Summary tiles (one row of 4)**

| # | Tile | Shows |
| --- | --- | --- |
| 1 | Total issues filed | All tasks tagged bug or feedback in the filters (project and assignee), whoever they are assigned to |
| 2 | Open / pending | Open (pending) issues with a ring showing Resolved % vs Open % |
| 2a | On hold | Issues in On Hold, split Bug / Feedback |
| 3 | Last filed | If issues were filed today: "Today" and today's count. Otherwise the most recent filing date and that day's count |
| 3a | Last resolved | The most recent day issues were **pushed to QA Backlog** (a fix handed to QA, re-pushes included), and how many that day; opens the "Latest resolved issues" accordion |
| 4 | Rework issues | Count of issues that count as rework (section 5) |

Under each tile's number the count is split into **Bug | Feedback**; the parts add up to the tile (for Last filed: that day's bugs and feedback). Each part opens "All issues" narrowed to it, e.g. "All issues: Open · Bug". Apart from that, Open / pending also shows **Resolved n · p%** (issues in QA Backlog, In QA, Done or LIVE); the ring shows the same share.

**Retesting awaited** (sixth tile): every task waiting for QA, in QA Backlog or In QA, split into **Dev tasks | Issues**; each part opens that list ("Tasks: Retesting awaited · Dev tasks"). **Retesting awaited by assignee / project** (card, Assignee / Project switch): per row QA Backlog (Dev, Issues, total), In QA (Dev, Issues, total) and Total, with a totals row; every number opens those tasks and a row's number sets that filter (`GET /api/qa/retest?groupBy=`, tasks via `/api/tasks?kind=all&preset=retest&stage=&issue=true|false`).

**QA-02 Issues by assignee**: per developer or per project, three views. **Open / Resolved**: stacked bars split four ways (open bugs, open feedback, resolved bugs, resolved feedback); the tooltip shows e.g. "Open 54 (Bug 50, Feedback 4)". **Bug / Feedback**: the reverse split. **Table**: the DEV-02 assignee-wise table for issues (Total, Pending, Done, Due today, Comp. today, Comp. yesterday, totals row). Every bar segment and number opens those issues.

**QA-03 Issue status by Kanban stage**: the same stage heat matrix as DEV-05, for issues: rows are assignees (or projects, Assignee / Project switch), columns the 11 Kanban stages with their board colours, cells shaded by count and split into not overdue and **overdue** (red), row totals. A **Bug / Feedback** selector (in place of DEV-05's tag) narrows it. Every number opens those issues in "All issues" and sets the Assignee or Project filter. Alternate views: **Table** (Bug, Feedback, Total and a column per stage, totals row, sortable) and **Chart** (issues per stage in board order and colours). Full width.

**QA-04 Issue ageing**: the same card as DEV-03 task ageing, for open issues: buckets Not due, 0 to 2, 3 to 7, 8 to 14, 15 to 30, over 30 days **past deadline**, and No deadline; a stacked bar per assignee (or project) with bucket totals, a table view, Assignee / Project switch; every count opens those issues (replaces "age since created", 2026-10-10).

**QA issue trend (last 7 days)**: a line chart over the last 7 days (APP_TIMEZONE, today included) with four lines: Bug filed and Feedback filed (created that day, light shade) and Bug resolved and Feedback resolved (pushed to QA Backlog that day, as Last resolved, dark shade of the same colour). An Assignee / Project switch and a picker narrow it to one assignee or project (default: all). Clicking a point opens those issues for that day and type.

**QA-05 Rework by developer**: bar per developer (or per project) with rework count and rework % of their issues, stacked into Bug and Feedback. The tooltip gives the send-backs, reworked issues and issues of each type; clicking a segment opens that type's rework issues.

**Drill-down on the QA tab.** As on the Development tab, every number and chart bar opens the "All issues" accordion narrowed to it, with the accordion title taking its label, and a number of one assignee or project also sets that filter; clearing or changing the filters returns the list to its default. This covers the tiles and their Bug / Feedback parts, Issues by assignee (Open, Resolved, Bug, Feedback bars), the stage matrix and table, Issue ageing, Rework by developer (Bug and Feedback segments), the issue trend points (filed: `preset=lastFiled`, resolved: `preset=lastResolved`, with `day` and `type`), Testing team workload (opens that tester's testing tasks, titled "Testing tasks: …") and Waiting for retest (opens the issues that tester filed, `createdBy`).

**QA-06 Testing team workload**

- Tasks tagged testing or re-testing, or assigned to anyone in the QA Testing department.
- Table per tester: Total, Pending, Done, Due today, Overdue, next deadline.

**QA-07 Waiting for retest**

- Issues currently in QA Backlog or In QA: total count, then a table grouped by creator (the tester who filed it), since the creator is who retests it. Columns: creator, count, oldest waiting (days).

**QA-08 Accordion: Latest filed issues** (closed by default)

- Issues filed on the "Last filed" date from QA-01. Columns: Bitrix ID, Title, Type (Bug or Feedback), Assignee, Creator, Project, Priority, Stage, Linked task, Created, Deadline. Sorted by created date, newest first.

**QA-09 Accordion: All issues** (closed by default)

- Every bug or feedback task in the filters, same columns plus Rework flag and Age. Sorted by created date, newest first. Row click opens the same task drawer as DEV-08, which here also shows the parent task and the reopen history.

## 5. Metric definitions

Every number on the dashboard is computed on the backend from stage names, tags, deadlines and the stage-move log, so the browser and any future report agree. Stages are matched by **title**, not ID, because each workgroup has its own stage IDs (checked: "To do" is 1054 in group 148 and 1088 in Support Tool, group 154) and some boards have no On Hold column.

**Stage groups**

| Group | Stages |
| --- | --- |
| Pending | Any stage behind QA Backlog except On Hold: To do, In progress, Pushed to Master, Merged to Development, Pending for QA, Issue Raised |
| On hold | On Hold: neither pending nor completed (changed 2026-10-11), with its own tile on every tab |
| Issue raised | A task tagged testing or re-testing (not an issue) in Issue Raised (2026-10-15): the tester has filed the issues and the work waits on the developers. Status "Issue raised"; neither pending nor overdue. Issues in Issue Raised stay pending (`isIssueRaisedTest`, metrics.ts) |
| Completed (sent to QA) | QA Backlog, In QA, Done, LIVE; on a board without QA stages, also any task closed in Bitrix24 |
| Ready for deployment | Done |
| Deployed | LIVE |

A task with stage ID 0 (Bitrix24's default for a task never moved on the board) counts as To do.

**Task vs issue**

- Issue = a task tagged `bug` or `feedback` (case-insensitive). Every other task in a development workgroup is a Task.
- Issues are only ever assigned to the Development department; both tabs count only those (an issue assigned elsewhere is a data error to fix in Bitrix24).
- An issue is linked to a task when its Parent task is set, or when the task is in its Related tasks. Otherwise it is independent and counts against its assignee.
- The Development tab counts Tasks, Issues or both, by its All / Dev / Issues switch (DEV-00a), for the Development department only. The QA tab counts **every** issue, whoever it is assigned to (e.g. Tech Support), so its issue total can be higher than the Development tab's Issues total (changed back 2026-10-10). Pending / Done / On hold (Development tab), Open / Resolved / On hold (QA tab) and Open / Closed / On hold (KPI tab) use one rule (On Hold its own group since 2026-10-11, so pending + completed + on hold = total): **Completed** = in QA Backlog, In QA, Done or LIVE; **pending** = any stage behind QA Backlog (To do, In progress, On Hold, Pushed to Master, Merged to Development, Pending for QA, Issue Raised), even if the task was completed before and sent back. On a board without QA stages (e.g. New / In progress / Finished), a task closed in Bitrix24 is completed. Pending + completed = total on every tab (changed 2026-10-10). For Development-department issues the two tabs give the same numbers (2,107 completed, 68 pending on 2026-10-10).

**Formulas**

| Metric | Definition |
| --- | --- |
| Overdue | Pending AND deadline < now |
| Due today | Deadline date = today (Asia/Kolkata), any stage group except Deployed |
| Completed / Done today | Entered QA Backlog today (first entry), from the stage-move log. A task whose history skips QA Backlog (e.g. a bulk move straight to Done or LIVE) is not completed. Only a task with no recorded stage moves falls back to its Bitrix24 closed date. Comp. yesterday uses the same rule for yesterday (APP_TIMEZONE) |
| Open issue | Issue not in Done or LIVE |
| Resolved % | Issues in Done or LIVE / all issues x 100 |
| Ageing (open task) | Today minus deadline, in days; negative = not yet due. Buckets: Not due, 0-2, 3-7, 8-14, 15-30, over 30, No deadline |
| Age (open issue) | Today minus created date, in days |
| Last filed | Max created date of issues; count = issues created on that date |

**Speed ranking.** For each completed task, lead time against deadline = deadline minus the time it first entered QA Backlog, in days (positive = early). Per employee:

```latex
\text{Score} = \overline{(\text{deadline} - t_{\text{QA Backlog}})}\ \text{in days}, \quad \text{on-time \%} = \frac{\#\{t_{\text{QA Backlog}} \le \text{deadline}\}}{\#\text{completed}}
```

Rank by on-time % first, then by average days early. Employees with fewer than 3 completed tasks in the range are listed but not ranked. Tasks without a deadline are left out.

**Rework.** An issue counts as rework, charged to its assignee, when QA sends it back after it was fixed and came for testing: a move from **QA Backlog, In QA or Done** back to **Issue Raised, To do or In progress**. Each send-back counts once. **Only the stage flow counts**: an issue linked to (raised on) another issue and the Re-Open tag no longer count as rework (changed 2026-10-10).

The workflow behind it: a tester files a bug, it sits in **Issue Raised**, the PM or team lead reviews it and moves it to **To do** for a developer; that first cycle is **not** rework. When the fixed issue reaches QA Backlog / In QA and fails, it goes back (usually to Issue Raised, then the PM sends it to To do again): that is **one** rework, counted at the send-back; the PM's Issue Raised to To do step is not counted again. So moves **from** Issue Raised never count. The same rule flags live "reopened" changes in the sync worker.

Each reopen counts once, so an issue reopened twice adds 2 to the rework count. The task drawer shows each reopen with date and who moved it.

**Testing team.** Members of the QA Testing department (today Mohit Srivastava, Team Lead QA, and Ramprawesh, QA) plus anyone added to that department later, read from the company structure. A task belongs to Testing when it is tagged `testing` or `re-testing`, or its assignee is in the testing team.

**Header alerts (bell).** Computed for the Development department's tasks and issues (the Development tab on All), ignoring the filter bar.

- *Overdue*: overdue tasks (rule above) grouped by assignee and project, with the count and the most days past deadline.
- *Stuck*: a task in any stage except LIVE for more than **5 days** (`STUCK_DAYS`), grouped by person, project and stage, with the count and the longest wait. Days in stage = calendar days since the last move into the current stage in the stage-move log; a task never moved has been in To do since it was created; with no recorded move, the last change date is used. Done counts too (only LIVE is left out, as requested).
- *Who is named*: the assignee, except in **QA Backlog and In QA**, where the next step is the tester's. There the alert names the **creator** when the creator is in the QA Testing team, otherwise the **QA lead** (the head of the QA Testing department in the company structure, today Mohit Srivastava). A person's own issues and those routed to them as QA lead make one line, marked "QA lead".

## 6. UI design (Nural theme)

The dashboard is one page with a top bar, two tabs, a sticky filter bar, then cards in a 12-column grid, styled with the Nural design tokens read from the Figma file (Nural ISP Web, node 2188-72215): a blue scale with B500 as primary, teal as accent, Manrope for headings and labels, Work Sans for body and table text. Stage colours are the real Bitrix24 board colours.

**Nural brand (2026-10-29).** Nural Pulse is the base name for Nural's internal tools (later: Nural Pulse Projects, Nural Pulse CRM). The UI follows the Nural brand skill, Product UI track, enforced where every page picks it up, never page by page: **logo** the supplied lockup files only (from the design team's Nural Pulse Logo folder, SVG; `apps/web/public/brand/`): the white horizontal lockup in the top bar, the primary or white lockup by theme in the footer (`.logo-light` / `.logo-dark`), the symbol as the favicon; never the name set in type; **colour** the palette only, flat fills (no gradients, glows, shadows, blur or decorative shapes), page fill Primary 100 (`--bg`), cards White, the top bar and side menu flat Primary 500 (`--chrome`, Primary 800 in dark), labels on Secondary 500 always Primary 700 (`--on-accent`, never white), fixed navy `--navy` for card actions; **type** Manrope and Work Sans at weights 400 and 700 only, line height Auto, letter-spacing 0, sizes 24 / 20 / 18 / 16 / 12 / 10 (`tailwind.config.ts` maps the other weights, tracking and shadows to the brand values, so no page can use them); **buttons** pills in uppercase Manrope Bold, one shared set in `index.css`: `btn btn-page` (the main action on a screen, Secondary 500), `btn-card` (the main action in a card or dialog, Primary 700), `btn-stroke` (outlined), `btn-link` (text); pages add only size and layout; **selected states** the side menu's current item is White text and icon with a White underline, segmented controls a White segment on a Primary 200 track; no edge stripes, no icon tiles (dialog and page icons sit inline in Primary 500); **tables** the brand table pattern on the card (no navy header, no zebra): uppercase Primary 700 column labels over one Primary 400 rule, Primary 300 hairlines between rows, totals on a Primary 300 band; **charts** flat bars and lines, Neutral 200 grid lines, a flat White tooltip. Open: the amber warning colour (`--warn`) is not in the Nural palette; it stays until design names the warning colour.

**Design tokens**

| Token | Figma variable | Value | Used for |
| --- | --- | --- | --- |
| `--primary` | Blue/B500 | #32499F | Buttons, active tab, links, chart series 1 |
| `--primary-dark` | Blue/B700 | #18244E | Top bar, headings |
| `--primary-deep` | Blue/B800, B900 | #111937, #0C1226 | Dark mode surfaces |
| `--primary-soft` | Blue/B100, B200, B300 | #F1F3FB, #E2E7F6, #C6CEED | Page background, selected rows, borders |
| `--primary-muted` | Blue/B400 | #8D9EDB | Chart series 2, inactive tab |
| `--bg` | Blue/B50 | #F8F9FD | Page background |
| `--surface` | White | #FFFFFF | Cards |
| `--accent` | Teal/T500 | #05CFD3 | Live dot, highlights, chart series 3 |
| `--accent-dark` | Teal/T600, T700 | #039194, #026668 | Accent text on light background |
| `--accent-soft` | Teal/T100, T200 | #EDFEFF, #DBFEFE | Accent chips |
| `--bad` | Red/R500 | #E63639 | Overdue, rework |
| `--bad-dark` / `--bad-soft` | Red/R700, R200 | #8A282A, #F1B9BA | Overdue text, overdue tile background |
| `--text` | Black | #231F20 | Body text |
| `--border` / `--text-muted` | Grey/Grey 200, Grey 300 | #DFDDDE, #B9B2B4 | Card borders, secondary text |
| Title | Titles/T-B | Manrope Bold 24 | Page title |
| Card header | Headers/H1-B, H3-B | Manrope Bold 18, 14 | Card titles |
| Tile number | Titles/ST-B | Manrope Bold 20 | Stat tile values |
| Labels | Labels/Label-L-B, L-R | Manrope 10, letter-spacing 4% | Tile labels, chips |
| Buttons | Buttons/Button-S-B | Manrope Bold 12, letter-spacing 4% | Buttons |
| Body | Body/Body-R | Work Sans Regular 12 | Text |
| Table | Table Data, Table Data - B | Work Sans 10, Regular and Bold | Table cells |

The Figma has no success green or warning amber, so the dashboard uses Teal/T600 for good and #F59E0B for warning until design adds them. Radius and spacing follow a 4 px grid (8 px card radius) until the components are matched one by one.

**Stage colours (from Bitrix24, used in charts and stage chips)**

| Stage | Colour | Stage | Colour |
| --- | --- | --- | --- |
| To do | #00C4FB | QA Backlog | #FDB051 |
| In progress | #47D1E2 | In QA | #FDB051 |
| On Hold | #EF3000 | Issue Raised | #47D1E2 |
| Pushed to Master | #FFAB00 | Done | #8EC82F |
| Merged to Development | #FF5752 | LIVE | #75D900 |
| Pending for QA | #FDB051 |  |  |

Three stages share #FDB051 on the board, so charts add a pattern or a shade step to tell them apart.

**Components (to match from the Figma component library)**

- Top bar: Nural logo, app name, Development and QA tabs, alerts bell, Live indicator, user menu.
- Every task list (all tabs) has a **Status** column: Completed, Pending or On hold, by the rule in section 5.
- Export to Excel: every task-list accordion (Tasks due today, Overdue tasks, All tasks, Latest filed issues, All issues) has an **Excel** icon that downloads the list exactly as shown (filters, the clicked number, search and order; all pages, not only the visible 50). One row per task with every detail the dashboard holds: Task ID (linked to Bitrix24), title, type, Project ID and name, stage (dashboard and Bitrix24 names), status (Completed / Pending), Assignee ID, name and department, Creator ID and name, priority, tags, created, deadline, closed, days past deadline, overdue, issue age, rework, linked task and an "Open in Bitrix24" link; an About sheet names the list. Descriptions are not included (read live from Bitrix24 per task). The file is named after the accordion, e.g. "All tasks · Umang Singh · Pending 2026-10-10.xlsx" (`GET /api/tasks/export`, same parameters as `/api/tasks`).
- Info icon (ⓘ): every tile, card title, main table column and accordion has a small "i". Hovering or focusing it shows a one-line explanation of how the number is worked out (wording kept in `apps/web/src/features/info.ts`), and under it what the current filters and switch cover, e.g. "Showing: Dev tasks · Moto India · Umang Singh". For "All tasks" / "All issues" the explanation follows the list that is open, e.g. "Umang Singh · To do, overdue: In To do. Overdue only."
- Alerts bell (top bar, right): a red badge with the number of projects that have alerts (section 5, Header alerts). Clicking it opens a short **project-wise** summary, one line per project, e.g. "Nural Edge: 194 overdue · 376 over 5 days"; each number opens those tasks (filter bar set to the project). "See alert details" switches to the Development tab and opens the **Alert details** accordion (DEV-09) for the person and stage breakdown.
- **DEV-09 Accordion: Alert details** (bottom of the Development tab, closed by default, opened by the bell). Toggles: **Overdue | Over 5 days in a stage**, and **Project-wise | Assignee-wise**; on the stage view a **Stage** filter (one or more stages). Rows are grouped under each project (or person) with a subtotal; groups are **collapsed by default** and open when clicked ("Expand all / Collapse all" opens or closes every group; changing the view collapses them again); each line shows the other dimension (person, marked tester or QA lead, under a project; project under a person), the stage, the count, the most overdue or longest wait, and, for stage alerts, how many Bitrix24 will list. Every subtotal and count opens exactly those tasks in "All tasks" and sets the filter bar to the project (and the assignee when the alert names the assignee), with the switch on All. Each line also has a **Bitrix24** link to that project's task board with the Bitrix24 filter already applied (`apply_filter=Y`): Overdue lines filter by responsible person (`RESPONSIBLE_ID`), Bitrix24's Overdue status (`STATUS[]=-1`) and the pending stages except On Hold (`STAGE_ID[]`), matching the dashboard's Overdue rule; "over 5 days" lines also filter by the Kanban stage (`STAGE_ID[]`, that project's own stage IDs for the stage, plus 0 for To do, Bitrix24's stage for tasks never moved). Tester lines filter by creator (`CREATED_BY`) and QA lead lines by stage only. Bitrix24's filter has no "days in this stage" field (the stage-entry date exists only in the dashboard's stage-move log), so for "over 5 days" lines the Bitrix24 board lists every task in that stage, including ones that entered it in the last 5 days. The table therefore shows both numbers, e.g. 479 over 5 days and 508 "In stage in Bitrix24"; the dashboard's own list (clicking the count) is the exact set, each task ID linking to Bitrix24. The work is fixed there; the alert then clears by itself on the next sync (the dashboard stays read-only).
- Filter bar: contextual search Combobox (multi-select, chips, "Clear" inside and a × on the closed control), date range picker (with ×), "Reset filters".
- Stat tile: label, big number, sub-line (delta or split), optional status colour; clickable. Text is clear, not faded (2026-10-15): the label in bold uppercase Blue B500, the parts' names and the sub-line in body text (`--text`), numbers in Blue B700 (red on a bad tile); the muted grey is kept only for separators.
- Card: title, optional toggle (table or chart), body, empty state and loading skeleton.
- Data table: sticky header, sort arrows, pagination, row hover, stage chip, tag chips, priority badge (High red, Normal grey, Low blue), overdue text in `--bad`.
- Accordion: header with count badge, closed by default.
- Task drawer: a 480 px right panel (full width on a phone) with stage timeline and "Open in Bitrix24" button. (Centred at 70% on 2026-10-13, back on the right on 2026-10-14 at the user's request; the focus view and spotlight keep 70%.)
- Toast: "Task 41580 moved to In QA" when a live update lands (can be turned off).

**Layout**

The wireframes below show the order of cards on each tab at 1440 px. On screens under 1024 px, cards stack in one column and tiles wrap to two rows.

![Development tab wireframe](images/wireframe-development.png)

Grey blocks stand for live numbers; Overdue is the only tile with a status border. The wireframe still shows the "Sent to QA" tile, which was removed (see DEV-01). The same top bar and filter bar sit on the QA tab.

![QA tab wireframe](images/wireframe-qa.png)

The QA tab swaps the Tag filter for a Bug or Feedback filter and puts Rework in the only tile with a status border.

**Profile (2026-10-11).** The round button at the right of the top bar shows the person's monogram (Mohit Srivastava → MS). Its panel holds the name and role (Admin, PM, Team lead, Product owner or My tasks), the theme choice, live-update toasts, **Layout: Reset** and **Sign out**.

**Task list paging (2026-10-11).** Every task list has **Rows per page** (10, 25, 50, 100; remembered in the browser, default 50), the range shown (e.g. 61–70 of 2,439), first / previous / next / last buttons and a **page box**: type a page number and press Enter to jump there.

**Drag to rearrange (2026-10-11).** Tiles, cards and sections (accordions) can be put in any order.
- **How:** drag the grip (⠿) that shows at the top of a tile, card or section on hover. With the keyboard: focus the grip, then Space, the arrow keys and Space.
- **Within its own group only.** Each tab has a tiles group, a cards group and a sections group (Support has one cards group), and an item never leaves its group. For example, the task lists stay below the cards. Each card keeps its width.
- **Saved per person** on the server (`user_prefs.layout`, by group: `dev.tiles`, `dev.cards`, `dev.sections`, `qa.*`, `kpi.*`, `support.cards`), so it follows them on any computer.
- **After an update:** a new card appears after the one it follows by default, and removed ones drop out (`components/layout/order.ts`).
- **Reset:** Profile → Layout → **Reset** restores the default order everywhere.

**Card widths follow the order (2026-10-11).** Cards fill their rows with no gaps.
- A full-width card has its own row. Two half-width cards side by side share one: a default pair keeps its split (7 + 5); other pairs split 6 + 6.
- A half-width card left alone in its row widens to full.
- Dropping a half-width card next to a full-width one (just before or after it) pairs them, and the full-width card turns half. The pair is saved per person (`<tab>.pairs`) and forgotten once the two are moved apart.
- Rules: `rowSpans` and `pairOnDrop` in `components/layout/order.ts`, with tests.

**One look on every page (2026-10-11).** Every page uses the same parts:
- **page header** (`components/ui/PageHead.tsx`): an icon (inline, Primary 500, since 2026-10-29), the title and a line under it, with the page's own controls on the right (Development's All / Dev / Issues, KPI's Day / Week / Month, the Employee pages' search, view and export);
- **cards and tiles** with 16 px corners (controls 10 px; `--radius-card`, `--radius-control`). (Since 2026-10-29, Nural brand: no corner glow, no lift or shadow; controls 8 px.)
- **section headers** with their open/close arrow inline (no tile, since 2026-10-29).

**Same tools on every page (2026-10-11).**
- The Employee pages have draggable tiles and cards with the data-point toolbar (move, explain, hide), Customise and the guided tour, like the dashboard tabs:
  - Company tree: tiles for departments, people, department heads and departments without a head;
  - People directory: employees, signed in, active now, never signed in;
  - Access permissions: set per person, set per department, admins, see all data. Its rights table and Recent changes are two cards.
- Their tour steps and Customise names are in `features/tour/steps.ts` and `labels.ts`.

**Guides (2026-10-11): one set per level of access.** The **Guides** icon on the dock opens a **User guide** and a **Module guide**. Each person gets the set that matches their current rights (`components/shell/guideSet.ts`: admin → *admin*, employees → *manager*, KPI → *owner*, Support → *support*, else *member*):

| Set | Pages covered | Wording |
|---|---|---|
| member | Development, QA, My insights, Help | "your tasks" |
| support | Development, QA, Support, My insights, Help | "your tasks" |
| owner | KPI, Development, QA, Insights, Help | all data |
| manager | KPI, Development, QA, Support, Insights, Company tree, People directory, Help | all data |
| admin | everything, including Access permissions, Integration (Connections, Mailing), Help and Finance | all data |

What each set holds:
- **Chapters:** only the pages that level can open, worded for that level (members' own wording where the tour has one).
- **Screenshots:** taken as a real person of that level, so a member's show only their own tasks.
- **Names:** every person's and project's name, avatar initials and task titles are replaced by stand-ins. The full list of names is read with admin access, so a member's capture is checked too; a capture stops if a real name is left.
- **Texts:** the data-point texts are the tour's own steps and the "i" definitions.

- **Page guides (2026-10-12):** besides the User guide and the Module guide, each set has one short PDF per page it can open ("Development guide.pdf"), listed on Help › Documents.
- **Notes in every guide:** why one number can differ between two places, what the top switches change, the spotlight, tables you shape and Export page.

Files: sources in `docs/guides/src` (`build_guides.py` with `SETS` and `page_guide`, `print.mjs`), images in `docs/guides/img/<set>`, PDFs in `docs/guides/<set>` (page guides in `<set>/modules`) and served from `apps/web/public/guides/<set>`.

Rebuild after a change people can see:
1. export `steps.json` from `features/tour`;
2. run `build_guides.py`;
3. run `print.mjs`.

**Side drawer and page tools (2026-10-11).**

*Side drawer:*
- **Where pages are:** navigation lives in a side drawer on the left; the top bar keeps the logo, a breadcrumb ("Dashboard › QA"), alerts, live and the profile.
- **Closed:** an icon rail (64 px).
- **Open:** hovering or keyboard focus slides it open over the page (264 px), with each page's name and a short hint, and leaving closes it.
- **Pinned:** the ☰ button pins it open, pushing the page aside, until clicked again (remembered in the browser).
- **Small screens:** it opens from a menu button in the top bar.
- **Modules (2026-10-12):** the groups are menu modules, each with an icon and a bold name. Only the module of the page you are on is open (highlighted, with an accent bar); the others are folded. Clicking a module's header opens it (one at a time). Folded modules keep their pages in the page, out of sight, so links and the tour still find them (the tour points at the module).
- **Order:** modules can be dragged (⠿ on hover) into another order, and pages within their own module only; a page can never move to another module. The order is saved per person (prefs layout `menu.modules`, `menu.<module>`); Reset layout restores the default.
- **Groups:**
  - *Dashboard*: KPI, Development, QA, Support;
  - *Insights*: Insights (everyone, own scope for members);
  - *Employees*: Company tree, People directory, Access permissions.
- **Rights:** each page is shown only to those with its right, and a page someone may not open falls back to Development.
- **What's new:** a teal dot on a page's icon marks it.

*Page tools:* a glass dock at the right edge, with icon buttons named by tooltips:
- **Customise** (its panel opens to the left);
- **Guided tour** of the page;
- **Voice** on / off;
- **Reset layout** (with Undo).

*Tooltips and icons:* text buttons became icons with tooltips (`components/ui/Tip.tsx`, `icons.tsx`):
- the dock;
- each data point's toolbar;
- the focus view's Excel, PDF and close;
- alerts and live.

*Theme colours* take an opacity (`bg-accent/15`) through `color-mix` (tailwind.config.ts).

**Data-point toolbar (2026-10-11).** Hovering any tile, card or task-list section shows a small toolbar on its top edge:
- ⠿ move it;
- **?** a guided tour of just that data point (in the person's own wording);
- the eye: hide it. Tiles and cards only; task-list sections cannot be hidden.

**Customise (2026-10-11).** A floating **Customise** button at the bottom left (the toasts are bottom right) opens a panel listing the tab's tiles and cards with tick boxes.
- **Hide or bring back:** untick to hide, tick to bring back, **Show all** to restore everything. The button shows how many are hidden.
- **Nothing leaves a gap:** on wide screens the tiles spread over the row (as many columns as tiles shown); cards fill their rows as described above.
- **Saved per person:** `user_prefs.layout["<tab>.<group>.hidden"]`. If a save fails, a toast says so.

**Spotlight (2026-10-12).** Clicking a number, tile, bar or cell no longer scrolls the page to the list at the bottom. The page dims, the clicked count, cell or chart mark stays lit with a glowing ring, and the list it opens comes to the centre, 70% of the screen wide (94% on a phone): under the data point when more than half the screen is left there, else just under the top bar. **A tile (2026-10-13) just opens its list:** it is not lit or ringed and the page does not scroll to it. It is placed once (and on resize), so it never jitters. The list works as usual there (search, sort, pages, edit, Excel, row click opens the task). Escape, a click on the dimmed page or ✕ puts it back. Applies to Development, QA, KPI (and its Active projects tile), Insights and the alerts bell (`components/spotlight/spotlight.ts`).

**Tables you shape (2026-10-12).** Every table with a `tableId` (task lists, Assignee-wise tasks, People, Project health, issue tables, testing and retest tables, ageing tables, People directory) has:
- **Columns:** a menu to tick the columns to show (at least one stays) and drag them into order; *Reset columns*.
- **Column headers** can be dragged into another order.
- **Rows** can be dragged by ⠿ into the reader's own order, shown as **Your order** (on/off); clicking a sort header switches back to that sort. The header and totals rows never move. On paged lists the order applies within the page shown; rows never placed keep their order after the placed ones.
- Saved per person (`table.<id>.cols|hidden|rows|mode` in the layout, rows up to 2,000 keys); Reset layout clears it. Dragging uses dnd-kit (pointer and keyboard), like tiles and the menu.
- **Excel follows the layout:** a card's Excel and the page export take the table as shown. A task list's Excel puts the shown columns first in their order, then the details the list does not show (IDs, links), leaves out hidden columns, and lists rows in the reader's order when *Your order* is on (`/api/tasks/export?cols=&hidden=&order=`).

**Search and dropdowns (2026-10-12).** One search box everywhere (`components/ui/SearchInput.tsx`): a search icon, a clear × once there is text, Escape clears, the same size and focus ring; and one dropdown (`components/ui/Select.tsx`): the native select in one look with a chevron. The filter bar's search dropdowns use the same box with ×. **Task-list column filters (2026-10-12, replaces search-any-column).** The search box of a task list finds ID and title only ("Search by ID or title…"). Under it, each column has its own filter: Project, Assignee, Creator, Stage, Status, Priority, Tags and Type, each a dropdown of the values in the list with counts (type to narrow it, pick several). Filters combine (all must match; any of a filter's values); each list's options are counted with the other column filters applied, so it offers only what can still be picked. A column with a single value and nothing picked shows no filter. "Clear column filters" removes them; a new drill-down or filter bar change starts without them. The Excel export keeps them (`/api/tasks` `fProject`, `fAssignee`, `fCreator`, `fStage`, `fStatus`, `fPriority`, `fTag`, `fType`, comma lists; `facets=true` returns the options; `context.ts` COLUMN_FILTERS, applyColumnFilters, columnOptions).

**Menu order (2026-10-12):** Dashboard, Insights, Employees, Integration, Finance, **Help last**; a person's own dragged order is kept.

**Scrollbars (2026-10-12).** Slim, rounded scrollbars in the brand blue (teal on hover) on a clear track everywhere; lighter in the dark menu.

**Confirmations (2026-10-12).** Confirmations use the dashboard's own popup (`components/ui/ConfirmDialog.tsx`), never the browser's: completing a task, applying a bulk change, deleting a report. The popup names what will change (task, from → to) and its tone (good, warn, bad) colours the button.

**Look of charts and tables (2026-10-12; restyled to the Nural brand 2026-10-29, see the start of this section: flat bars and lines, the brand table pattern).** Every chart (Chart.tsx): gradient bars with rounded ends, smooth lines with a faded area, dashed light grid lines, frosted tooltips, an easing entry. Every table (DataTable and the hand-built ones, class `nural-table` in a `nural-table-wrap` box): a navy header with white uppercase labels (2026-10-14, the Projects at work look, on `--chrome` so it reads in light and dark; sort arrows and "i" white or teal), soft zebra rows, an accent edge on hover and a highlighted totals row. **Rule (2026-10-14):** no page styles its own table header or dropdown; tables use DataTable or `nural-table`, dropdowns use `Select`, or `SearchCombobox` / `DateRangePicker`, whose closed box is the same `DROPDOWN_BOX`, `DROPDOWN_SIZE` and `DropdownChevron` (`components/ui/Select.tsx`): same border, hover, focus ring and chevron.

**Excel look (2026-10-12).** Every Excel file (task lists, people, feedback, a card, a page) has a dark blue title band, a teal line with what it holds and the filters, the export time, a blue header row with white bold text, zebra rows, thin borders, the header frozen and filters on (browser: `components/layout/excelTheme.ts`; server: `apps/api/src/exports/theme.ts`).

**Export page (2026-10-12).** The page tools have *Export page*: every data point the person sees on the page, in their order, without hidden ones and closed lists. *Excel*: a Summary sheet (each tile, its value and detail) and one sheet per card or open list. *PDF*: a title band with the page, filters and time, then the tile rows and each card and list, over A4 landscape pages with page numbers.

**Focus view (2026-10-11).**
- **Opening:** clicking a card's title or empty area brings the card to the centre of the screen, 70% of its width (94% on a phone; 2026-10-13, was up to 1100 px), starting under the top bar and scrolling inside when taller than the screen, with the page behind dimmed and blurred. Charts grow with it. Focus view and spotlight share one size (`focusBox()` in `components/layout/useFocusBox.tsx`).
- **Clicks that don't open it:** counts, bars, tables, buttons and fields keep their usual action (drill-downs, editing).
- **Closing:** a click outside, Escape or the ✕ returns the card to its place.
- **Nothing is reloaded:** sorting, paging and chart choices stay as they were.
- **Motion:** the move is animated, except when the computer asks for reduced motion.
- **Export that card only:** the centred card has **Excel** and **PDF** buttons. Both carry the card's title, the filters in force ("Showing: …") and the time in IST.
  - **Excel:** the card's table (header row without the "i" icons, numbers as numbers). For a chart, its data: one row per category in the order shown, one column per series. Otherwise its text.
  - **PDF:** a picture of the whole card, every row of its lists included, on A4. Long cards continue over pages.
  - Code: `components/layout/exportPoint.ts`, loaded on first use (write-excel-file, html-to-image, jsPDF).

**Themes (2026-10-11).** The profile panel offers **Light** (the default, the palette above), **Dark** and **System** (follows the computer's light or dark setting, and changes with it). The choice is kept per browser (localStorage). Dark redefines the neutral and blue tokens: background `#0D111E`, cards `#151A2C`, text `#E4E6EF`, muted text `#8B91A8`, borders `#2A3150`, headings `#D4DBF5`, links and buttons `#7B8FE0`. The top bar and tooltips stay navy (`--chrome`) in every theme, and the status colours (red, teal, amber) do not change, so badges keep their meaning. Charts, toasts and form controls follow the theme; charts redraw when it changes.

## 7. Architecture and tech stack

The browser never talks to Bitrix24. A Node.js backend holds both webhooks, keeps a copy of the tasks in PostgreSQL, computes the metrics, and pushes changes to open dashboards over Server-Sent Events.

![Architecture](images/architecture.png)

Bitrix24 pushes task events to the receiver; the sync worker fetches the full task through the inbound webhook, stores it, and publishes the change that reaches the browser over SSE.

**Tech stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 18, TypeScript, Vite | Fast build, typed models shared with the backend |
| Styling and components | Tailwind CSS with Nural design tokens, shadcn/ui (Radix) restyled to the Figma components | Accessible primitives; tokens map 1:1 to Figma variables |
| Contextual search dropdowns | cmdk + Radix Popover (Combobox) | Type-to-filter, multi-select, keyboard support |
| Tables | TanStack Table | Sorting, pagination, sticky headers, row click |
| Charts | Apache ECharts (echarts-for-react) | Stacked bars, heatmap, donut, good performance |
| Server state | TanStack Query | Cache per filter, invalidated by live events |
| Filter state | URL search params (nuqs) + Zustand | Shareable links |
| Backend | Node.js 20, Fastify, TypeScript | Light, fast, one language across the stack |
| Database | PostgreSQL 16 | Task snapshots, stage-move log, metric queries |
| Queue and cache | Redis 7 + BullMQ | Webhook event queue, rate-limited Bitrix24 calls, SSE fan-out |
| Live push | Server-Sent Events | One-way server to browser, auto-reconnect, works through the reverse proxy |
| Auth | Sign in with Bitrix24 (OAuth local app) | Users log in with their portal account. For now every signed-in user sees everything; NFR-4 roles come later |
| Hosting | **Live (2026-10-13):** https://pulse.nuralsales.com, behind Cloudflare, on the DigitalOcean droplet `nural-edge-staging-droplet` (Bengaluru), user `bitrixdeploy`: a git clone at `~/mohit/nural`, the API run by PM2 (`pulse-api`, port 4000), nginx serving `apps/web/dist` and proxying `/api`, `/hooks`, `/health`; also answers on `168-144-152-130.sslip.io`. **Docker alternative** for a new server (e.g. Nural's own): Docker Compose with Caddy and Let's Encrypt (`docker-compose.prod.yml`, `scripts/deploy.sh`). The first server, a Hetzner Cloud CX22 (`46-224-99-136.sslip.io`, 2026-10-10 to 2026-10-13), was deleted after the move; its final database is kept as an offline backup | Bitrix24 outbound webhooks need a public HTTPS URL |
| Monitoring | Pino logs; UptimeRobot (free) checks /health every 5 minutes and emails on HTTP 503 | Alerts when sync stops (NFR-9) |

SSE is chosen over WebSocket because the browser only receives; filters are sent as normal HTTP requests. Socket.IO can replace it later if two-way features are added.

**Backend modules**

1. **Webhook receiver** `POST /hooks/bitrix`: checks the application token, puts the event on the queue, returns 200 at once.
2. **Sync worker**: takes events, fetches the full task through the inbound webhook (batched), compares with the stored snapshot, writes the stage-move log, and publishes a change message.
3. **Reconciler**: every 10 minutes, pulls tasks changed since the last run, to recover any missed webhook. Nightly full resync of open tasks.
4. **Directory sync**: hourly, users, departments and workgroups, and the stage list of each workgroup.
5. **Metrics API**: `GET /api/dev/summary`, `/api/dev/assignees`, `/api/dev/ranking`, `/api/dev/matrix`, `/api/tasks`, `/api/qa/summary`, `/api/qa/issues`, `/api/qa/testing`, `/api/filters/options`, all taking the same filter parameters. `/api/dev/assignees`, `/api/dev/matrix` and `/api/qa/issues` also take `groupBy=assignee|project` for the Assignee / Project switch. The Development endpoints, `/api/filters/options?tab=dev` and `/api/tasks?kind=tasks` take `scope=all|dev|issues` (API default `dev`). `/api/tasks` also takes `stage` (one or a comma list), `overdue=true|false` and `ageing=<bucket>` for drill-downs. `/api/dev/summary` returns `parts`, the tile breakdown for the switch. `/api/qa/summary` returns `parts`, each QA tile split into bug and feedback. `GET /api/alerts` returns the header alerts (with each line's filtered `boardUrl`, and for stuck lines `boardCount`, what that Bitrix24 board will list); `/api/tasks` takes `stuck=true` and `owner=<user id>` (the alert's person) to open an alert's tasks. `/api/qa/issues` also returns `trend` (the last 7 days, filed and resolved per type, overall and per assignee or project); `/api/tasks` takes `day=YYYY-MM-DD` to pick the day of `preset=lastFiled` or `preset=lastResolved`.
6. **SSE endpoint** `GET /api/stream`: sends `task.changed` with the task ID, stage group and project, so the browser refetches only the queries that include it.

**Data model (PostgreSQL)**

| Table | Key columns |
| --- | --- |
| tasks | id, title, group\_id, stage\_id, stage\_title, status, priority, responsible\_id, created\_by, created\_at, deadline, closed\_at, parent\_id, tags\[\], is\_issue, issue\_type, changed\_at, raw jsonb |
| task\_stage\_events | task\_id, from\_stage, to\_stage, moved\_at, moved\_by |
| task\_relations | task\_id, related\_id, kind (parent or related) |
| users | id, name, department\_ids\[\], active |
| departments | id, name, parent\_id, head\_id |
| workgroups | id, name, is\_dev\_project |
| stages | id, group\_id, title, sort, color |
| sync\_state | key, last\_run, cursor |

**Sign-in (milestone 9)**

- `AUTH=bitrix` turns sign-in on; `AUTH=off` (the default, for local development) lets every call through.
- `GET /api/auth/login` sends the browser to the portal's `/oauth/authorize/` page with the local app's client ID and a random `state`, kept in a short-lived signed cookie.
- Bitrix24 returns to the local app's handler path (the site root) with `?code=&state=`, even when `redirect_uri` is given. Caddy redirects that to `GET /api/auth/callback`. The API checks the `state` and exchanges the code at `https://oauth.bitrix.info/oauth/token/`. It accepts the result only when its `client_endpoint` is our portal and the `user_id` is an active user in our `users` table. The access token is not used or kept: sign-in makes no REST call and writes nothing to Bitrix24.
- The session is a signed cookie (HMAC-SHA256 with `SESSION_SECRET`): HttpOnly, SameSite=Lax, Secure on HTTPS, holding the user ID and name. There is no session table, and changing `SESSION_SECRET` signs everyone out.
- **Sessions last 3 days (2026-10-11).** Everyone is signed out 3 days after signing in, even if active.
  - The cookie is kept one day longer, so a request after expiry answers 401 with `expired: true`. The app then shows "Your session ended" (`/api/auth/signed-out?expired=1`) with Sign in with Bitrix24, instead of signing straight back in.
  - `/api/auth/me` returns `exp`. An open page signs itself out at that moment, even when idle.
- **Per-person settings (`user_prefs`, migration 0005).** Stores the sign-in count (raised on every sign-in, for the guided tour), the order of tiles, cards and sections, and guided-tour state.
  - `GET /api/prefs` and `PUT /api/prefs` read and write only the signed-in person's own row.
  - Input is checked: known shapes, ID characters and size limits.
- With sign-in on, every `/api` call other than `/api/auth/*` needs the session, or it gets 401 and the web app goes to sign-in. `/health` and `/hooks/bitrix` (checked by its application token) stay open.
- `GET /api/auth/me` returns the signed-in name, shown in the top bar with a **Sign out** button (`POST /api/auth/logout`). Sign out ends on a "You are signed out" page (`GET /api/auth/signed-out`) with **Sign in with Bitrix24**; it does not go straight back to Bitrix24, which would sign a person who is still logged in to Bitrix24 straight back in (tried and reverted on 2026-10-13: Bitrix24 ignores outside logout links such as `/auth/?logout=yes`, so the dashboard cannot show the Bitrix24 login form; a person who wants it logs out of Bitrix24 itself). On a local copy (sign-in off) the top bar says so.

**Access and scoping (NFR-4, 2026-10-11)**

- **Roles** (`config/roles.json`, Bitrix24 user IDs): `admins` (Company Admin, directors), `pms`, `teamLeads`, `productOwners` (extra; every Bitrix24 workgroup owner is a product owner automatically). They have **full access**: all data and the KPI tab. Everyone else is a **member**.
- **A member's scope** is the tasks assigned to them; a QA tester (QA Testing department) also keeps the issues (bug/feedback) they filed. Tasks a member created for other people are not in their scope, so no other person's name or numbers reach their screen (2026-10-21; before, every task they created counted). Everything they get is computed from those tasks only: tiles, tables, charts, alerts, filter dropdown options, task lists, the Excel export, the task view (another person's task is "not found"), task actions (another person's task cannot be changed) and the QA retest counts.
- **Enforced on the server.** Routes get data only through one per-request provider (`requestDataset` in `auth/roles.ts`, `req` required); a member gets a scoped copy of the dataset, memoised per person and per data load and never shared between people. The KPI endpoints and KPI task lists answer 403 to members; the web app hides the KPI tab and opens members on Development.
- **Live updates.** Each change message names the people it concerns (assignee, creator, previous assignee); a member's stream carries only changes to their tasks (`assignees`), and a tester's also to issues they filed (`mayReceive`, fail closed). Full access receives all.
- **Roles today (2026-10-11):** admins Company Admin (1), Bhanu SSavant (18), Deepak SShetty (40), Mohit Srivastava (14), Balram Jha (10); team leads Adnan Mubeen (12), Faiz Arsalan (44), Kuku Jat (50), Mishaal (54); `pms` empty (Balram is an admin).
- **Support tab and feedback inbox** (section 14): the Support tab is shown to the Tech Support department (`config/departments.json` "support"), PM, team leads and admins; the feedback inbox to admins and the head of the top Tech Support department in Bitrix24 (today Kuku Jat). `/api/auth/me` also returns `support`, `admin` and `inbox`.
- `/api/auth/me` returns `role` and `full`; the top bar shows the role (e.g. "Team lead", "My tasks"). With sign-in off (local copy) everyone has full access.
- Tested by equivalence: for every member, every endpoint must answer exactly what a server holding only that member's tasks answers (and full access exactly what one holding everything answers); deliberately breaking the scoping, the stream filter or the KPI guard makes those tests fail. Checked on real data against SQL (2026-10-11): Neha Gautam 252 tasks and 186 issues, Deepankar Shisodia 62 and 36, Adnan Mubeen everything.

**Rights and access permissions (2026-10-11)** (`auth/rights.ts`, `routes/access.ts`). Each person has seven rights:
- **scope:** all data / own tasks;
- **kpi**, **support**, **inbox**, **employees**, **admin:** on or off;
- **edit:** all fields / stage, status and tags.

**Defaults come from the role.** The defaults reproduce the rules above, so nothing changes until an admin overrides something.

| Role | scope | kpi | support | inbox | employees | edit | admin |
|---|---|---|---|---|---|---|---|
| Admin | all | ✓ | ✓ | ✓ | ✓ | all | ✓ |
| PM, Team lead | all | ✓ | ✓ | Support lead | ✓ | all | – |
| Product owner | all | ✓ | – | – | – | all | – |
| Member | own | – | Tech Support | Support lead | – | limited | – |

**Overrides.** Admins override any right per department (`access_grants`, subject `dept`) or per person (subject `user`).
- **Order:** role defaults, then departments from the outermost to the person's own (sub-departments are covered by their parents; the deeper one wins), then the person.
- **Locked:** admins in `config/roles.json` always keep every right and cannot be changed (409), so nobody can lock everyone out.
- **Audit:** every change is logged in `access_audit` (who, whose, before, after).
- **Instant:** overrides are cached in memory and reloaded on each change, so a change applies to the next request.

**Enforcement on the server:**
- scoped data and stream: `scope`;
- KPI endpoints and KPI lists: `kpi`;
- task edits and bulk edits (every field vs stage, status, tags) and `/api/tasks/edit-options`: `edit`;
- feedback: `support` / `inbox`;
- `/api/employees*`: `employees`;
- `/api/access*`: `admin`.

`/api/auth/me` returns them all.

**APIs:**
- `GET /api/access`: people and departments, each right's default, override, result and source (role, department, person, locked);
- `PUT /api/access/user/:id` and `PUT /api/access/dept/:id` with `{ rights }`; `null` clears;
- `GET /api/access/audit`.

**Activity** (`user_prefs.last_sign_in_at`, `last_seen_at`):
- last sign-in is set on sign-in;
- last active is set by signed-in `/api` requests, at most once a minute per person.

Tested in `routes/access.test.ts` (defaults, person and department overrides, order, instant effect on data, KPI and edits, admin-only, locked admins, audit) alongside the scoping suite.

**Task actions: editing in place (2026-10-11)**

Every task grid and the task view edit a task where it is shown. Each cell is a label; **clicking an editable cell turns it into an editor**, and it becomes a label again after a change or a click anywhere else (Escape also leaves). One column per item: no separate "Move to" or action columns.

| Item | Editor | Bitrix24 call | Who may change it |
| --- | --- | --- | --- |
| Stage | Dropdown of the task's own board columns, in order (the cell also shows the dashboard status Completed / Pending / On hold under the column) | `task.stages.movetask` | Everyone (in their scope) |
| Status | Dropdown: Pending, In progress, Deferred, Completed (Bitrix24's own status) | Bitrix24's own actions: Completed → `tasks.task.complete`, Deferred → `tasks.task.defer`, In progress → `tasks.task.start`, Pending → `tasks.task.pause` or `tasks.task.renew` (renewing first where Bitrix24 needs it); Completed asks for confirmation | Everyone (in their scope) |
| Tags | Text box, several tags comma-separated; saving replaces the task's tags with exactly that list (duplicates removed, first spelling kept). New tags are created by Bitrix24 in the task's project | `tasks.task.update` `TAGS` | Everyone (in their scope) |
| Project | Dropdown of projects | `tasks.task.update` `GROUP_ID` | Full access only |
| Assignee | Dropdown of active people | `tasks.task.update` `RESPONSIBLE_ID` | Full access only |
| Priority | Dropdown: Low, Normal, High | `tasks.task.update` `PRIORITY` | Full access only |
| Deadline | Date picker, future dates only (today while 18:30 IST is ahead); the time is 18:30 IST | `tasks.task.update` `DEADLINE` (the server refuses a past date) | Full access only |

- **As the person.** Changes run with the signed-in person's own Bitrix24 OAuth token, so Bitrix24 history shows their name and their Bitrix24 permissions apply; a refusal is shown as Bitrix24's message (a missing app permission as "missing the Tasks permission").
- **Who may change what is enforced on the server**: full access (admin, directors, PM, team leads, product owners) may change every item; members only stage, status and tags, and only on tasks in their scope (another person's task is "not found"). Cells a person may not change stay plain labels; with sign-in off (local copy) nothing is editable.
- The tokens are kept from sign-in, encrypted (AES-256-GCM, key from `SESSION_SECRET`) in `user_tokens`, and renewed with the refresh token; never logged or sent to the browser. The local app needs the **Tasks** permission (scope `task`) besides `user`.
- **Guard rails.** The webhook stays read-only (`READ_METHODS`). Task actions are a separate allowlist (`USER_ACTION_METHODS`: `task.stages.movetask`, `tasks.task.complete`, `defer`, `start`, `pause`, `renew`, `update`) and run only with a person's token through the same rate limiter; `tasks.task.update` may carry only `GROUP_ID`, `RESPONSIBLE_ID`, `TAGS`, `PRIORITY` and `DEADLINE` (`EDITABLE_FIELDS`). A column must belong to the task's board. **Several fields at once (2026-10-21):** the task view's **Edit fields** turns its fields into one form (stage, status, tags; full access also project, assignee, priority, deadline) and **Save changes** sends them together (`POST /api/tasks/:id/edit`): every change is checked first and nothing changes if one is refused; then they run in order (fields, column, status), each recorded in `task_actions`, stopping at the first Bitrix24 refusal and saying what was already saved. A new project and a column cannot be saved together (the new project has its own board). **Bulk edit takes several changes too (2026-10-21):** **+ Add another change** keeps the change in the pickers and picks the next field; Check and Apply send them all (`edits`, each field once; the old single `edit` still works); each task is checked with every change (refused if one is) and its changes run in the same order, stopping at its first refusal. **One creation (2026-10-14, section 23; widened 2026-10-17 with the user's approval):** `tasks.task.add`, only from the Daily update (Add task, morning or evening): with the person's own token, assigned to themselves, carrying only `TITLE`, `RESPONSIBLE_ID`, `GROUP_ID`, `DESCRIPTION`, `TAGS`, `PRIORITY` and `DEADLINE` (`CREATE_FIELDS`, checked again in the Bitrix24 client), recorded in `task_actions` as `create`. Never a delete.
- **Audit.** Every change is recorded in `task_actions`: person, task, `move`, `status` or `field:<name>`, from, to, and whether Bitrix24 accepted it (with its error). After a change the task is re-synced, so every open dashboard shows it within seconds.
- API: `POST /api/tasks/:id/stage {stageId}`, `POST /api/tasks/:id/status {status}`, `POST /api/tasks/:id/field {field: project|assignee|tags|priority|deadline, value}`, `GET /api/tasks/edit-options` (projects and people; full access only).

**Bulk edit (2026-10-11)**

- Every task list has a **tick box on each row**; the box in the header **selects or clears every row on the page** (it shows a dash when only some are ticked). Ticks are kept across pages of the same list, up to **100 tasks**, and are cleared when the list changes (filters, tile, search).
- While tasks are ticked a bar shows: *N selected · item · value · Check · Apply · Clear selection*. Items: Stage, Status and Tags for everyone; Project, Assignee, Priority and Deadline for full access. Tags: **Add tags** (keep each task's own and add these) or **Replace tags with**. Stage: if every ticked task is on one board, that board's columns; otherwise the dashboard stages, mapped to each board's own column.
- **Check** validates every ticked task on the server, changing nothing, with the same rules as a single edit. A task that cannot take the change is **highlighted in red** (row outline, red dot, the reason on hover) and listed under the bar, e.g. "Its board (Motorola India Support) has no QA Backlog column", "Not on a Kanban board (no project)", "Vijay is no longer active", "The deadline must be in the future", "Only managers can change …", "Not found, or outside your scope". A task already so is greyed and skipped.
- **The selection follows the list.** After Apply, changed and already-so tasks are unticked; only tasks that could not be changed stay ticked (red) to fix and retry. Whenever the list refreshes (a change, a live update), a ticked task that has left the list (e.g. reassigned away from the filtered person) is unticked, so the count matches what is shown.
- **Apply** (after Check, with a confirmation) sends only the valid tasks to Bitrix24, one after another through the rate limiter; a task Bitrix24 refuses is highlighted red with Bitrix24's reason, the others go green. Each change is recorded in `task_actions`; the dashboard refreshes when the changes sync back.
- API: `POST /api/tasks/bulk/check` and `POST /api/tasks/bulk/apply` with `{ ids (≤ 100), edit: { kind: stage (stageId or stage) | status | field (field, value, tagsMode) } }`, answering one `{ id, state: ok|skip|error|done|failed, reason }` per task.

**Deployment with Docker (milestone 9; for a new server, the live server uses PM2 below)**

- `docker-compose.prod.yml` (project `nural-prod`) runs `postgres`, `redis`, `api` and `web` with no database or Redis port exposed.
- `api` is `apps/api/Dockerfile`: it applies migrations at start, then serves through tsx.
- `web` is `apps/web/Dockerfile`, which builds Vite into a Caddy image. Caddy (`deploy/Caddyfile`) serves the app, proxies `/api`, `/hooks` and `/health` to the API (SSE unbuffered), sets security headers, and gets the certificate for `SITE_ADDRESS`.
- Extra Caddy config can be dropped on the server in `~/nural/caddy-extra/*.caddy`, for example an interim shared password.
- `scripts/vm-setup.sh` prepares a fresh Ubuntu server: Docker, ports 80 and 443 (Oracle iptables or ufw, where present), and swap.
- `scripts/deploy.sh` ships the committed code (`git archive`) and `.env.prod` (as the server's `.env`) over SSH, then rebuilds and restarts.
- `scripts/db-copy.sh` copies the local database to the server once.

**Live server and CI/CD (2026-10-13)**

- **Update in place** (`scripts/server-update.sh`, run on the droplet from the clone): `pnpm install --frozen-lockfile`, build the web app, `pnpm db:migrate`, `pm2 restart pulse-api`. By hand: `cd ~/mohit/nural && git pull --ff-only && bash scripts/server-update.sh`. The API restarts in about 10 seconds; the root `.env` stays on the server.
- **CI/CD** (`.github/workflows/ci.yml`, GitHub Actions): every push and pull request runs `pnpm typecheck`, `pnpm lint` and `pnpm test` (with placeholder BITRIX_INBOUND_URL, DATABASE_URL, REDIS_URL; the tests never connect). A push to `main` that passes is deployed: SSH to the droplet, fast-forward `main`, run `server-update.sh`, then wait until `/version.json` carries a build newer than the deploy (`/health` is not used, since it can say "degraded" for Bitrix24 reasons). A failed check deploys nothing. A push that changes only documents (`docs/**`, `*.md`) runs nothing.
- **Two repos:** every push goes to github.com/mohitNURAL/nural-dashboard- (official) and github.com/mohitcs1012/nural-dashboard- (personal); only the official one deploys (`github.repository_owner == 'mohitNURAL'`).
- **Secrets** (official repo, Actions): `DEPLOY_HOST` (`bitrixdeploy@168.144.152.130`) and `DEPLOY_SSH_KEY` (a dedicated ed25519 key, `github-actions-nural-pulse`, in the server user's `authorized_keys`). Optional variables `SITE_URL` (default `https://pulse.nuralsales.com`) and `DEPLOY_DIR` (default `~/mohit/nural`).
- **History:** each deploy is a GitHub *production* deployment; the repo page lists them.

## 8. Bitrix24 integration

Two webhooks are created in the portal by an administrator: an **inbound** webhook the backend calls to read data, and an **outbound** webhook Bitrix24 calls when a task changes. Both secrets live only in the backend's environment file.

**8.1 Inbound webhook (read)**

- Created in Bitrix24: Developer resources > Other > Inbound webhook. Permissions: `task`, `user`, `department`, `sonet_group` (workgroups). Read-only for sync; the stage guard and planned dates in section 12 add a few writes.
- Gives a URL of the form `https://nural.bitrix24.in/rest/<user_id>/<secret>/`, stored as `BITRIX_INBOUND_URL`. The webhook acts as the user who created it, so that user must see every development workgroup (an admin account is best).

| Method | Used for |
| --- | --- |
| `tasks.task.list` | Initial load and the 10-minute reconcile, filtered by `GROUP_ID` and `>CHANGED_DATE`, 50 per page |
| `tasks.task.get` | Full task after a webhook event (select includes `STAGE_ID`, `TAGS`, `PARENT_ID`, `DEADLINE`, `CLOSED_DATE`, `CREATED_BY`, `RESPONSIBLE_ID`, `PRIORITY`, `UF_*`) |
| `task.dependence` / related tasks via `tasks.task.get` | Links between issues and tasks |
| `task.stages.get` | Kanban stages per workgroup |
| `tasks.task.history.list` | Backfilling stage moves and reopens for tasks that existed before go-live |
| `user.get`, `department.get` | Company structure, testing team |
| `sonet_group.get` | Project list |
| `batch` | Up to 50 of the calls above in one request |

**Rate limits.** Bitrix24 cloud allows about 2 requests per second per portal with a short burst, and blocks methods that use too much execution time. The backend sends every call through one BullMQ limiter (2 per second), groups calls with `batch` (50 commands per request), and retries `QUERY_LIMIT_EXCEEDED` with backoff. An initial load of 5,000 tasks takes roughly 100 list pages, about a minute.

**8.2 Outbound webhook (real-time)**

- Created in Bitrix24: Developer resources > Other > Outbound webhook. Handler URL: `https://<dashboard-host>/hooks/bitrix`. Events: `ONTASKADD`, `ONTASKUPDATE`, `ONTASKDELETE`, `ONTASKCOMMENTADD`.
- Bitrix24 shows an application token for the webhook; it is stored as `BITRIX_OUTBOUND_TOKEN`. Each call carries `auth[application_token]`; the receiver rejects any call whose token does not match.
- The event body only carries the task ID (`data[FIELDS_AFTER][ID]`), not the task. The sync worker therefore fetches the task with `tasks.task.get`.

**8.3 Event flow**

1. Someone moves a task on the Kanban, presses Complete, edits tags, or creates a bug.
2. Bitrix24 POSTs the event to `/hooks/bitrix`; the receiver checks the token, queues `{event, taskId}`, and returns 200.
3. The worker waits 2 seconds to merge repeated events for the same task, then fetches it (batched with others in the queue).
4. It compares with the stored copy. A changed stage writes a `task_stage_events` row; a move from a QA stage back to To do or In progress flags a reopen (rework). A deleted task is marked deleted.
5. It publishes `task.changed` on Redis; the SSE endpoint sends it to every open dashboard.
6. The browser invalidates the affected queries, refetches, and the tile animates to its new value. Target: under 5 seconds from the click in Bitrix24.

**Speed of edits (2026-10-30).** Measured over 13 to 29 Oct: a single edit made in Pulse reached Bitrix24 in 0.6 s (median; 90% within 2 s), its re-read finished 3.5 s later (median; 95% within 6 s), and any request, even the sign-in check, took 1.5 s or more one time in ten, because the one-CPU server reloaded all 9k tasks from Postgres after every change and at least every 30 s. Since then: (1) the in-memory dataset is patched, not reloaded: a changed task's rows (task, stage history, related links) are read again and the dataset rebuilt in memory (`cachedDataset`, `patchRows`, `buildDataset` in data/dataset.ts); a burst over 300 tasks, a failed patch, a workflow or people change, or 10 minutes since the last full load reloads everything; the full load no longer reads the stored Bitrix24 copy of each task (`raw`), only its project; each load and patch is logged with its time (`dataset loaded`, `dataset patched`); (2) a person's own edit is read back after 0.3 s instead of the 2 s debounce (`SOON_MS`, a waiting job is brought forward); (3) the reconcile, directory and nightly reads run in the limiter's background lane (`limiter.background`, BullMQ priority 10), so edits and live re-reads never queue behind them; the 2 calls/s limit is unchanged; (4) after a save the page refreshes on the live event, with a 2 s fallback (was 3.5 s). Bulk edits still take about half a second per change (one Bitrix24 call each, at 2 calls/s).

**Saving shows at once (2026-10-30).** A field changed in a grid, the task view or the Daily update (column, status, project, assignee, priority, tags, deadline) shows its new value, faded, with a spinner from the click until the data has the change (`features/tasks/pending.ts`, `PendingValue`, `components/ui/Spinner.tsx`); it is not editable meanwhile. It ends as soon as the task's data shows a different value than before the change (whatever Bitrix24 made of it, e.g. Awaiting approval), or after 30 s; a refusal puts the old value back at once with the reason. The task view's Save changes shows the spinner while it saves, then the view shows each saved field the same way.

**8.4 Reliability**

- Outbound webhooks are best-effort: Bitrix24 does not retry a failed delivery. The 10-minute reconcile and the nightly resync close that gap.
- If the dashboard host is down, events are lost but the reconcile catches up on restart.
- Stage moves before go-live are rebuilt once from `tasks.task.history.list`. Checked 2026-10-10: history does record stage moves (field `STAGE`, with user and time), so rework and ranking are rebuilt for old tasks too.

## 9. Non-functional requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-1 | Freshness | A change in Bitrix24 shows on open dashboards within 5 seconds; worst case 10 minutes (reconcile) |
| NFR-2 | Speed | First load under 2 seconds; filter change under 500 ms for up to 20,000 tasks |
| NFR-3 | Security | Webhook secrets only in backend env; HTTPS only; outbound calls checked by application token; no Bitrix24 URL or token in browser code |
| NFR-4 | Access | **Full access** (everything, KPI tab): admins and directors, PM, team leads and product owners (`config/roles.json`, plus every Bitrix24 workgroup owner). **Everyone else** sees only tasks assigned to them (a QA tester also the issues they filed; 2026-10-21), on every number, list, dropdown, export, task view, task action and live update; the KPI tab is hidden and refused. The Support tab and feedback inbox have their own audiences (section 14). Enforced on the server (section 7, Access and scoping); 2026-10-11 |
| NFR-5 | Rate limits | Never more than 2 Bitrix24 calls per second; batch where possible |
| NFR-6 | Time zone | All "today" and "overdue" logic in Asia/Kolkata |
| NFR-7 | Responsive | Desktop first (1440 px); usable at 1280 px and on tablet; tables scroll inside their card on phone |
| NFR-8 | Accessibility | WCAG 2.1 AA contrast; keyboard use of all dropdowns and accordions; charts have table fallbacks |
| NFR-9 | Availability | Health endpoint; alert if no webhook received for 2 working hours or reconcile fails twice. `/health` returns `status: degraded` with HTTP 503 and `reasons` in either case. Working hours: `WORK_DAYS` (default Mon to Sat) and `WORK_HOURS` (default 10 to 19) in APP_TIMEZONE. The webhook rule applies only when the sync worker runs and an outbound token is set |
| NFR-10 | Audit | Webhook events kept 30 days for debugging |

## 10. Build plan

Mohit builds this in VS Code with Claude Code. Each milestone below is one Claude Code session: paste its prompt, review the plan and the diff, run its check, then commit.

**10.1 Before you start**

- Install Node.js 20 LTS, pnpm 9, Docker Desktop, Git, VS Code and the Claude Code extension.
- Ask the Bitrix24 admin to create the inbound webhook (permissions: task, user, department, sonet\_group) and copy its URL. Create the outbound webhook later, in milestone 5.
- For local testing of outbound webhooks, install a tunnel (cloudflared or ngrok), because Bitrix24 can only call a public HTTPS URL.
- Export this SRS as Markdown into the repo at `docs/SRS.md`, so Claude Code can read it in every session.

**10.2 Project structure**

```
nural-dashboard/
  CLAUDE.md
  docker-compose.yml          # postgres 16, redis 7
  .env.example
  docs/SRS.md
  packages/shared/src/
    types.ts                  # Task, Issue, Stage, Filters
    stages.ts                 # stage names, groups, colours
    metrics.ts                # pure metric functions (section 5)
  apps/api/src/
    config.ts
    bitrix/  client.ts  batch.ts  limiter.ts
    db/      schema.ts  migrations/
    sync/    directory.ts  initialLoad.ts  worker.ts  reconciler.ts  stageMap.ts  rework.ts
    hooks/   receiver.ts
    routes/  dev.ts  qa.ts  tasks.ts  filters.ts  stream.ts
    server.ts
  apps/web/src/
    theme/tokens.css          # Nural tokens from Figma
    components/  StatTile  Card  DataTable  SearchCombobox  Accordion  TaskDrawer  StageChip
    features/    filters/  dev/  qa/
    api/         client.ts  queries.ts
    hooks/       useLiveUpdates.ts
    App.tsx
```

Libraries on top of section 7: pnpm workspaces, Drizzle ORM for Postgres, Zod for config and API validation, Vitest for unit tests, Playwright for end-to-end checks.

**10.3 Environment**

```
# .env (never committed; .env.example has the same keys, empty)
BITRIX_INBOUND_URL=https://nural.bitrix24.in/rest/<user_id>/<secret>/
BITRIX_OUTBOUND_TOKEN=
DEV_GROUP_IDS=148,154
DATABASE_URL=postgres://dash:dash@localhost:5432/dash
REDIS_URL=redis://localhost:6379
APP_TIMEZONE=Asia/Kolkata
PUBLIC_BASE_URL=            # https://<ip>.sslip.io in production (Secure cookies)
PORT=4000
WEB_ORIGIN=http://localhost:5173
AUTH=off                    # bitrix = Sign in with Bitrix24
BITRIX_CLIENT_ID=           # from the Bitrix24 local app
BITRIX_CLIENT_SECRET=
SESSION_SECRET=             # 32+ random characters
WORK_DAYS=1,2,3,4,5,6       # NFR-9 working days (1 = Monday)
WORK_HOURS=10-19            # NFR-9 working hours
SITE_ADDRESS=               # production: <ip>.sslip.io
POSTGRES_PASSWORD=          # production database password
```

**10.4 CLAUDE.md (create in milestone 1)**

```markdown
# Nural Dev & QA Dashboard
Spec: docs/SRS.md. Read the section named in each task before coding.

## Rules
- Bitrix24 webhook URL and token live only in apps/api env. Never import them in apps/web.
- Match Kanban stages by title, never by ID (IDs differ per workgroup). stageId "0" = To do.
- Every Bitrix24 call goes through bitrix/limiter.ts (2 calls/s) and uses batch.ts when making more than one call.
- Metric logic lives in packages/shared/metrics.ts as pure functions with Vitest tests.
- "Today" and "overdue" use APP_TIMEZONE (Asia/Kolkata).
- The dashboard is read-only: no Bitrix24 write methods.

## Commands
pnpm dev | pnpm test | pnpm db:migrate | pnpm sync:initial | pnpm bitrix:ping
```

**10.5 Milestones**

Run each in order. Start each session in plan mode, approve the plan, then let it build.

1. **Scaffold.** Prompt: "Read docs/SRS.md sections 7 and 10. Create the pnpm monorepo in 10.2 with apps/api (Fastify, TypeScript), apps/web (Vite, React 18, TypeScript, Tailwind), packages/shared, docker-compose with Postgres 16 and Redis 7, ESLint, Prettier, Vitest, .env.example from 10.3 and CLAUDE.md from 10.4. Add GET /health." Done when `docker compose up -d` and `pnpm dev` serve the web app on port 5173 and /health on port 4000.
2. **Bitrix24 client.** Prompt: "Build apps/api/src/bitrix: a client over BITRIX\_INBOUND\_URL, a BullMQ-backed limiter at 2 calls per second, a batch helper for up to 50 commands, and retry with backoff on QUERY\_LIMIT\_EXCEEDED. Add a `pnpm bitrix:ping` script that prints the stages of each group in DEV\_GROUP\_IDS." Done when the script prints 11 stages for group 148 and 10 for group 154.
3. **Database and first sync.** Prompt: "Read SRS sections 5 and 7. Create the Drizzle schema for the data model table, then directory sync (users, departments, workgroups, stages) and an initial load of all tasks in DEV\_GROUP\_IDS with tasks.task.list. Map stages by title, mark issues by bug or feedback tag, store parent and related tasks. Backfill stage moves from tasks.task.history.list." Done when task counts per stage in Postgres match the Bitrix24 Kanban for both groups.
4. **Metrics and API.** Prompt: "Read SRS sections 3, 4 and 5. Implement every metric in packages/shared/metrics.ts as pure functions with Vitest tests using fixture tasks, including speed ranking and rework. Expose the endpoints listed in section 7, all accepting the same project, assignee, tag and date filters, plus /api/filters/options for the contextual dropdowns." Done when tests pass and /api/dev/summary matches a manual count in Bitrix24.
5. **Real-time.** Prompt: "Read SRS section 8. Build POST /hooks/bitrix (verify application token, queue, return 200), the sync worker (2-second debounce, batched tasks.task.get, diff against the stored task, write task\_stage\_events, flag reopen as rework, publish task.changed on Redis), the 10-minute reconciler, and GET /api/stream as SSE." Then start the tunnel, have the admin create the outbound webhook (ONTASKADD, ONTASKUPDATE, ONTASKDELETE, ONTASKCOMMENTADD) pointing at the tunnel URL plus /hooks/bitrix, and put its token in .env. Done when moving a task in Bitrix24 logs a stage event and an SSE message within 5 seconds.
6. **Web shell and theme.** Prompt: "Read SRS section 6. Put the Nural tokens in theme/tokens.css and Tailwind config, build the top bar with Development and QA tabs, the sticky filter bar with SearchCombobox (cmdk, multi-select, options from /api/filters/options), filters in the URL, TanStack Query setup, and useLiveUpdates that invalidates queries on SSE task.changed." Done when changing a filter updates the URL and a task move in Bitrix24 shows a toast.
7. **Development tab.** Prompt: "Build the Development tab from SRS section 3 (DEV-01 to DEV-08) and the wireframe in section 6, using ECharts and TanStack Table, with the TaskDrawer." Done when every tile and table matches Bitrix24 for one project and one assignee.
8. **QA tab.** Prompt: "Build the QA tab from SRS section 4 (QA-01 to QA-09) and its wireframe, reusing the components from milestone 7." Done when issue counts, rework and retest-by-creator match Bitrix24.
9. **Sign-in, deploy and launch.** Prompt: "Add Sign in with Bitrix24 (OAuth local app), Dockerfiles for api and web, Caddy with Let's Encrypt, and a health alert per NFR-9." Roles (NFR-4) are deferred; every signed-in user sees everything. Steps:
   1. Create an Ubuntu 24.04 server with a public IPv4 and the deploy SSH key (first done on a Hetzner Cloud CX22, since deleted; the live site now runs on a DigitalOcean droplet, see section 7, Live server and CI/CD). On Oracle Cloud, open TCP 80 and 443 in its security list; `vm-setup.sh` opens them in its iptables.
   2. Run `scripts/vm-setup.sh` on the VM. Fill in `.env.prod` locally (SITE_ADDRESS `<ip>.sslip.io`, PUBLIC_BASE_URL, WEB_ORIGIN, POSTGRES_PASSWORD, SESSION_SECRET, Bitrix24 keys). Run `scripts/deploy.sh`, then `scripts/db-copy.sh` once.
   3. Until the local app exists, use `AUTH=off` behind a Caddy `basic_auth` shared password in `caddy-extra/`.
   4. A Bitrix24 admin creates a server-side local app (Developer resources > Other > Local application). Settings:
      - Handler path `https://<site>/`.
      - Initial installation path `https://<site>/api/auth/callback`.
      - Scope `user`.

      Put its client ID and secret in `.env.prod`, set `AUTH=bitrix`, remove the shared password and redeploy.
   5. Point the outbound webhook's handler URL at `https://<site>/hooks/bitrix` and stop the local tunnel.
   6. Add an UptimeRobot HTTPS monitor on `https://<site>/health`.
   7. Run the acceptance tests below. Run beside the Bitrix24 board for one week, then go live.

**Acceptance tests (examples)**

- [ ] Moving task 41580 from To do to In progress changes Pending by 0 and moves it in the stage matrix within 5 seconds.
- [ ] Pressing Complete on a task moves it from Pending to Completed and adds 1 to Done today.
- [ ] A bug moved from In QA back to To do adds 1 to Rework for its assignee.
- [ ] Typing "Ne" in the Assignee dropdown shows only matching names (Neha Gautam).
- [ ] Disabling the outbound webhook for 15 minutes and moving a task still updates the dashboard after the reconcile.
- [ ] Viewing page source and network calls shows no Bitrix24 webhook URL or token.

## 11. Open questions

Each question has the default this SRS already assumes; a one-word answer is enough to change it.

| # | Question | Default assumed |
| --- | --- | --- |
| 1 | Which workgroups count as development projects? | All project listed |
| 2 | "Done today": entered QA Backlog today, or entered Done today? | Entered QA Backlog today (Complete pressed) |
| 3 | Exact tag names for issues and testing? | `bug`, `feedback`,- for developers as assignee  created by testers.`t``e``s``t``i``n``g`, `r``e``-``t``e``s``t``i``n``g`, and other task as well such as Data creation/ Manual creation video creation etc. for testers as assignee case-in |
| 4 | Old stage moves: rebuild from Bitrix24 history, or count rework and ranking from go-live? | Rebuild from history where Bitrix24 recorded it, otherwise from go-live |
| 5 | Should Development "Total tasks" include bugs and feedback? | Resolved: the All / Dev / Issues switch (DEV-00a) chooses; All is the default |
| 6 | Is a task in On Hold overdue when its deadline passes? | No; On Hold is pending but left out of Overdue |
| 7 | What can developers see? | Everyone sees all numbers (read-only); restrict later if needed |
| 8 | Figma access: the file could not be opened from here | Resolved: section 6 now uses the Figma variables |
| 9 | Sign-in: Bitrix24 account, or company Google or Microsoft login? | Sign in with Bitrix24 |
| 10 | Where will it be hosted? | Resolved (2026-10-13): pulse.nuralsales.com on the DigitalOcean droplet (section 7, Live server and CI/CD) |
| 11 | Ranking: minimum tasks to be ranked, and should late completions lower the rank more than early ones raise it? | At least 3 completed tasks; plain average days early or late |
| 12 | Live updates (2026-10-13): no Bitrix24 outbound webhook has reached pulse.nuralsales.com (`lastWebhookAt` empty; a test call with a wrong token is refused with 401, so the route is reachable). Token mismatch, or Cloudflare challenging Bitrix24's calls? | Open: check `pm2 logs pulse-api` for "application token mismatch"; if nothing arrives, add a Cloudflare WAF skip rule for `/hooks/bitrix`. The 10-minute reconcile keeps the data current meanwhile |

**What was checked for this SRS:** the Bitrix24 portal through its API (11 stages on group 148, 10 on Support Tool group 154 with no On Hold, 30 active users, task 41580 with tag "new development"), the three screenshots, and Mohit's QA Pulse artifact. The Figma file blocked automated access, and the company structure page itself is browser-only, so department membership comes from the screenshot and will be read through `department.get` at build time.

## 12. Stage rules, automatic time tracking, planned vs actual

**Status: a later milestone, not built.** It needs the dashboard to write to Bitrix24 (stage guard, plan dates, comments), which changes the read-only rule. The KPI tab (section 13) is built read-only for now; its hours, efficiency and scores return once the stage clocks below exist.

Added 2026-10-10. This section makes the board behave like a Jira workflow (only allowed moves, by allowed people) and measures time from stage moves, so developer, team lead and PM time is recorded the same way for everyone without anyone pressing a timer.

### 12.1 What Bitrix24 can and cannot do natively

| Need | Native in Bitrix24? | How we do it |
| --- | --- | --- |
| Allow only certain stage-to-stage moves (Jira transitions) | **No.** Project roles decide who can see and edit a project's tasks; `task.stages.canmovetask` only answers "can this user move tasks on this board at all", not per transition. Automation rules and triggers run actions when a task *enters* a stage; they cannot block a move. | Backend **stage guard** (12.3): checks every move against a transition table and moves an illegal move back. |
| Start, pause, complete the timer on a stage move | **No.** The Bitrix24 timer belongs to the person who presses it. The REST API cannot run another person's timer, and `task.elapseditem.add` rejects a `USER_ID` other than the caller ("You cannot pass another user's identifier"). There is no "start timer" automation rule. | Backend **stage clocks** (12.4): time is computed from the stage-move log, attributed to the right person, and shown on the dashboard. The Bitrix24 timer is no longer the source of truth. |
| Planned start = time it entered In progress, planned end = deadline | Not reliably (no confirmed automation rule sets these fields from the move time). | Backend writes `START_DATE_PLAN` and `END_DATE_PLAN` with `tasks.task.update` on the first move to In progress (12.5). |
| Know who moved a task and when | **Yes.** `tasks.task.history.list` records every stage move as field `STAGE` with from/to stage names, user and time. Checked on task 41900: "To do → Issue Raised" and "Issue Raised → To do" by Mohit Srivastava with timestamps. | Used for the stage-move log, for backfill of old tasks, and to find who made an illegal move. |

Why not keep the manual timer: on 2026-10-10 the portal had 38 tasks in status In Progress, many with timers left running for days (for example task 37948, a same-day task, shows 72.6 hours logged). Stage clocks remove that drift.

### 12.2 Stage meaning (who owns the clock)

| Stage | Clock owner | Phase |
| --- | --- | --- |
| To do | none (waiting) | Queue. After Issue Raised it starts the **rework** phase (see 12.4) |
| In progress | Assignee (developer) | Development |
| Pushed to Master | Team lead | Code review |
| Merged to Development | Team lead / PM | Staging deployment |
| Pending for QA | Team lead / PM | Staging deployment |
| QA Backlog | QA | QA waiting. Entering it ends delivery time |
| In QA | QA | Testing |
| Issue Raised | Assignee | Rework waiting |
| On Hold | none | **Pauses every clock until the task is moved to In progress again** |
| Done, LIVE | none | Release |

### 12.3 Stage guard (Jira-like transitions)

**Transition table** (stage names, configurable in `config/transitions.json`; "TL" = team leads and PM, "QA" = QA Testing department, admins can do any move):

| From | Allowed to | Who |
| --- | --- | --- |
| To do | In progress | Assignee, TL |
| In progress | Pushed to Master, To do | Assignee, TL |
| Pushed to Master | Merged to Development; back to In progress | TL |
| Merged to Development | Pending for QA, QA Backlog | TL |
| Pending for QA | QA Backlog | TL |
| QA Backlog | In QA | QA |
| In QA | Done, Issue Raised | QA |
| Issue Raised | To do | Assignee, TL, QA |
| Done | LIVE | TL |
| Any stage | On Hold | TL |
| On Hold | In progress (clocks resume), or the stage it came from | TL |

**How it runs**

1. The sync worker sees `STAGE_ID` changed (8.3 step 4).
2. It reads the newest `STAGE` record of `tasks.task.history.list` for that task to get the user who moved it.
3. It looks the move up in the table (by stage name, using the user's role from the company structure).
4. Allowed: the move is logged in `task_stage_events` as normal.
5. Not allowed: the worker moves the task back with `task.stages.movetask`, re-reads the task to confirm the stage really changed back (the API can answer `true` without moving), posts a task comment "@user: moving from Merged to Development to QA Backlog is not allowed. Allowed next stages: Pending for QA (team lead)", and records the attempt in `stage_violations`.

**Limits**

- It is a correction, not a block: the card can sit in the wrong column for a few seconds before it jumps back.
- If the backend was down, the reconciler finds the move later. Moves older than 2 minutes are **flagged only, never reverted**, so nobody sees a card jump back long after they moved it.
- The Complete button sends a task straight to QA Backlog (section 2). Under these rules, a developer pressing Complete from In progress is an illegal move and gets reverted. Developers should move the card to Pushed to Master instead; the team lead takes it to QA Backlog.
- Rollout: run in **monitor mode** (log and comment, no revert) for the first two weeks, review `stage_violations` with the team leads, adjust the table, then switch `STAGE_GUARD_MODE=enforce`.

### 12.4 Stage clocks (automatic time tracking)

Every stage move is an event with a time. A **clock segment** is the time between entering a stage and leaving it, counted in **working hours only** (Mon–Fri 09:30–18:30 Asia/Kolkata, public holidays excluded; see 13.1 and `config/holidays.json`). Each segment is charged to the clock owner from 12.2: the assignee at that moment for development, and the person who made the next move for TL/PM stages (history tells us who).

What Mohit asked for, mapped to clocks:

| Request | Clock behaviour |
| --- | --- |
| "Start" when moved to In progress | Development clock starts for the assignee |
| "Complete first time" at Merged to Development | Development clock stops. **Developer time** = In progress → Merged to Development (includes the code-review wait, which is shown separately) |
| "Complete the resumed task" at QA Backlog | TL/PM clock stops. **Review and deploy time** = Merged to Development → QA Backlog, charged to whoever moved it to QA Backlog |
| Issue Raised → To do starts again | **Rework clock** starts at To do and runs until the task reaches Merged to Development again; charged to the assignee as rework hours |
| On Hold | Pauses all clocks. They stay paused until the task next enters In progress, even if it passes through other stages first (for example On Hold → To do → In progress). Hold time is shown, never charged |

**Per-task numbers stored in `task_time_summary`**

| Field | Definition |
| --- | --- |
| dev\_hours | Working hours in In progress (first cycle) |
| review\_hours | Working hours in Pushed to Master (first cycle) |
| deploy\_hours | Working hours in Merged to Development + Pending for QA (first cycle) |
| developer\_time | First In progress → first Merged to Development, minus On Hold |
| tl\_pm\_time | First Merged to Development → first QA Backlog, minus On Hold |
| actual\_hours | First In progress → first QA Backlog, minus On Hold ("real time") |
| rework\_hours, rework\_cycles | Sum and count of To do (after Issue Raised) → Merged to Development cycles |
| hold\_hours | Total On Hold |

Optional write-back: when a task first enters QA Backlog the backend posts one comment, "Development 6h 20m · Review 1h 05m · Deploy 0h 40m · Planned 9h 00m", so the numbers are visible inside Bitrix24 too. Time is not written as elapsed-time entries, because the API would record them under the webhook owner instead of the developer.

### 12.5 Planned dates

- **Planned start**: on the first move to In progress the backend sets `START_DATE_PLAN` = move time (only if empty, so a later manual edit by the TL is kept).
- **Planned end**: `END_DATE_PLAN` = `DEADLINE`, set at the same time and updated whenever the deadline changes.
- **Baseline**: the dashboard also freezes `baseline_deadline` = the deadline at the moment of first In progress. Planned vs actual uses the baseline, so pushing the deadline later does not make a late task look on time. Each deadline change after the baseline is counted (`deadline_changes`) and shown in the task drawer.
- The backend ignores the webhook event its own update causes (same task, changed by the webhook user, only plan fields changed).

### 12.6 Planned vs actual

Per task:

| Metric | Formula |
| --- | --- |
| Planned hours | Working hours from planned start to baseline deadline |
| Actual hours | `actual_hours` from 12.4 |
| Variance % | (Actual − Planned) / Planned × 100; negative = faster than plan |
| On time | First QA Backlog ≤ baseline deadline |

Per employee (filter: project, date range of first QA Backlog): tasks delivered, on-time %, planned hours, developer hours, rework hours and cycles, average variance %. For team leads and PM: review and deploy hours handled, median time from Merged to Development to QA Backlog.

Per project: the same totals over all its tasks, plus the share of time by phase (development, review, deploy, rework, hold), which shows where a project loses time.

New dashboard views: a **Planned vs Actual** table (employee rows, the columns above, sortable) on the Development tab, a project roll-up card, and a phase-time bar in the task drawer.

### 12.7 Changes to the rest of this SRS

- 8.1: the dashboard now **writes** three things: plan dates (`tasks.task.update`), guard moves (`task.stages.movetask`) and guard or summary comments. Add `task` write permission to the backend's webhook or use the server-side local app's OAuth token. The account it acts as must be a moderator of every development project.
- 8.4 / open question 4: resolved. Bitrix24 history does record stage moves on this portal, so old tasks are rebuilt from history.
- New tables: `stage_violations` (task\_id, from\_stage, to\_stage, moved\_by, moved\_at, action reverted|flagged), `task_time_summary` (fields in 12.4 and 12.5), `clock_segments` (task\_id, stage, user\_id, phase, started\_at, ended\_at, working\_seconds, cycle).
- New env keys: `STAGE_GUARD_MODE=monitor|enforce`, `WORK_CALENDAR=config/calendar.json`.

### 12.8 Defaults to confirm

| # | Question | Default assumed |
| --- | --- | --- |
| 12 | Working hours for clocks | Resolved: Mon–Fri 09:30–18:30 IST, public holidays excluded (13.1) |
| 13 | Who counts as TL/PM for the guard | Balram Jha (PM), Adnan Mubeen, Faiz Arsalan, plus each project's owner |
| 14 | Should the guard revert, or only warn? | Monitor for two weeks, then revert |
| 15 | Developer time ends at Merged to Development (includes review wait) | Yes, as requested; review wait is also shown separately |

## 13. KPI tab (management overview)

Added 2026-10-10, simplified the same day. **KPI** is the first tab and the one the dashboard opens on (tabs: KPI · Development · QA). It is written for upper management. Unlike the Development and QA tabs, it covers **every task in every workgroup**: development, QA and support work.

It answers five questions: what is open and late, what was delivered and on time, which projects need attention, who holds the work, and which projects are busy or silent. The tab shows **counts, not estimated hours**. Every number opens the tasks behind it, so it can be checked against Bitrix24.

**Why counts, not hours (decision of 2026-10-10).** The first draft of this section measured planned vs actual hours, efficiency, load % and a 0–100 score. The tasks carry no effort data, though: planned start is set on 146 of 8,633 tasks, there is no time estimate, and timers are not used reliably. Tested on the real data, those figures were misleading:
- Efficiency came out at 0.08, because "actual hours" counted weeks of waiting in To do as work.
- Load reached 569 %.
- 18 of 32 projects were red.
- Only 9 projects could be scored.

Hours return when section 12's stage clocks measure real working time.

### 13.1 Working calendar

- Working time is **Monday to Friday, 09:30 to 18:30 Asia/Kolkata**. Saturdays, Sundays and public holidays are not counted.
- Holidays come from `config/holidays.json`. It starts with the national holidays (26 Jan, 15 Aug, 2 Oct; 2026 and 2027), and an admin adds the company's own.
- Working days are used for "silent" (10 working days), "no action for N working days", "due in the next 10 working days" and "In progress for over 2 working days".

### 13.2 Rules

| Term | Rule |
| --- | --- |
| Department of a task | The assignee's department, from `config/departments.json`: Development (Software Development and its sub-departments), QA (QA Testing), Support (Tech Support), BA (Business Analysis: set per person in `people`, today Yajur, user 20; 2026-10-22), else Other. The Open tasks tile splits into Dev, QA, Support and BA |
| Closed | Completed by the rule of every tab: in QA Backlog, In QA, Done or LIVE (on a board without QA stages, closed in Bitrix24). Dated by its last move from a pending stage into a completed one; without such a move, the Bitrix24 closed date |
| Open | Pending: any stage behind QA Backlog except On Hold, Issue Raised included, even after an earlier completion |
| On hold | In On Hold: neither open nor closed; its own tile (On hold) |
| Overdue | Open, with a deadline before now. Days late = calendar days past the deadline |
| On time | Closed on or before its deadline (closed tasks with a deadline only) |
| Bulk clean-up | 30 or more tasks of one project completed by one identical move, or closed the same day without one, or moved in one identical move (same person, project, day and from → to stage). Left out of closed counts, on-time % and activity, with the automatic comments Bitrix24 adds to those tasks that day. On 2026-10-10 this was 3,943 closed tasks. |
| Last action | Latest task change or comment on any of a project's tasks |
| Silent project | Open tasks and no action for 10 or more working days |
| Active project | Open tasks and an action in the last 30 days |
| Period | Day, Week (Monday to Sunday) or Month. "Closed" and "on-time" use the current period and compare with the one before; the people trend shows 8 periods |
| Tasks with no workgroup | Counted in the tiles. Left out of project and workload figures, and named in a note under the tiles |

### 13.3 Layout

The filter bar has Project, Assignee, **Department** (in place of Tag) and Date range. Above the tiles is a **Day / Week / Month** switch (default Week) with the period's dates.

**KPI-01 Tiles (one row of 6), each opening its tasks**

| Tile | Value | Under it |
| --- | --- | --- |
| Open tasks | Open tasks | Dev · QA · Support, each clickable |
| Overdue (red) | Open tasks past deadline | % of open; "Over 30 days" count, clickable |
| Closed this week (day / month) | Closed in the period | Previous period and the change (▲ / ▼) |
| On-time | % of the period's closed tasks with a deadline that were on time | Previous period's % |
| Active projects (first by default) | Every active project in Bitrix24 (still listed by sonet_group.get; archived or deleted ones drop out), narrowed by the Project filter; a person who sees only their tasks counts those tasks' projects | Recent action · Silent · Others, adding up to the total, each clickable (lists those projects in Project health) |
| No deadline | Open tasks without a deadline | — |
| Tasks in hand | Open tasks whose deadline is still ahead | Tomorrow · Rest of week · Next week · Rest of month · Next month (week first, then month), each clickable (they overlap, so they do not add up) |

**KPI-09 Insights** (first card): up to six findings from the same numbers, each opening its tasks:
- who holds the biggest share of open work;
- the project holding most of the overdue work;
- tasks over 30 days late;
- tasks In progress for over 2 working days;
- the share of open tasks without a deadline;
- silent projects.

**Tasks in hand (2026-10-12).** The same tile on KPI, Development and QA: open tasks whose deadline is still ahead (now or later, IST), and when they are planned. Windows are calendar days in APP_TIMEZONE, weeks Monday to Sunday: **Tomorrow**; **Rest of week** (tomorrow to Sunday; empty on a Sunday); **Rest of month** (tomorrow to the month's last day); **Next week** (next Monday to Sunday); **Next month** (its first to last day). The windows overlap on purpose, so the parts do not add up to the total. Overdue and no-deadline tasks are not in hand (they have their own tiles). Open means each tab's own rule: KPI open (`kpi=open`), Development pending tasks in the All / Dev / Issues scope (`preset=pending`), QA the QA Testing team's pending testing tasks (`kind=testing&preset=pending`). `/api/tasks` takes `due=ahead|tomorrow|restWeek|restMonth|nextWeek|nextMonth`; the summaries return `inHand`. Clicking the tile opens its tasks in the list below with the spotlight and keeps the tile highlighted, like the other tiles. **Tasks in hand by assignee / project** (a card on each of the three tabs, `/api/{kpi,dev,qa}/inhand?groupBy=assignee|project`): a bar chart of one window, picked above it (All, Tomorrow, Rest of week, Rest of month, Next week, Next month), and a table of every window with a totals row equal to the tile. A bar or count opens those tasks for that row (and sets its filter); a name sets the Assignee or Project filter (`inHandByGroup`, `components/InHandCard.tsx`) (`metrics.ts` DUE_WINDOWS, dueWindowRange, isDueIn, tasksInHand; `components/InHandTile.tsx`).

**Active projects split (2026-10-12).** Each active project is in exactly one part: **Silent** = open tasks and no action (task change or comment) for 10+ working days; **Recent action** = open tasks and an action in the last 30 days, not silent; **Others** = the rest (no open tasks, no tasks yet, or no action for 30 days). The sync marks a workgroup no longer listed in Bitrix24 as not active (`workgroups.active`); its tasks still count everywhere else. `kpi.ts` projectActivity, activeProjectSplit.

**KPI-02 Project health (table)**: one row per project, worst first. An Activity column shows its part of Active projects ("Not in Bitrix24" for an archived one), and a switch lists All, Active, Recent action, Silent or Others (with counts); active projects with no tasks in view are listed too. The Active projects tile and its parts set the switch.
- Columns: Project, Owner, Status, Open, Overdue, Most late (days), No deadline, Closed this period, On-time %, Done % (closed / all), Last action ("5 h ago", or in red "No action for N working days" after 3 working days).
- Owner = the Bitrix24 group owner, or `config/project-owners.json` when a project is listed there.
- Status:

| Status | Rule |
| --- | --- |
| Red | Over 25 % of open tasks overdue (at least 3 tasks), or a task more than 30 days late |
| Amber | Any overdue task, or silent |
| Green | Neither |

**KPI-06 Overdue**:
- The total with ageing chips: 1–2, 3–7, 8–30 and over 30 days late.
- Two ranked lists, **by project** and **by person** (top 8 each), with the same chips.

**KPI-05 Workload**: stacked bars per person (top 15 by open tasks) of open project tasks: overdue, due in the next 10 working days, due later, no deadline.

**KPI-04 People (table)**: Person, Department, Closed this period (▲ / ▼ vs the previous one), On-time %, Open, Overdue, Due in 10 working days, Sent back (QA send-backs on the tasks closed in the period), and a sparkline of tasks closed over the last 8 periods.

**KPI-07 Activity, last 7 days**:
- The 5 busiest projects, as cards of plain counts: new tasks, bugs raised, stage moves and comments, with a 14-day sparkline. They are ranked by new × 2 + bugs × 3 + moves + comments; bulk clean-ups are left out.
- Below them, the silent projects: owner, open and overdue tasks, working days without action, and last action.

**All tasks** (accordion at the bottom): the tasks behind the last number clicked, titled with its label. It defaults to all open tasks, has search, Excel export, and row click opens the task drawer. A number of one project or person also sets that filter, as on the other tabs.

Every card and tile has an "i" note with its rule.

### 13.4 Data and API

- Read-only for this tab (task actions are in section 7). The sync additionally reads `START_DATE_PLAN`, `END_DATE_PLAN` and `DATE_START` on tasks, and `OWNER_ID` on workgroups (`tasks.start_date_plan`, `tasks.end_date_plan`, `tasks.date_start`, `workgroups.owner_id`). Comments come from the outbound webhook's `ONTASKCOMMENTADD` events (kept 30 days).
- Config files: `config/holidays.json`, `config/project-owners.json`, `config/departments.json`.
- Endpoints, all taking the filter parameters plus `period=day|week|month` and `dept=all|dev|qa|support`: `GET /api/kpi/summary`, `/api/kpi/projects`, `/api/kpi/people`, `/api/kpi/workload`, `/api/kpi/overdue`, `/api/kpi/activity`, `/api/kpi/insights`.
- Task lists: `GET /api/tasks?kind=kpi`, with:
  - `kpi=open|overdue|closed|noDeadline|longInProgress|silent|dueSoon|dueLater`;
  - optional `kpiAgeing=1-2|3-7|8-30|30+`, `noProject=true`, `dept` and `period`.

  The same rules as the cards decide every list (`kpiList` in `packages/shared/src/kpi.ts`).
- Computed per request from the in-memory dataset: about 0.1 s for 8,600 tasks, cached for a minute per query.
- Checked on 2026-10-10 against independent SQL on the full database, after the pending / completed rule was unified across tabs. Open 507 (Development 468, matching the Development tab's Pending), overdue 391 and no deadline 83 all matched.
- Who sees it: full access only (admins and directors, PM, team leads, product owners; NFR-4). Members do not get the tab, and its endpoints refuse them.

## 14. Support tab (coming soon: feedback first, 2026-10-11)

The Support tab will be built from what the support team and management need. Until then it is a **Coming soon** page that collects that input.

**Who sees what**

| Part | Who | Enforced |
| --- | --- | --- |
| Support tab, feedback form, "My feedback" | Tech Support department (with sub-departments), PM, team leads, admins | Server: `POST /api/feedback` and `GET /api/feedback/mine` answer 403 to others; the web app hides the tab and opens others on Development |
| Feedback inbox (every entry), review, note, Excel export | Admins and the head of the top Tech Support department in Bitrix24 (today Kuku Jat) | Server: `GET /api/feedback`, `POST /api/feedback/:id/review` and `GET /api/feedback/export` answer 403 to everyone else |

Each person sees only their own entries under "My feedback".

**Page**

- Header: "Coming soon", the title "The Support tab" and the quote *"Great support is built by listening first. Tell us what slows you down, and we will build the tab that speeds you up."*
- **Share your needs** form:
  - What is it about (Support tab / dashboard idea / something not working / other);
  - what the Support tab should show (tick boxes: open tickets by project or client, ageing and SLA breaches, first response time, time to resolve, volume per client, tickets per support person, reopened, escalated to development, trend, team workload, alerts, Excel export);
  - how often they would use it (daily, a few times a week, weekly, monthly);
  - **biggest problem today (required, at least 10 characters)**;
  - reports made by hand;
  - the decision it would help make;
  - importance (must / should / nice to have);
  - a 1–5 star rating of the dashboard so far;
  - anything else.
- **My feedback**: the person's own entries, with New or Reviewed.
- **Feedback inbox** (inbox readers only):
  - filters New, Must have and All, with counts;
  - each entry opens to show every answer, with a private note and Mark reviewed / Mark as new;
  - **Excel** downloads every entry.

**Data**

- Table `feedback`, migration 0004.
- Each entry records the person's name, role and department at the time.
- Nothing is sent to Bitrix24.
- Code: `apps/api/src/routes/feedback.ts`, tests in `feedback.test.ts`; `apps/web/src/features/support/SupportTab.tsx`.

## 15. New version notice (2026-10-11)

After a deploy, everyone who has the dashboard open gets a toast: **"A new version of the dashboard is ready. Refresh to get the latest update."** with a **Refresh** button. The toast stays until it is used or closed.

- Each build has an ID (its build time). The ID is compiled into the app and written to `/version.json` (`apps/web/vite.config.ts`).
- The open page reads `/version.json` every minute, when its browser tab is shown again and when the browser comes back online. It skips the check while offline or hidden. A different ID shows the toast, once (`hooks/useNewVersion.ts`).
- Caddy serves the page and `/version.json` with `Cache-Control: no-cache`, so Refresh always loads the new build. The hashed `/assets/*` files stay cached for a year.
- **What it says (2026-10-11):** the toast also lists what the new version brings: "What's new: Guided tour (Development) · …", from the build's what's-new entries the open page does not know yet (`/version.json` carries `news`). An update without new entries says "Improvements and fixes".

## 16. Guided tour and what's new (2026-10-11)

The dashboard shows each person around, in their own scope, and walks them through every new feature.

**The tour of a tab** (`apps/web/src/features/tour`). Each step highlights one part of the page, with the rest dimmed and the part ringed in teal, and a bubble explains it: what the number counts (the same rules as the "i" icons) and how to use it (click a count to list its tasks, focus a card, drag ⠿, edit in place).
- **Scope:** only parts on the person's screen are shown. A member never gets KPI steps, and the feedback inbox is shown only to its readers. Members get their own wording ("your tasks: assigned to you; testers also the issues they filed").
- **Every tab they can open:** admins, PM, team leads and product owners get KPI, Development, QA (and Support); most members get Development and QA; the support team also gets Support. The last step of a tab offers "Next: <tab> tab →" until every tab has been shown on that sign-in.
- **Role first.** The first tour of a sign-in opens with *Your role*:
  - their name and Bitrix24 designation (e.g. "Neha Gautam, Software Developer");
  - their role (Admin, Project Manager, Team lead, Product owner, team member);
  - what they see: everything, or only tasks assigned to them (testers also the issues they filed);
  - what they can change: every field, or stage, status and tags;
  - for members, how their department uses the dashboard (developer, tester, support);
  - for inbox readers, the feedback inbox.
  - After the role, the top bar: tabs, filters, alerts, live, profile.

**Placement (fixed 2026-10-11).** The bubble sits next to its data point and follows it while cards above load and grow. The tour tracks the current element itself, since driver.js could leave its mark on earlier ones and place a bubble beside the wrong card. A data point taller than most of the screen (an open list) is pointed at by its header, so the bubble stays visible. The bubble shows the tour kind ("Guided tour", "What's new", "About this"), the step count and a progress bar.

**When it plays:**
- on a person's first **3 sign-ins** (the count kept in `user_prefs`), each tab's tour plays once per sign-in when the tab is opened;
- at any time from **Profile → Take the tour of this tab**;
- with sign-in off (local copy) only from the profile.

**Text or voice.**
- Every bubble has **Voice on/off**, also in the profile as **Read the tour aloud**. The choice is saved per person.
- The voice is the browser's own speech (Web Speech API). It prefers an Indian English voice, then a natural-sounding English one. It stops when the step changes or the tour closes, and it is hidden where the browser has no voice.

**What's new** (`features/tour/whatsNew.ts`). Every update that changes what people see adds an entry `{ id, date, tab, title, steps }`.
- **Signs of a new entry:**
  - the "new version" toast lists its title;
  - after refreshing, its tab shows a teal dot;
  - a toast on load says "New on <tab>: <title>", with Show me.
- **Walkthrough:** opening the tab walks through its steps once, titled "New: …". It is then saved as seen.
- **Who gets it:** entries for tabs the person cannot open are skipped. During the first 3 sign-ins the full tour covers everything, so the entries count as seen.

**Data and code:**
- `user_prefs.tour` holds `{ voice, shown: { tab: sign-in number }, seen: [ids] }`.
- The rules (`logic.ts`) are pure functions with Vitest tests:
  - which tabs;
  - when a tour is due;
  - the role step's position;
  - the next tab;
  - unseen features;
  - visible steps and member wording.
- Content: `steps.ts`, `whatsNew.ts`.
- Tour bubbles: driver.js (MIT).

**Keeping it current.** A new tile, card or section adds its step in `steps.ts`. A new feature adds a `whatsNew.ts` entry. Both are part of finishing a change.

**Switches name what they change (2026-10-12).** A tour step for a switch or filter lists the data points it changes (`affects` in `steps.ts`); while it shows they glow above the dimmed page, and the text says which data points do not follow it: KPI Day / Week / Month (Closed, On-time, Project health, People; not Open, On hold, Overdue, Active projects, No deadline), Development All / Dev / Issues (every tile and card), Insights 7 / 14 / 30 days (lagging, has room, findings, projects, load, pulls; not overload, split work, release plan). A common step explains that one number can differ between two places. Tour bubbles that land away from their element are moved next to it (`keepNear` in `runTour.ts`).


## 17. Employee module (2026-10-11)

For people with the **employees** right (by default admins, PM and team leads). **Access permissions** needs the **admin** right. Pages open from the side drawer's *Employees* group. Data comes from Bitrix24 (users, departments) and the dashboard (sign-ins, activity, rights). Code: `apps/api/src/routes/employees.ts`, `access.ts`; `apps/web/src/features/employees`.

**Company tree** (`GET /api/employees/tree`):
- the company's departments as in Bitrix24, nested under their parents with connector lines;
- each department shows its head (monogram, name, designation), its people (including sub-departments) and its number of teams;
- opening a department lists its people with designations;
- the top two levels start open; Expand all and Collapse all;
- search finds a person, designation or department, highlights it and opens the way to it.

**People directory** (`GET /api/employees`, Excel `GET /api/employees/export`):
- **Tiles** (click to filter): employees (active in Bitrix24), signed in (session open), active now (last 5 minutes), never signed in.
- **Table:**
  - employee (monogram, name, designation);
  - department;
  - role;
  - **access areas**: All data or Own tasks, KPI, Dev · QA, Support, Inbox, Employees, Edit all or Edit limited, Admin;
  - **dashboard status:** *Active now*, *Signed in* (sign-in less than 3 days ago), *Session ended*, *Signed in earlier* (before sign-in times were kept), *Never signed in*, with the number of sign-ins;
  - **last active;**
  - open and overdue tasks (within the viewer's own data scope).
- **Filters:** search, department, status, show inactive.

**Editing people and departments (2026-10-12, admins):**
- **People directory › Edit** (a side panel per person):
  - **Dashboard role** (Admin, Project manager, Team lead, Product owner, Member): saved on the dashboard as `role` on the person's access grant. It wins over `config/roles.json` and project ownership; locked admins (roles.json) cannot be changed. Their default rights, data scope, reports and team follow it at once; the change is in Recent changes.
  - **Designation** and **Departments** (several, from the department tree, with *+ New department* inline): sent to Bitrix24 (`user.update` with `UF_DEPARTMENT`, `WORK_POSITION` only).
- **Manage departments** (dialog): add a department (name, parent, head; `department.add`), rename one, move it under another (never under itself or its own sub-department), change its head (`department.update`).
- **How:** every Bitrix24 change goes with the admin's own Bitrix24 sign-in (OAuth token), never the webhook, only through the allowlist in `bitrix/methods.ts` (`PEOPLE_FIELDS`), checked in three places (route, limiter, REST client). No delete, no new users. A confirmation popup lists each change and where it goes. Every attempt is logged in `people_actions` (who, what, from, to, ok, error). On success the directory (users, departments) is synced from Bitrix24 at once, so the tree, the directory and department-based rights update.
- **Bitrix24 setup:** the dashboard's local app needs the **Departments (department)** and **Users (user)** permissions, and the admin needs Bitrix24 admin rights; otherwise Bitrix24's refusal is shown in plain words (`PUT /api/people/:id`, `PUT /api/people/:id/role`, `POST /api/departments`, `PUT /api/departments/:id`).

**Access permissions** (admins; section 7, Rights; redesigned 2026-10-12):
- **One right per page.** The rights follow the menu (`packages/shared/src/modules.ts`, read by the menu, this screen and the tests), so a new page appears here by itself:

| Module | Page (right) | Permissions under it | Default |
|---|---|---|---|
| Dashboard | KPI (`kpi`) | | not members |
| | Development (`dev`) | Data: all / own tasks (`scope`); Edit: all fields / stage, status, tags (`edit`) | everyone |
| | QA (`qa`) | | everyone |
| | Support (`support`) | Support inbox (`inbox`) | Tech Support, PM, team leads; inbox: Support lead |
| Insights | Insights (`insights`) | | everyone |
| Employees | Company tree (`org`), People directory (`people`) | | PM, team leads |
| | Access permissions (`admin`) | | admins |
| Integration | Connections (`connections`), Mailing (`mailing`) | | admins |
| Help | Feedback (`helpFeedback`) | Feedback inbox (`helpInbox`) | everyone; inbox: admins, PM, team leads |
| | Documents (`helpDocs`), FAQs (`helpFaq`) | | everyone |

  Finance is not grantable: admins only, always. Grants saved before 2026-10-12 with `employees` still count for both Employee pages.
- **Server:** each page's API checks its right (`server.ts` PAGE_GUARD: `/api/dev` dev, `/api/qa` qa, `/api/insights` insights, `/api/employees/tree` org, `/api/employees` people or mailing or admin, `/api/reports` mailing, `/api/integrations` connections or mailing); a page you may not open sends you to your first allowed page.
- **Screen:** on the left, *People* or *Departments* with search (a dot marks someone with their own settings, a lock a locked admin). On the right, every module as a compact card: icon, bold name, "3 of 4 pages open" and a master switch for the whole module; open it for its pages, each with an on/off switch, a dot for where the value comes from (grey role, blue department, teal person, red locked, amber not saved yet) and ↺ back to inherited; the permissions sit under their page as two-choice pills. *Allow all modules*, *Remove all* (Access permissions is never switched on in bulk) and ↺ for everything.
- **Saving:** changes are a draft until **Save** (or *Discard*) in the bar at the bottom, which counts them; they apply from the person's next click.
- **Recent changes:** the last 30 changes (who, for whom or which department, what, and what it was before), as a compact timeline.
- **Locked:** admins in `config/roles.json` cannot be changed.

## 18. Insights (2026-10-12)

**What it is.** What is holding us back, from Bitrix24 and dashboard data; Infowan absences join once connected (section 19).
- **Who:** everyone. It reads the request's own dataset, so a member's page is *My insights* and covers their own tasks; full access covers the company.
- **Rules:** pure functions in `packages/shared/src/insights.ts`, with tests, built on the KPI task view (same open, overdue and completed rules).
- **Thresholds:** in `INSIGHT`.
- **Period:** looks back over 7, 14 (default) or 30 days. Every finding carries its task IDs, and clicking it opens them (`/api/tasks?ids=`).

**Rules:**

| Finding | Rule |
|---|---|
| Lagging project | ≥ 3 overdue and ≥ 25 % of its open tasks; or open work and no action (move, closure, comment) for 10+ working days; or closed ≤ half of the period before (≥ 4 before) |
| Lagging person | ≥ 3 overdue and ≥ 30 % of their open tasks; or < 50 % on time (≥ 3 closed with a deadline); or closed ≤ half of the period before with ≥ 5 open |
| Overloaded | ≥ 10 open and ≥ 2× the team median, or ≥ 8 due in the next 5 working days |
| Has room | ≤ 2 open and ≤ 2 closed in the period while one of their projects has overdue work |
| Split across projects | Open work in 2+ projects |
| Pulling people away (cause) | One project takes ≥ 70 % of a person's actions in the period while their tasks in another project are overdue |
| Release risk | Open tasks due this week or next. *High*: overdue, or not started (To do, Issue Raised) and due within 2 working days. *Medium*: not started, or In progress. *Low*: further along |

**What is holding us back.** The findings are ranked: causes first, then releases at risk, lagging projects, overload, lagging people, people with room.

**Page:**
- **Tiles:** lagging projects, lagging people, overloaded, has room, split across projects, releases at risk.
- **Cards:**
  - What is holding us back;
  - Projects: overdue vs on track;
  - Load per person;
  - Projects pulling people away;
  - Release plan (this week and next);
  - Leave and attendance (Infowan).
- **Tiles list who or what (2026-10-12):** Lagging projects and Releases at risk open a list of **projects**; Lagging people, Overloaded, Has room and Split across projects a list of **people**. Each row says why it counts in words ("197 of 204 open tasks overdue (97 %); no action for 37 working days") with its numbers; a row opens that project's or person's tasks, with *‹ Back* to the list. Each tile names its unit (Projects, People, Tasks). Pure function `features/insights/entities.ts`, with tests.
- **Tasks list:** every other number opens its tasks here.
- **Tools:** drag, Customise, tour, focus and export, as on every page.

**API:** `GET /api/insights?window=7|14|30`. It is part of the scoping suite.

## 19. Integration: Connections and Mailing (2026-10-12)

**What it is.** Admin pages under *Integration* in the menu (`admin` right; API refuses others with 403).
- **Connections:** Microsoft 365 mail (Graph `sendMail` from one mailbox), Slack (bot app: direct messages found by work email, and channel posts), Infowan (leave and attendance; *Not connected* until its API docs and key arrive, so Insights and reports use Bitrix24 and dashboard data only). Each shows its status and *Send a test to me*.
- **Mailing:** a designer for performance reports.

**Secrets (server only, `.env` / `.env.prod`, never in the web app or logs):** `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MAIL_FROM`; `SLACK_BOT_TOKEN`; later `INFOWAN_BASE_URL`, `INFOWAN_API_KEY`. Without them sends are logged as *skipped: not connected*.

**A report has:**

| Part | Choices |
|---|---|
| When | Daily (working days only by default), weekly (weekday), monthly (day 1–28), or **conditional**: checked daily, sent to each recipient whose own numbers are *very poor* or *very good* (on-time % last 7 days, overdue share of open tasks, closed vs the usual week), at most once a week per person. Times are IST; a report before 12:00 covers the day, week or month before, later ones the current one. |
| Who | Roles (admins/management, PMs, team leads, product owners, members) and named people. |
| What | Topics, in order: How it went, Due today, Tasks in hand (next working day, week, month), Releases this week, What went well, What to improve, Lagging projects and people, Load and overlap, What is holding us back, Leave and attendance. Plus suggested or own questions (up to 10). |
| How | Mail to each person with CC; Slack direct message to each person; Slack channels (one copy each, company view). |

**Scope per recipient** (`reports/scope.ts`, with each person's own rights): admins and PMs the company; team leads their departments' people (Bitrix24 tree, sub-departments included) and projects they own; product owners their projects; members (and anyone without all-data rights) their own tasks.

**States:** new reports start in **Preview**: only admins get them, subject `[PREVIEW]`, built for a sample recipient with the list of who would get it when live; no CC, no channel posts. **Live** sends to everyone on schedule; **Paused** sends nothing. *Send test* goes only to the admin who asked (`[TEST]`). *Preview* on the page renders the mail as any chosen person would get it, sending nothing.

**Running:** one BullMQ job scheduler per report (`report-<id>`, cron in Asia/Kolkata), only on the server with the sync worker on. Every send is logged in `report_runs` (recipient, channel, status sent/failed/skipped/test, error); a unique key (report, period, recipient, channel) stops duplicates. A failed send is logged and the run carries on.

**Setup:**
- *Microsoft 365:* Entra ID app registration → Microsoft Graph **Mail.Send** (application) with admin consent → limit it to the sender mailbox with an Exchange application access policy → client secret → put the four `MS_*`/`MAIL_FROM` values in `.env.prod` and redeploy.
- *Slack:* api.slack.com app → app from a manifest (bot scopes `chat:write`, `users:read`, `users:read.email`, `im:write`, `channels:read`; Slack rejects `users:read.email` without `users:read`; keep token rotation off) → install → invite it to report channels → `SLACK_BOT_TOKEN` in the server's `.env` (`~/mohit/nural/.env` on the live server, `.env.prod` with Docker) and restart the API (`pm2 restart pulse-api --update-env`).

**API (admins):** `GET /api/integrations/status`, `POST /api/integrations/test`, `GET /api/integrations/slack/channels`, `GET /api/reports/catalogue`, `GET|POST /api/reports`, `PUT|DELETE /api/reports/:id`, `POST /api/reports/:id/state|render|test`, `GET /api/reports/:id/runs`. Content builders are pure functions in `packages/shared/src/reports.ts` with tests.


## 20. Help (2026-10-12)

**Who:** everyone by default (rights `helpFeedback`, `helpDocs`, `helpFaq`); the Feedback inbox needs `helpInbox` (admins, PM, team leads by default). Menu module *Help*.

**Feedback** (`routes/help.ts`, tables `help_feedback`, `help_files`):
- **About:** the dashboard, a page (from the person's menu), a project or a person. Projects and people offered are only those in the sender's own data (`GET /api/help/options`, scoped dataset); the server refuses a project or person they cannot see.
- **Fields:** title, details, impact (low, medium, high).
- **Attachments:** up to 5 files of 8 MB each: images (also pasted with Ctrl+V or dropped), PDF, Excel (xlsx, xls, csv), Word (docx, doc). Sent as base64 in JSON; type by extension and size are checked on the server; stored in Postgres; downloaded with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and a sandbox CSP (images may show inline). Only the sender and the inbox can open a file.
- **My feedback:** what the person sent, its status and the reply.
- **Feedback inbox:** everyone's feedback (Finance feedback to admins only), filters by status and impact, attachments, a reply that marks it reviewed, Excel export.
- **Refresh (2026-10-13):** feedback sends no live event, so My feedback and the inbox check every 30 s while the page is open and again when its tab regains focus (`FEEDBACK_POLL_MS`, `features/help/api.ts`); a reply saved by another reader replaces the one in the box. Long words and links wrap inside their own card instead of running over the next one.

**Documents:** the PDF guides for the person's guide set (section 6, Guides): the whole dashboard (User guide, Module guide) and one guide per page they can open (`/guides/<set>/modules/<Page> guide.pdf`; shown only once built).

**FAQs:** questions and answers by topic (`features/help/faq.ts`), searchable; includes why one number can differ between two places.

**Feedback prompt:** a day after a person's first sign-in (`user_prefs.first_sign_in_at`; earlier users from their second sign-in), on a later visit and not over a tour, a card asks how it is going (read aloud when Voice is on), with *Give feedback* (opens Help › Feedback; asks again in 30 days), *Later* (7 days) and *Don't ask again*. Pure rule `features/help/nudge.ts`, with tests. A Feedback icon is always in the page tools.

## 21. Finance (2026-10-12)

**Cost to company** (menu module *Finance*): admins only, always; not grantable on the Access screen. Coming soon: a quote card ("What gets measured gets managed." Peter Drucker) and a *Share your needs* form saved as Help feedback about Finance, which only admins read. The API refuses Finance feedback from anyone but admins.


## 22. Projects and the workflow (2026-10-12)

**The workflow is data.** The Kanban stages, what each counts as and the roles they play live in one definition (`packages/shared/src/workflow.ts`, `DEFAULT_WORKFLOW` = the standard 11-stage flow). Every rule reads the stage tables in `stages.ts`, which `applyWorkflow()` fills from the definition, on the server at start and after a change, and in the browser before the pages draw. Nothing names a stage in code any more: rules ask for the stage playing a role.
- **Per stage:** title; the column names mapped to it; category (open, on hold, completed); roles (start, working, QA entry, testing, issue, ready, live; each at most once); owning department (PM / team lead, Development, QA Testing, Tech Support, Release, Other); colour; description; usual next stages (the diagram's arrows).
- **Rework rule:** the stages a send-back goes from and to.
- **Project types:** name, rule (board has these stages / lacks those), colour; a project can be set by hand.
- **Stages from raw names:** each task's stage is worked out from its Bitrix24 column name under the current workflow when the data load (never-moved tasks: the start stage), so an edit applies to existing tasks at once.
- **Saving (admins):** `PUT /api/workflow`, validated (one start, one QA entry that counts as completed, roles once, names unique, arrows and rules name real stages). Every version is kept (`workflow_versions`) and can be restored (`POST /api/workflow/restore/:version`, 0 = the standard). After a change the data reload and every open page refreshes (live event `source: workflow`, toast "The workflow was updated").
- **Reading:** `GET /api/workflow` (everyone), `GET /api/workflow/projects` (each project's columns, the stage each maps to, unmapped columns, its type).
- **Same numbers:** with the standard workflow every number is identical to before (checked on the full data set, 22 endpoints).

**Projects module (menu, after Insights; view: everyone, rights `workflow` and `projectTypes`; edit: admins only):**
- **Workflow:** tiles (stages, open stages, completed stages, version); the **flow diagram** (one lane per department, stages left to right, solid arrows for the usual moves, red dashed for QA sending work back, faint dashed for other moves back, a "counts as" band); **Stage** (click one: department, what it counts as, roles, description, next stages, the board column names that mean it, and the numbers it feeds); **Who does what** (each department and its stages); **Versions** (admins: every saved version, restore any, or the standard). **Edit workflow** (admins): stage cards to drag into order; title, department, counts as, roles, colour, description, column names, next stages; add and remove stages; the rework rule; save shows what changes first. A renamed stage keeps its old name as a column name and follows through every arrow, rule and type.
- **Project types** (the "miscellaneous projects"): tiles (projects, full development, different stages, unknown columns); one card per type (standard: Support / individual, Design-first development, QA only, Development with release, Development without release stage, Other) with its rule and projects; each project shows its own columns and the stage each counts as, unknown columns outlined in red. Admins set a project's type by hand, map an unknown column to a stage (it becomes one of that stage's column names), and edit the types (name, colour, description, rule, order).

## 23. Daily update (2026-10-14)

**Purpose.** Each person shares their day in the Slack **daily work update** group from Pulse: what they plan in the morning, what they finished in the evening. The post is made by the Nural Pulse bot, names the person and mentions them (`<@…>`, found by work email).

**Who.** Right `dailyUpdate` (menu **My work › Daily update**): on for everyone by default; admins switch it off per department or person on Access permissions. Only the person's own tasks: data comes through `getDataset(req)` and only tasks assigned to them (`responsibleId`).

**Status rules (2026-10-17, `dailyState`).** For the Daily update and its Slack posts a task is: a **dev task or issue**: the start stage (To do) **Pending**; In progress up to before QA entry (In progress, Pushed to Master, Merged to Development, Pending for QA, Issue Raised) **WIP**; QA entry or later (QA Backlog, In QA, Done, LIVE) **Done**. A **testing task** (assigned to QA Testing): To do **Pending**, In progress **WIP**, Issue Raised or later **Done**. On Hold is **On hold**; completed in Bitrix24 is **Done**. By workflow roles, never stage names.

**Morning plan.** Opened by the person from the dock icon or the Daily update page; it never opens by itself (2026-10-15). It shows, in order: what was **carried over** from their last plan and is still Pending or WIP (a Done task never comes back), their open tasks that are **overdue** (most overdue first) and **due today** (`dailySuggestions`, packages/shared daily.ts), and an **Upcoming** list (open, deadline after today, soonest first, `dailyUpcoming`) with "Add to plan" to take one on early, then a **No deadline** list (2026-10-21: open, no deadline, most recently changed first, `dailyNoDeadline`), also with "Add to plan". When the plan is posted, every planned task of theirs with no deadline (from that list or the search) gets today's deadline in Bitrix24: the end of the working day (calendar `end`, 18:30), or 23:59 once that has passed (`dailyDeadline`); with their own login (`tasks.task.update`, `DEADLINE` only, recorded in `task_actions` as `field:deadline`), members included, the one deadline change a member's login makes. Without a Bitrix24 sign-in, or if Bitrix24 refuses, the plan still posts and the task is listed as not saved. On Slack such a task shows as due today (deadline set). Every task row shows its fields like the task lists (stage, status, project, priority, tags, deadline) and the current state, **edited in place** with the same editors and rights (`TaskActions.tsx` cells; a member changes only stage, status and tags). The plan stays viewable and changeable all day: the dock icon opens it until the wrap-up time, with **Wrap up now**. They untick tasks, add any of their other open tasks, write a note and **Post my plan**. Posting again the same day edits the same Slack message (`chat.update`). **Close** shuts it without posting.

**Add task projects (2026-10-22).** The project list offers the projects the person has tasks in (most used first); then the active projects they are a member of in Bitrix24 (owner, moderator or member; read hourly with `sonet_group.user.get` into `workgroups.member_ids`), so a new project shows before it has tasks; people with full data scope (PM, team leads, admins) then every other active project. Workgroups are read as admin (`sonet_group.get` with `IS_ADMIN`), so private projects the webhook user is not in are known before their first task.

**Posted plan and adding tasks in the day (2026-10-22).** Once posted, the plan opens as what was posted, not the planner: the time it was posted, a **Late planned** tag when that was after the check-in time (11:30, `config/daily-checkins.json` `plan`; `isLatePlan`), each task with its state now (edited in place) and an **Added hh:mm** tag on tasks added later, and the note. Buttons: **+ Add more tasks** (pick any of their open tasks, or **+ Add task** to create one; **Add to my plan** appends them, sets today's deadline on any without one, updates the morning Slack message and replies in its thread "Added to the plan at hh:mm", `POST /api/daily/plan/add`, `slackPlanAdded`), **Edit plan** (the full planner), **Wrap up now**. The page also has **+ Add more tasks** once a plan is posted. The plan's first posting time (`plannedAt`) never moves when the plan is changed later; tasks added after it keep their time (`addedAt`). The Slack plan shows **Late planned (hh:mm)** in its title. **Saved, not posted (2026-10-23).** When Slack refuses the post (or no channel is set), the plan is saved and My plan says **Saved, not posted to Slack** with **Post to Slack now** (posts the same plan again) and **Reset and plan again** (`POST /api/daily/plan/reset`: clears the plan so the planner opens again; only before it reaches Slack and before the wrap-up; the first save time stays for Late planned). A failed post is logged with its reason. The planner's **Plan** column header has a box that ticks or clears every listed task (partly ticked shows a dash). **Not wrapped up the day before (2026-10-23).** A new day always opens on planning (the wrap-up only from the end of the working day or Wrap up now); when the last earlier day with a plan (within a week) has no wrap-up, the planner, the posted plan and the page show an alert "You did not wrap up <day> (n tasks planned)" (`missedWrap` on `/api/daily/today`); its open tasks carry over as usual. Until today's plan is posted the page's main button is **Plan my day**; today's data refreshes every 5 minutes and on focus, so a tab left open overnight moves to the new day.

**Evening wrap-up.** From the dock icon after the end of the working day (calendar `end`, 18:30) or from the plan's **Wrap up now**, or when they click **Sign out** (if a plan was posted and no wrap-up yet): the plan with each task's state **now** (Pending, WIP, Done, On hold) and a **Report as** choice (Done, or as it is now); rows edited in place as in the morning; **Add a task I finished ahead** adds an upcoming (or any own open) task as Done. **Assigned after the plan (2026-10-29):** their tasks created or changed after the plan was first saved (a task assigned to them in the day; Bitrix24 keeps no assignment time, so the change time stands in), not on the plan, still open or completed since, are listed above the search (`dailyNewSince`, `newSince` on `/api/daily/today`) with **Add** and **Add all**; each is added with its state now (Report as can change it). Ticking Done on an open task completes it in Bitrix24 with their own login (as the status dropdown). **Add task** (2026-10-17, morning and evening): a form like the task view (summary, description, project, tags, priority, deadline at the end of that working day; in the evening also Done or WIP) creates a Bitrix24 task assigned to them with their own login (section 7, Task actions: the one creation, `POST /api/daily/task`), completed at once if reported Done, and puts it on the plan or the wrap-up straight away (accepted before the next data load has it). It replaces the earlier "Work outside the plan" line. **Quick entry in rows (2026-10-23):** Add task is a table, one task per row (title, tags comma separated, project, priority, deadline; in the evening also Done or WIP); clicking the task's number opens its description under the row; typing in the last row adds a new one with the same project (up to 20), Enter moves to the next row; **Create N tasks** creates them one at a time (the same `POST /api/daily/task` each), and any Bitrix24 refuses stay in the table with the reason. The wrap-up is posted as a reply in the morning post's thread, also shown in the channel. Anything Bitrix24 refuses is listed to the person; the post still goes out. Without a Bitrix24 sign-in token the post goes out and nothing changes in Bitrix24.

**Opening it.** Automatically (above; never during a tour or for automated browsers; checked every 5 minutes while the page is open), the **Daily update** icon in the right-hand dock, the page's **Plan my day** and **Wrap up my day** buttons, and Sign out.

**The page.** Tiles: planned today, done, WIP, outside the plan, days posted (30 days). Card: **My last 30 days** (shared table: day, planned, done, WIP, outside the plan, notes).

**Channel.** Set by admins on **Integration › Connections**, Slack card, **Daily update channel**: a channel from the list (saved as its ID) or a pasted ID (private channels). The bot must be invited (`/invite @Nural Pulse`). No channel or no Slack: the update is saved but not posted, and the window says so. No new Slack scopes (`chat:write` covers posting, replying and editing its own messages).

**Data.** `daily_updates` (one row per person and day: plan, wrap-up, times, Slack channel and message ts) and `app_settings` (`dailyUpdate = { channel }`).

**API** (`/api/daily`, right `dailyUpdate`): `GET today` (day, working day, minute now, wrap-up time, plan, wrap-up, suggestions, plan with live status, channel, Slack connected, Bitrix24 sign-in), `GET mine?q=` (own open tasks), `GET projects` (projects they work in), `POST plan {taskIds, note}`, `POST wrap {items: [{taskId, done}], extra: [{title, groupId, done}], note}`, `GET history`. Channel: `GET/PUT /api/integrations/daily-channel` (PUT needs `connections`).

## 24. Report › Daily task update (2026-10-17)

**Purpose.** Managers see who has planned and wrapped up their day, and for each person and day what was planned and what was actually done; everyone else sees their own days. View only.

**Who.** Right `dailyReport` (menu **Report › Daily task update**), on for everyone by default; switched off per department or person on Access permissions. Data follows the data scope (NFR-4): **full** (admins, PM, team leads) see everyone expected to post; anyone else only their own days. Guarded by `PAGE_GUARD` (`/api/report/daily`).

**Expected to post.** Every active person whose Daily update right is on (`resolveFor(...).rights.dailyUpdate`), not a placeholder assignee (`config/unassigned.json`), and not left out in `config/daily-exclude.json` (2026-10-21: the directors, the company admin account, the cancelled account and others not on the Daily update; they appear in neither the report nor the check-ins). Only working days count (company working days and the KPI holidays).

**Page.** Filters: From and To (default today, at most two months), Department, Assignee. Tiles for the last working day in the range: **Expected**, **Planned their day**, **Not planned** (names), **Wrapped up**, **Not wrapped up** (names); Not planned and Not wrapped up filter the table. Cards:
- **Who planned and wrapped up** (shared table, columns chosen and ordered by the reader): one line per person and working day: planned at, planned tasks, wrapped up at, Done, WIP, Pending, On hold (as reported in the wrap-up, else as now), Added; Not planned and Not wrapped up in red; All / Not planned / Not wrapped up switch.
- **Planned vs done**: each posted day as an accordion (one open): the notes, then every task: on the plan (carried over, overdue, due today, taken early, added) or added in the evening, as reported, as now (`dailyState`), stage, status, priority, tags, deadline, and its **Kanban moves that day** (from → to, time).

**Excel and PDF**: the whole report (every line, each followed by its tasks): Excel in the dashboard's Excel look with every column, PDF as a landscape table with the main ones.

**API.** `GET /api/report/daily?from&to&dept&assignee` returns days, the day the tiles describe, `full`, the summary (`dailyCompliance` in packages/shared daily.ts: planned, not planned, wrapped, not wrapped), the people for the Assignee filter, and the lines with their tasks (`routes/dailyReport.ts`; store `range(from, to)`).

**Not planned in the group (2026-10-22).** At the plan check-in (11:30) the same not-planned list is also posted to the daily work update group, each person mentioned so Slack notifies them (`slackNotPlanned`; `"channel": true` in `config/daily-checkins.json`, the channel from Connections). A plan first posted after 11:30 is **Late planned**: tagged in its Slack post, on the Daily update, in this report (Planned at, Excel/PDF) and listed as **Planned late** in the 19:00 check-in.

**Check-ins to the directors (2026-10-17).** A Slack **direct message** from the Nural Pulse bot to each recipient in `config/daily-checkins.json` (Bitrix24 user IDs; since 2026-10-21 only 40 Deepak, switched on; found in Slack by work e-mail) at **11:30** (who has and has not planned their day, with names) and **19:00** (who has and has not wrapped up, who planned without wrapping up, and who did not plan), each with a link to this report (`slackCheckIn`, `dailyCompliance`). Working days only; one send per day and kind, recorded in `app_settings` (`dailyCheckin.<day>.<kind>`), so a restart never sends twice. Scheduled (BullMQ job schedulers, cron in IST) only where the sync worker runs, and only while the file says `"enabled": true` (off until an admin has checked a test). Admins see a **Check-ins to the directors** card on the report: on or off, recipients and times, today's message, and **Send me a test** (to themselves only). API: `GET /api/report/daily/checkin?kind`, `POST /api/report/daily/checkin/test` (admin right). Code: `routes/dailyCheckins.ts`.

