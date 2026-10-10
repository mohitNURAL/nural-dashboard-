# Nural Dev & QA Dashboard: Software Requirements Specification

Oct 9, 2026 · @Mohit

## 1. Introduction

The dashboard is a React web app with two tabs, **Development** and **QA**, that reads tasks from the Nural Bitrix24 portal (nural.bitrix24.in) and refreshes within seconds when a task changes, using a small backend that holds the Bitrix24 webhooks.

**Purpose.** Give the PM and team leads one live view of where every development task sits on the Kanban, who is late, who is fast, and how many bugs and feedback items QA has raised and how many came back as rework.

**In scope**

- Development tab: summary tiles, assignee-wise table and chart, task ageing and speed ranking, stage x assignee x tag counts, "Due today" and "All tasks" accordions.
- QA tab: issue tiles, testing-team workload, issues waiting for retest, "Last filed" and "All issues" accordions.
- Global filters for project (workgroup), assignee, tag and date range; every dropdown is a type-to-search (contextual) dropdown.
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
- Whatever the switch, the tab only counts work assigned to people in the **Development department** (Software Development tree, read from the company structure). Tasks of QA Testing or other departments are left out, and so is work outside a workgroup.
- Every tile, card, drop-down option and task list on the tab follows the switch. It is kept in the URL (`scope=dev|issues`; All is the default and is left out).

**Drill-down from any count.** Every count on the Development tab opens the "All tasks" accordion (DEV-08) narrowed to exactly that count, and the accordion title takes the count's label, for example "All tasks: Neha Gautam · Pending" or "All tasks: Umang Singh · To do, overdue". This covers the tiles, every number and the totals row of the DEV-02 and DEV-03 tables, the bars of the DEV-02 and DEV-03 charts, and each part of a DEV-05 cell. "Show all tasks" clears it. Clicking a name (not a number) still sets the Assignee or Project filter.

**DEV-01 Summary tiles (one row of 6)**

| # | Tile | Counts |
| --- | --- | --- |
| 1 | Total tasks | All tasks in scope, with a sub-line split by project or by employee when that filter is set |
| 2 | Pending | Tasks in To do, In progress, On Hold, Pushed to Master, Merged to Development or Pending for QA |
| 3 | Ready for deployment | Tasks in Done |
| 4 | Deployed to live | Tasks in LIVE |
| 5 | Overdue | Pending tasks whose deadline has passed (a subset of tile 2, shown in red) |
| 6 | Done today | Tasks completed today (Complete pressed, moved to QA Backlog) |

Clicking a tile opens the "All tasks" accordion pre-filtered to that tile.

Under each tile's number, a breakdown follows the All / Dev / Issues switch (DEV-00a): **All** splits it into Dev and Issues, **Issues** into Bug and Feedback, and **Dev** shows the number alone. The parts add up to the tile, and each part opens its own list, e.g. "All tasks: Pending · Bug". The former "Completed (sent to QA)" tile was removed (2026-10-10) as not relevant to the Development tab; the sent-to-QA stage group still feeds the Done column of DEV-02 and the speed ranking.

**Assignee / Project switch.** The breakdown cards DEV-02, DEV-03 (chart and table), DEV-05, QA-02, QA-04 (table view) and QA-05 each have an Assignee / Project switch in their header. "Assignee" (the default) gives one row or bar per person; "Project" gives one per workgroup, with the same columns and counts. Clicking a row or bar then sets the Assignee or the Project filter. Cards that are about people by nature (DEV-04 speed ranking, QA-06 testing workload, QA-07 retest by creator) have no switch.

**DEV-02 Assignee-wise (or project-wise) table and chart**

- Table: one row per assignee (or project) with Total, Pending, Done, Due today, Completed today. Sortable, sticky header, totals row.
- Chart beside it: horizontal stacked bars per assignee (or project) (Pending vs Done), sorted by Total.
- Clicking a name sets the Assignee (or Project) filter.

**DEV-03 Task ageing**

- Ageing buckets for open (pending) tasks by days past deadline: Not due, 0 to 2, 3 to 7, 8 to 14, 15 to 30, over 30 days, plus No deadline.
- Chart: one stacked bar per assignee (or project), one segment per bucket; above it, the total of each bucket. Table: bucket counts per assignee (or project) with a totals row.
- Every count, bar segment and bucket total opens those tasks (drill-down). On Hold tasks are pending, so they appear in the buckets, but they are not Overdue (open question 6).

**DEV-04 Speed ranking**

- Ranks employees by how early, on average, their tasks reached QA Backlog compared to the deadline (formula in section 5). Shows rank, name, tasks completed, average days early or late, on-time %. Top 3 get a badge.

**DEV-05 Stage x assignee x tag counts**

- A matrix: rows are assignees (or projects), columns are the 11 Kanban stages, each cell is a count; a tag toggle above it splits or filters by tag (new development, client feedback, testing and so on). Heat shading by count.
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
| 1 | Total issues filed | All tasks tagged bug or feedback in the filters (project and assignee) |
| 2 | Open / waiting | Open count with a ring showing Resolved % vs Open % |
| 3 | Last filed | If issues were filed today: "Today" and today's count. Otherwise the most recent filing date and that day's count |
| 4 | Rework issues | Count of issues that count as rework (section 5), with % of all issues |

**QA-02 Issues by assignee**: stacked bars (Open vs Resolved) per developer or per project, plus Bug vs Feedback split.

**QA-03 Issue status by Kanban stage**: count of issues per stage, in board order and board colours.

**QA-04 Age of open issues**: buckets 0 to 2, 3 to 7, 8 to 14, over 14 days since created, per assignee or per project.

**QA-05 Rework by developer**: bar per developer (or per project) with rework count and rework % of their issues.

**QA-06 Testing team workload**

- Tasks tagged testing or re-testing, or assigned to anyone in the QA Testing department.
- Table per tester: Total, Pending, Done, Due today, Overdue, next deadline.

**QA-07 Waiting for retest**

- Issues currently in QA Backlog or In QA: total count, then a table grouped by creator (the tester who filed it), since the creator is who retests it. Columns: creator, count, oldest waiting (days).

**QA-08 Accordion: Latest filed issues** (closed by default)

- Issues filed on the "Last filed" date from QA-01. Columns: Bitrix ID, Title, Type (Bug or Feedback), Assignee, Creator, Priority, Stage, Linked task, Created. Sorted by created date, newest first.

**QA-09 Accordion: All issues** (closed by default)

- Every bug or feedback task in the filters, same columns plus Rework flag and Age. Sorted by created date, newest first. Row click opens the same task drawer as DEV-08, which here also shows the parent task and the reopen history.

## 5. Metric definitions

Every number on the dashboard is computed on the backend from stage names, tags, deadlines and the stage-move log, so the browser and any future report agree. Stages are matched by **title**, not ID, because each workgroup has its own stage IDs (checked: "To do" is 1054 in group 148 and 1088 in Support Tool, group 154) and some boards have no On Hold column.

**Stage groups**

| Group | Stages |
| --- | --- |
| Pending | To do, In progress, On Hold, Pushed to Master, Merged to Development, Pending for QA |
| Sent to QA (completed) | QA Backlog, In QA, Issue Raised, Done, LIVE |
| Ready for deployment | Done |
| Deployed | LIVE |

A task with stage ID 0 (Bitrix24's default for a task never moved on the board) counts as To do.

**Task vs issue**

- Issue = a task tagged `bug` or `feedback` (case-insensitive). Every other task in a development workgroup is a Task.
- An issue is linked to a task when its Parent task is set, or when the task is in its Related tasks. Otherwise it is independent and counts against its assignee.
- The Development tab counts Tasks, Issues or both, by its All / Dev / Issues switch (DEV-00a), for the Development department only. QA tiles count Issues only.

**Formulas**

| Metric | Definition |
| --- | --- |
| Overdue | Stage group = Pending AND deadline < now |
| Due today | Deadline date = today (Asia/Kolkata), any stage group except Deployed |
| Completed / Done today | Entered QA Backlog today (first entry), from the stage-move log; fallback: Bitrix24 closed date = today |
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

**Rework.** An issue counts as rework, charged to its assignee, when either:

1. it moves from QA Backlog, In QA or Issue Raised back to To do or In progress (retest failed and reopened), or
2. a new issue is created whose parent or related task is itself an issue.

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
- Alerts bell (top bar, right): a red badge with the number of alert lines; it opens a panel with two lists, Overdue and Over 5 days in a stage (section 5, Header alerts). Each line shows the count, person, project and stage. Clicking one switches to the Development tab, sets the filter bar to that project and assignee (project only when the alert names a tester or the QA lead, who is not the assignee) with the switch on All, and opens "All tasks" with exactly those tasks, scrolled into view. Each line also has a **Bitrix24** link to that project's task board with the Bitrix24 filter already applied (`apply_filter=Y`): Overdue lines filter by responsible person (`RESPONSIBLE_ID`), Bitrix24's Overdue status (`STATUS[]=-1`) and the pending stages except On Hold (`STAGE_ID[]`), matching the dashboard's Overdue rule; "over 5 days" lines also filter by the Kanban stage (`STAGE_ID[]`, that project's own stage IDs for the stage, plus 0 for To do, Bitrix24's stage for tasks never moved). Tester lines filter by creator (`CREATED_BY`) and QA lead lines by stage only. Bitrix24's filter has no "days in this stage" field (the stage-entry date exists only in the dashboard's stage-move log), so for "over 5 days" lines the Bitrix24 board lists every task in that stage, including ones that entered it in the last 5 days. The alert then shows both numbers, e.g. "479 over 5 days · 508 in Done in Bitrix24 (any age)", and the button reads "Bitrix24 · 508"; the dashboard's own list (clicking the alert) is the exact set, each task ID linking to Bitrix24. The work is fixed there; the alert then clears by itself on the next sync (the dashboard stays read-only).
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
| Live push | Server-Sent Events | One-way server to browser, auto-reconnect, works through Nginx |
| Auth | Sign in with Bitrix24 (OAuth local app) | Users log in with their portal account; role comes from department |
| Hosting | Docker Compose on one Linux VM, Nginx with Let's Encrypt TLS | Bitrix24 outbound webhooks need a public HTTPS URL |
| Monitoring | Pino logs, Uptime Kuma or similar health check on /health | Alerts when sync stops |

SSE is chosen over WebSocket because the browser only receives; filters are sent as normal HTTP requests. Socket.IO can replace it later if two-way features are added.

**Backend modules**

1. **Webhook receiver** `POST /hooks/bitrix`: checks the application token, puts the event on the queue, returns 200 at once.
2. **Sync worker**: takes events, fetches the full task through the inbound webhook (batched), compares with the stored snapshot, writes the stage-move log, and publishes a change message.
3. **Reconciler**: every 10 minutes, pulls tasks changed since the last run, to recover any missed webhook. Nightly full resync of open tasks.
4. **Directory sync**: hourly, users, departments and workgroups, and the stage list of each workgroup.
5. **Metrics API**: `GET /api/dev/summary`, `/api/dev/assignees`, `/api/dev/ranking`, `/api/dev/matrix`, `/api/tasks`, `/api/qa/summary`, `/api/qa/issues`, `/api/qa/testing`, `/api/filters/options`, all taking the same filter parameters. `/api/dev/assignees`, `/api/dev/matrix` and `/api/qa/issues` also take `groupBy=assignee|project` for the Assignee / Project switch. The Development endpoints, `/api/filters/options?tab=dev` and `/api/tasks?kind=tasks` take `scope=all|dev|issues` (API default `dev`). `/api/tasks` also takes `stage`, `overdue=true|false` and `ageing=<bucket>` for drill-downs. `/api/dev/summary` returns `parts`, the tile breakdown for the switch. `GET /api/alerts` returns the header alerts (with each line's filtered `boardUrl`, and for stuck lines `boardCount`, what that Bitrix24 board will list); `/api/tasks` takes `stuck=true` and `owner=<user id>` (the alert's person) to open an alert's tasks.
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

## 8. Bitrix24 integration

Two webhooks are created in the portal by an administrator: an **inbound** webhook the backend calls to read data, and an **outbound** webhook Bitrix24 calls when a task changes. Both secrets live only in the backend's environment file.

**8.1 Inbound webhook (read)**

- Created in Bitrix24: Developer resources > Other > Inbound webhook. Permissions: `task`, `user`, `department`, `sonet_group` (workgroups). Read-only use; the dashboard never writes.
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
- Stage moves before go-live are rebuilt once from `tasks.task.history.list`. If history does not record stage moves on this portal, rework and speed ranking start counting from go-live (open question 4).

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
| NFR-9 | Availability | Health endpoint; alert if no webhook received for 2 working hours or reconcile fails twice |
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
PUBLIC_BASE_URL=
PORT=4000
WEB_ORIGIN=http://localhost:5173
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
9. **Sign-in, deploy and launch.** Prompt: "Add Sign in with Bitrix24 (OAuth local app) and roles from SRS NFR-4, Dockerfiles for api and web, Nginx with Let's Encrypt, and a health alert per NFR-9." Deploy to the VM, point the outbound webhook at the production URL, and run the acceptance tests below. Run beside the Bitrix24 board for one week, then go live.

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
