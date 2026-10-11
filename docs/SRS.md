# Nural Dev & QA Dashboard: Software Requirements Specification

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

**DEV-01 Summary tiles (one row of 6)**

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
- Stat tile: label, big number, sub-line (delta or split), optional status colour; clickable.
- Card: title, optional toggle (table or chart), body, empty state and loading skeleton.
- Data table: sticky header, sort arrows, pagination, row hover, stage chip, tag chips, priority badge (High red, Normal grey, Low blue), overdue text in `--bad`.
- Accordion: header with count badge, closed by default.
- Task drawer: right side panel, 480 px, with stage timeline and "Open in Bitrix24" button.
- Toast: "Task 41580 moved to In QA" when a live update lands (can be turned off).

**Layout**

The wireframes below show the order of cards on each tab at 1440 px. On screens under 1024 px, cards stack in one column and tiles wrap to two rows.

![Development tab wireframe](images/wireframe-development.png)

Grey blocks stand for live numbers; Overdue is the only tile with a status border. The wireframe still shows the "Sent to QA" tile, which was removed (see DEV-01). The same top bar and filter bar sit on the QA tab.

![QA tab wireframe](images/wireframe-qa.png)

The QA tab swaps the Tag filter for a Bug or Feedback filter and puts Rework in the only tile with a status border.

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
| Hosting | Docker Compose on one Hetzner Cloud CX22 server (Ubuntu 24.04, 2 vCPU, 4 GB, billed hourly, about €4.50 a month; chosen 2026-10-10 because Oracle sign-up failed), Caddy with automatic Let's Encrypt TLS, address `<ip>.sslip.io` | Bitrix24 outbound webhooks need a public HTTPS URL; Caddy renews certificates itself (replaces Nginx + certbot) |
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
- The session is a signed cookie (HMAC-SHA256 with `SESSION_SECRET`): HttpOnly, SameSite=Lax, Secure on HTTPS, valid 7 days, holding the user ID and name. There is no session table, and changing `SESSION_SECRET` signs everyone out.
- With sign-in on, every `/api` call other than `/api/auth/*` needs the session, or it gets 401 and the web app goes to sign-in. `/health` and `/hooks/bitrix` (checked by its application token) stay open.
- `GET /api/auth/me` returns the signed-in name, shown in the top bar with a **Sign out** button (`POST /api/auth/logout`). Sign out ends on a "You are signed out" page (`GET /api/auth/signed-out`) with **Sign in with Bitrix24**; it does not go straight back to Bitrix24, which would sign a person who is still logged in to Bitrix24 straight back in. On a local copy (sign-in off) the top bar says so.

**Task actions (2026-10-11)**

Every task list (grid) and the task view have two dropdowns, so a task can be changed without leaving the dashboard:

| Dropdown | Choices | Bitrix24 call |
| --- | --- | --- |
| Move to (Kanban column) | The columns of the task's own board, in board order (none for a task outside a workgroup) | `task.stages.movetask` |
| Bitrix24 status | Pending, In progress, Deferred, Completed | Bitrix24's own actions, as its buttons: Completed → `tasks.task.complete`; Deferred → `tasks.task.defer`; In progress → `tasks.task.start`; Pending → `tasks.task.pause` (from In progress) or `tasks.task.renew` (from a closed or deferred task). A completed or deferred task is renewed first where Bitrix24 needs it. Completed asks for confirmation. |

- **As the person.** Actions run with the signed-in person's own Bitrix24 OAuth token, so Bitrix24 history shows their name and their Bitrix24 permissions apply; a refusal (e.g. no access to the project) is shown to them as Bitrix24's message.
- The tokens are kept from sign-in, encrypted (AES-256-GCM, key from `SESSION_SECRET`) in `user_tokens`, and renewed with the refresh token. They are never logged or sent to the browser. With sign-in off (`AUTH=off`, local development) the dropdowns are shown but disabled.
- **The local app needs the Tasks permission** (scope `task`) besides `user`; after the admin adds it, everyone signs in once more. The dashboard does not judge the token's scope label (portals report it differently, e.g. just `app`); Bitrix24 decides, and its `insufficient_scope` answer is shown as "missing the Tasks permission".
- **Guard rails.** The webhook stays read-only (`READ_METHODS`). Task actions are a separate allowlist (`USER_ACTION_METHODS`: the six methods above) and run only with a person's token, through the same rate limiter. A column must belong to the task's board.
- **Audit.** Every action is recorded in `task_actions`: person, task, move or status, from, to, and whether Bitrix24 accepted it (with its error).
- After an action the task is re-synced (same queue as webhook events), so every open dashboard shows the change within seconds.
- API: `POST /api/tasks/:id/stage {stageId}`, `POST /api/tasks/:id/status {status: pending|inProgress|deferred|completed}`. Task rows carry `stageId` and `bitrixStatus`; `/api/tasks` returns the `boards` of its rows, `/api/tasks/:id` the task's `board`.
- The dashboard's own Status (Completed / Pending / On hold, section 5) follows the Kanban column, not the Bitrix24 status.

**Deployment (milestone 9)**

- `docker-compose.prod.yml` (project `nural-prod`) runs `postgres`, `redis`, `api` and `web` with no database or Redis port exposed.
- `api` is `apps/api/Dockerfile`: it applies migrations at start, then serves through tsx.
- `web` is `apps/web/Dockerfile`, which builds Vite into a Caddy image. Caddy (`deploy/Caddyfile`) serves the app, proxies `/api`, `/hooks` and `/health` to the API (SSE unbuffered), sets security headers, and gets the certificate for `SITE_ADDRESS`.
- Extra Caddy config can be dropped on the server in `~/nural/caddy-extra/*.caddy`, for example an interim shared password.
- `scripts/vm-setup.sh` prepares a fresh Ubuntu server: Docker, ports 80 and 443 (Oracle iptables or ufw, where present), and swap.
- `scripts/deploy.sh` ships the committed code (`git archive`) and `.env.prod` (as the server's `.env`) over SSH, then rebuilds and restarts.
- `scripts/db-copy.sh` copies the local database to the server once.

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
| NFR-4 | Access | PM and admins see everything; team leads default to their department; developers see their own rows (open question 7) |
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
   1. In Hetzner Cloud, create a CX22 server with Ubuntu 24.04, public IPv4 and the deploy SSH key. Oracle Cloud Always Free also works: open TCP 80 and 443 in its security list, and `vm-setup.sh` opens them in its iptables.
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
| 10 | Where will it be hosted? | One company Linux VM with a public HTTPS domain |
| 11 | Ranking: minimum tasks to be ranked, and should late completions lower the rank more than early ones raise it? | At least 3 completed tasks; plain average days early or late |

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
| Department of a task | The assignee's department, from `config/departments.json`: Development (Software Development and its sub-departments), QA (QA Testing), Support (Tech Support), else Other |
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
| Active projects | Active projects | Silent projects, clickable |
| No deadline | Open tasks without a deadline | — |

**KPI-09 Insights** (first card): up to six findings from the same numbers, each opening its tasks:
- who holds the biggest share of open work;
- the project holding most of the overdue work;
- tasks over 30 days late;
- tasks In progress for over 2 working days;
- the share of open tasks without a deadline;
- silent projects.

**KPI-02 Project health (table)**: one row per project, worst first.
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
- Who sees it: everyone who signs in, for now. Roles (NFR-4) come later.
