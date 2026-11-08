# Prompt for Claude Code: redesign the "Tasks in hand" planner

> Paste everything below the line into Claude Code (VS Code), from the repo root `D:\TypeScript\nural-dashboard`.
> Start in **plan mode**, approve the plan, then let it build.
> Copy `docs/mockups/tasks-in-hand-planner.html` into the repo first. That is the mockup Mohit approved on 2026-11-08 (also at https://claude.ai/artifact/2NgoMPkp4DPyk51BzmcNjj).

---

## Task

Redesign the **"Tasks in hand: planner"** view, which is used on both the **KPI** tab and the **Development** tab. Do not build a second copy: change the one shared component so both tabs get the new version.

Right now each cell shows the projects a person works on, with a count, plus a separate "Overdue" column. The new planner shows the **actual tasks for each day**, a full history of when each task was planned and moved, and planned vs done progress.

Before you write any code, read these:

1. `CLAUDE.md`, and follow its rules: stages are matched by title, metric logic goes in `packages/shared/src/metrics.ts` with Vitest tests, all Bitrix24 calls go through `bitrix/limiter.ts` and `batch.ts`, dates use `APP_TIMEZONE` (Asia/Kolkata), and the UI uses the Nural tokens from SRS section 6.
2. `docs/SRS.md` sections 3 (Development tab), 5 (metric definitions), 7 (architecture and data model), 12.5 (planned dates, baseline deadline, `deadline_changes`) and 13 (KPI tab, working calendar).
3. `docs/mockups/tasks-in-hand-planner.html`. Open it in a browser. It is the visual and behavioural reference. Match its layout, colours, badges and drawer, but use the real components and tokens instead of its inline CSS. Its sample data and its fixed "today" (Wed 11 Nov 2026) are for the demo only.
4. The existing planner component and its API. Find them with `grep -ri "tasks in hand\|planner" apps packages`. List the files you will change in your plan.

## Words used below

| Term | Meaning |
| --- | --- |
| **Day** | A calendar date in Asia/Kolkata. Working days and holidays follow SRS 13.1 (`config/holidays.json`). Weekends are shown but narrow and greyed. |
| **Open task** | Use the same set the current planner calls open (Pending stage group, SRS 5). Do not invent a new definition. |
| **Done at** | The first time the task left the open set: the earliest of `closed_at` and the first stage event into a stage outside the open set. Store it as `done_at` (computed, not from Bitrix24). |
| **Deadline log** | Every change to a task's deadline: old value, new value, changed at, changed by. |
| **Day plan** | A day when the assignee took the task into their work without changing the deadline. See "Day-plan source" below. |
| **Entry** | One appearance of a task in one day cell. A task can have several entries on different days. |

## Placement rules (the heart of the feature)

**A task appears only on a day it was planned for.** Overdue work is **not** repeated on later days. It stays on the day it was missed, shown in red.

For every task and every day `D`, the planner builds entries like this. Put this logic in `packages/shared/src/planner.ts` as pure functions, so the API and the tests share it.

1. **Current deadline day.** If `D` is the task's current deadline, show a **deadline entry**, with one exception below.
   - Status: `done` if `done_at` ≤ end of `D`. Otherwise `missed` if `D` is before today, `due` if `D` is today, and `planned` if `D` is in the future.
   - Badges:
     - "Nth deadline missed" when the missed count (rule 5) is 1 or more.
     - "Pulled forward from <old day> by <name>" when the last change moved the deadline earlier.
     - "Re-planned from <old day>" when the last change moved it later before the old day arrived.
     - "Not done in day plan <date>" when an earlier day plan was not finished.
   - **Exception (removed from the future):** hide this entry when the task is in **today's** day plan and `D` is after today. Also hide it when the task was finished on an earlier day-plan day. The task shows on its day-plan day instead.
2. **Old deadline days (the log).** For every earlier deadline value `old` that was replaced by a change at time `c`:
   - If `c` is after the end of `old` (the day passed undone): show a struck-through **moved entry** on `old`: "Moved → <new day> by <name>" plus "Nth deadline missed". It counts as planned and not done for that day.
   - If `c` falls on `old` itself (changed during the day): show a struck-through **re-planned entry**: "Re-planned → <new day> the same day". It is shown but **not counted**.
   - If `c` is before `old` started (the day had not arrived yet): **no entry**. The future slot is simply cleared. This covers re-planning later in advance, and the PM pulling the deadline forward.
3. **Day-plan days.** For every day-plan day `P` that is not also a deadline day, show a **day-plan entry** (teal), with the badge "In day plan · deadline <current deadline>". Status: `done` if `done_at` falls on `P` or earlier, `missed` if `P` is before today, `due` if `P` is today. If a day plan from a past day was not finished, the task goes back to its deadline day (rule 1 shows it there again).
4. **Created later.** A task never appears on a day before it was created.
5. **Missed count.** The number of deadline changes made after the previous deadline day had ended. The count only goes up, and the badge travels with the task. Moves made in advance, same-day re-plans and pull-forwards do not add to it.
6. **Who changed it.** Name the person from the deadline log. The mockup shortens it to the first name on the badge and gives the full name in the drawer.

**Cell status (past days and today only, from counted entries):**

- Green: every counted entry is done.
- Yellow: some are done.
- Red: none are done. This applies to today as well, live.
- No colour: the day has no counted entries.
- Future cells have no colour and show "N planned".

**Overdue now.** Each row header shows "N open · M overdue now". M is the count of open tasks whose current deadline has passed. Clicking M opens the drawer with those tasks, sorted by oldest deadline first. Each one shows "Due <day> · Xd overdue".

### Scenarios that must pass (write a Vitest test for each)

All eight use the same week, with today as Wednesday.

| # | Situation | Expected |
| --- | --- | --- |
| 1 | Deadline Tue, done Tue | Tue: green "Done". Nothing elsewhere. |
| 2 | Deadline Tue, not done, deadline unchanged | Tue: red "Not done". Not shown Wed to Fri. Counted in "overdue now". |
| 3 | Deadline Tue, missed; on Wed the PM moves it to Thu | Tue: moved entry, "Moved → Thu by Vijay · 1st deadline missed", counted as not done. Thu: deadline entry "1st deadline missed". |
| 4 | Missed Mon → moved to Tue, missed Tue → moved to Thu | Mon: "1st deadline missed" log. Tue: "2nd deadline missed" log. Thu: "2nd deadline missed". |
| 5 | On Mon, deadline Thu is moved to Fri | Thu: nothing. Fri: "Re-planned from Thu". Missed count 0. |
| 6 | Deadline Fri, assignee takes it into today's (Wed) plan | Wed: teal day-plan entry. Fri: hidden. If done Wed, it stays on Wed only. If not done by the end of Wed, Wed is red and Fri shows it again with "Not done in day plan Wed". |
| 7 | PM changes the deadline from Fri to Wed (today) | Wed: "Pulled forward from Fri by Vijay". Fri: nothing. Missed count 0. |
| 8 | Deadline Tue, changed on Tue to Thu | Tue: re-planned entry, not counted. Thu: deadline entry. Missed count 0. |

Also test these:

- A task done early (before its deadline, with no day plan) shows "Done" on its deadline day.
- Week and month totals count each task once (see below).
- Assignee and Project mode give the same totals for the same filter.

## UI (follow the mockup)

**1. Task titles in Day view.** Each day cell lists entries as `Project → Title` on the Assignee tab, and `Assignee → Title` on the Project tab. Each entry is a card with a coloured left edge and badges:

- green: done
- blue (B500): planned or due today
- teal (T500): day plan
- red: not done that day
- dashed grey and struck through: moved away or re-planned

Sort order: missed, then due or planned, then done, then moved, then re-planned. Clicking a card opens the task drawer.

**2. Past and future periods.** The toolbar gets `‹ <period label> ›` plus a **Today** button.

| View | Columns | Arrows move by |
| --- | --- | --- |
| Day | The 7 days Mon to Sun of the week. Headers read Yesterday / Today / Tomorrow where they apply. | 1 week |
| Week | 6 weeks (4 before the current week, the current week, 1 after) | 6 weeks |
| Month | 6 months (4 before, the current month, 1 after) | 6 months |

Keep the period and view in the URL (nuqs), as the other filters do.

**3. Colours.** Cell status colours as above. Use a tinted background and a 3 px left inset line: green for all done, amber for partly done, red for nothing done. Today's column gets a teal outline and a teal-tinted header. A status pill at the top of the cell reads "All done / Partly done / Nothing done" with `done/planned`.

The Figma file has no green or amber. Use SRS section 6's fallback (Teal T600 for good, `#F59E0B` for warning) unless a success green token exists by now. The mockup's green `#178A4A` is acceptable if the team prefers a real green. Add it as a token, not a literal.

**4. Moves and missed deadlines.** These come from the placement rules. Badges must say who moved the task and where it went.

**5. Planned vs done progress.**

- Every column header shows a bar and "X of Y done · Z%" for all rows in the current filter. Future columns show "Y planned" with an empty bar.
- Every row header shows the same for that person or project, over the visible columns up to today ("X of Y done so far").
- **Week and month cells:** count each task once per period. Planned = tasks with at least one counted entry in the period. Done = tasks with a done entry in the period.
  - The cell lists one line per project (Assignee tab) or per person (Project tab) with `done/planned` and a thin bar.
  - Then chips: "N deadlines missed" (moved entries in the period) and "N pulled forward".
  - The status pill uses only the days up to today, and adds "· N still ahead" for the rest.
  - Clicking the cell opens the drawer with the period's entries grouped by day.

**6. Filters.** The Assignee tab gets a **multi-select Assignee filter**, and the Project tab gets a **multi-select Project filter**. Use the existing Combobox (cmdk + Radix Popover) with search, "Select all" and "Clear". Selected values appear as removable chips under the toolbar, and the button reads "Assignee · All" or "Assignee · 3". Switching tabs swaps which filter is shown and keeps each selection. The free-text search (task, person or project) stays.

**Drawer.**

- **Task drawer:** title, `#id · Project · Assignee`, current deadline, deadlines missed. Then a **Plan log** timeline in date order:
  - created, with the first deadline
  - each deadline change: old → new, when, by whom, and a label (Nth deadline missed / Re-planned before it was due / Pulled forward)
  - each day plan
  - completed (on or before the deadline, or N days late), or still open (N days overdue)

  Then "Shown on the planner", listing every day it appears and why. Add an "Open in Bitrix24" link.
- **Period drawer** (week or month cell) and **overdue drawer**: as described above.

Keep the existing Excel and PDF export. Export one row per **entry**, with columns Day, Entry type, Status, Missed count, Moved to, Moved by, and the existing task columns.

## Data and backend

**New table `task_deadline_events`:** `task_id, old_deadline, new_deadline, changed_at, changed_by`, with an index on `(task_id, changed_at)`.

- **Backfill:** read `tasks.task.history.list` for every task in scope and keep the rows where the field is `DEADLINE`. History is known to work for STAGE (SRS memory, task 41900), so check DEADLINE on a few tasks first and report what you find. Use batch calls through the limiter.
- **Live:** in the sync worker, when a fetched task's `deadline` differs from the stored snapshot, insert a row. `changed_by` is the task's `CHANGED_BY` and `changed_at` is `CHANGED_DATE`.
- Treat the first known deadline as the "created" deadline, at `created_at`.
- This table also feeds the existing `deadline_changes` count in SRS 12.5. Keep them consistent.

**New table `task_day_plans`:** `task_id, user_id, day, source`, unique on `(task_id, day)`.

**Day-plan source (config `DAY_PLAN_SOURCE`, default `stage`):**

- `stage` (default, works with the current read-only webhook): a day plan is recorded for day D when the task **moved into In progress on D** (from `task_stage_events`) while its current deadline was a later day. This is the assignee picking the task up early without touching the deadline.
- `planner` (optional, later): Bitrix24's own "day plan" (`task.planner.getlist`) only returns the plan of the user who owns the token. Our webhook belongs to one user, so it cannot read everyone's plan. This mode would need each user's OAuth token, and sign-in currently does not keep tokens (SRS 7). Leave a stub and a TODO. Do not build it.

**`done_at`:** add the column to `tasks` (or a view), computed as defined above. Backfill it from `task_stage_events` and `closed_at`.

**API:** `GET /api/planner`, taking the existing filter parameters plus:

- `view=day|week|month`
- `start=YYYY-MM-DD` (the first column)
- `groupBy=assignee|project`
- `assignees=1,2,3` / `projects=…`
- `q=`

It returns `columns[]`, `rows[]` (key, name, open, overdueNow, progress), and per cell either `entries[]` (Day) or `{planned, done, plannedToDate, doneToDate, groups[], missedDeadlines, pulledForward}` (Week and Month). It also returns `columnTotals[]`.

- `GET /api/planner/task/:id` returns the plan log and "shown on" days.
- `GET /api/planner/overdue?row=` returns the overdue-now list.
- Live updates: on `task.changed`, invalidate the planner queries that include that task's assignee or project.

**Performance:** a 6-month view for all assignees must answer in under 1.5 s. Compute entries in SQL or in one pass per request over the tasks whose deadlines, deadline events or day plans fall in the window. Do not loop day by day over every task.

## Acceptance checklist

- [ ] All 8 scenarios and the extra cases pass in Vitest (`pnpm test`).
- [ ] The Day view on the KPI tab and the Development tab both show `Project → Title` (Assignee tab) and `Assignee → Title` (Project tab).
- [ ] Overdue tasks are not repeated on later days. "M overdue now" opens the list.
- [ ] Past weeks and months can be browsed. Today returns to the current period, and the URL keeps the state.
- [ ] Cell colours: green, yellow and red as specified. Today is outlined in teal.
- [ ] Moved entries show who moved the task, where it went, and the Nth missed count. Future slots clear when a task is pulled forward, re-planned early or taken into today's plan.
- [ ] Column and row progress bars are correct for Day, Week and Month (each task once per period).
- [ ] Multi-select Assignee and Project filters with chips.
- [ ] Task drawer shows the full plan log.
- [ ] Light and dark mode, keyboard focus visible, and phone width scrolls inside the grid only.
- [ ] No Bitrix24 write calls were added.
- [ ] `docs/SRS.md` gets a new section **"14. Tasks in hand planner"** summarising these rules, the two tables and the endpoint, and CLAUDE.md gets any new command.

## Out of scope

- Changing deadlines or day plans from the dashboard (it stays read-only).
- Reading Bitrix24's personal day planner for every user (the `planner` source).
- Drag-and-drop re-planning.
