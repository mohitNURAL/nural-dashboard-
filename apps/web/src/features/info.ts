// One-line explanations behind the "i" icons (SRS section 5 in plain words). Keep them short.

export const INFO = {
  // Development tiles (DEV-01)
  total:
    'All tasks in the filters for the switch (Dev, Issues or both), Development department only.',
  pending:
    'Behind QA Backlog and not on hold: To do, In progress, Pushed to Master, Merged to Development, Pending for QA, Issue Raised.',
  hold: 'In On Hold: neither pending nor completed. Pending + completed + on hold = total.',
  ready: 'In the Done stage, ready to go live.',
  deployed: 'In the LIVE stage.',
  overdue: 'Pending, not On Hold, and the deadline has passed.',
  inHand:
    'Pending tasks (behind QA Backlog, not on hold) whose deadline is still ahead (IST). Under it, when they are planned: tomorrow, the rest of this week, the rest of this month, next week, next month. The parts overlap (tomorrow is also in the rest of the week), so they do not add up. Overdue and no-deadline tasks are not in hand.',
  spill:
    'Spill: the deadline was in the previous day, week or month (IST, weeks Monday to Sunday) and the task was not pushed to QA Backlog by its end (still pending or on hold, or completed later).',
  donePrev:
    'Pushed to QA Backlog in the previous day, week or month (IST, weeks Monday to Sunday).',
  overduePeriod:
    'Pending, not on hold, the deadline has passed and it fell in the current day, week or month (IST).',
  devProjects:
    'Projects with open tasks or recent activity (Development tab scope and filters) = Active + Silent. Active: a task changed or moved in the last 20 days. Silent: open tasks but no activity for 20 days. Click for Projects at work, most active this week first, then the earliest deadline: open a project for who works on it. Its Day / Week / Month switch sets Done (previous period), Overdue (this period) and Spill (previous period).',
  inHandBy:
    'Pending tasks with the deadline ahead, per assignee or project. The chart shows the window picked above it (All, Tomorrow, Rest of week, Rest of month, Next week, Next month); the table shows every window. A bar or count opens those tasks; a name sets the filter.',
  qaInHandBy:
    "The testing team's pending tasks with the deadline ahead, per assignee or project. The chart shows the window picked above it; the table shows every window. A bar or count opens those tasks; a name sets the filter.",
  qaInHand:
    "The QA Testing team's pending testing tasks whose deadline is still ahead (IST), by when they are planned: tomorrow, the rest of this week, the rest of this month, next week, next month. The parts overlap, so they do not add up.",
  doneToday: 'Reached QA Backlog for the first time today (IST).',
  dueToday: 'Deadline is today (IST), in any stage except LIVE.',

  // Development cards
  assigneeTable:
    'Per person or project. Done = sent to QA (QA Backlog to LIVE). Comp. today = reached QA Backlog today.',
  colTotal: 'All tasks of this row.',
  colPending: 'Pending: any stage behind QA Backlog except On Hold, Issue Raised included.',
  colDone: 'Completed: in QA Backlog, In QA, Done or LIVE.',
  colDueToday: 'Deadline is today, not yet LIVE.',
  colCompToday: 'Reached QA Backlog for the first time today.',
  colCompYesterday: 'Reached QA Backlog for the first time yesterday (IST).',
  pendingVsDone:
    'Pending vs completed (QA Backlog, In QA, Done, LIVE) per person or project, top 15 by total. Tooltip splits Dev / Issues (Bug / Feedback on Issues).',
  ageing: 'Open tasks by days past deadline. On Hold counts here but not as Overdue.',
  ranking:
    'Tasks sent to QA with a deadline. Ranked by on-time %, then average days early. Fewer than 3: not ranked.',
  matrix:
    'Tasks per Kanban stage; the colour bar shows each stage total. The red part of a cell is overdue.',
  allTasks: 'Every task in the filters, or the number you clicked.',
  alerts:
    'Overdue tasks, and tasks over 5 days in one stage (LIVE aside). QA stages name the tester or QA lead.',

  // QA tiles (QA-01)
  qaTotal: 'Every task tagged bug or feedback in the filters, whoever it is assigned to.',
  qaOpen:
    'Open = pending: any stage behind QA Backlog except On Hold (Issue Raised included). Resolved = QA Backlog, In QA, Done or LIVE. On Hold is its own tile. The ring shows the resolved %.',
  qaLastFiled: 'Latest day an issue was created, and how many that day.',
  qaLastResolved:
    'Latest day issues were pushed to QA Backlog (a fix handed to QA), and how many that day.',
  qaRework:
    'Issues QA sent back after testing: from QA Backlog, In QA or Done to Issue Raised, To do or In progress. Stage flow only.',

  // QA cards
  issuesByAssignee:
    'Open vs resolved, each split into bug and feedback (or the reverse), per person or project. Table: the assignee-wise table.',
  issuesByStage:
    'Issues per stage and person (or project). Red = overdue part. Bug / Feedback narrows it.',
  testing:
    'Tasks tagged testing or re-testing, or assigned to QA Testing. Late = pending past deadline.',
  retest: 'Issues in QA Backlog or In QA, by who filed them. Oldest = days waiting.',
  issueAge: 'Open issues by days past deadline (same as task ageing). On Hold counts here.',
  rework:
    'QA send-backs per person or project, split into bug and feedback, and the % of their issues sent back. First Issue Raised to To do is not counted.',
  issueTrend:
    'Last 7 days (IST): bugs and feedback filed (created, light) and resolved (pushed to QA Backlog that day, dark). Pick one assignee or project, or see all.',
  latestFiled: 'Issues created on the Last filed date.',
  retestAwaited:
    'Every task waiting for QA: in QA Backlog or In QA, split into dev tasks and issues (bug or feedback).',
  retestByGroup:
    'Tasks and issues in QA Backlog and In QA per assignee or project. Every number opens its tasks.',
  latestResolved: 'Issues pushed to QA Backlog on the Last resolved date.',
  allIssues: 'Every bug or feedback in the filters, or the number you clicked.',
} as const;
