// One-line explanations behind the "i" icons (SRS section 5 in plain words). Keep them short.

export const INFO = {
  // Development tiles (DEV-01)
  total:
    'All tasks in the filters for the switch (Dev, Issues or both), Development department only.',
  pending:
    'Still with developers: To do, In progress, On Hold, Pushed to Master, Merged to Development, Pending for QA.',
  ready: 'In the Done stage, ready to go live.',
  deployed: 'In the LIVE stage.',
  overdue: 'Pending, not On Hold, and the deadline has passed.',
  doneToday: 'Reached QA Backlog for the first time today (IST).',
  dueToday: 'Deadline is today (IST), in any stage except LIVE.',

  // Development cards
  assigneeTable:
    'Per person or project. Done = sent to QA (QA Backlog to LIVE). Comp. today = reached QA Backlog today.',
  colTotal: 'All tasks of this row.',
  colPending: 'In a pending stage (To do to Pending for QA).',
  colDone: 'Sent to QA: QA Backlog, In QA, Issue Raised, Done or LIVE.',
  colDueToday: 'Deadline is today, not yet LIVE.',
  colCompToday: 'Reached QA Backlog for the first time today.',
  pendingVsDone: 'Pending vs sent-to-QA tasks per person or project, top 15 by total.',
  ageing: 'Open tasks by days past deadline. On Hold counts here but not as Overdue.',
  ranking:
    'Tasks sent to QA with a deadline. Ranked by on-time %, then average days early. Fewer than 3: not ranked.',
  matrix: 'Tasks per Kanban stage. The red part of a cell is overdue.',
  allTasks: 'Every task in the filters, or the number you clicked.',
  alerts:
    'Overdue tasks, and tasks over 5 days in one stage (LIVE aside). QA stages name the tester or QA lead.',

  // QA tiles (QA-01)
  qaTotal:
    'Tasks tagged bug or feedback, assigned to the Development department (same as the Development tab).',
  qaOpen: 'Issues not in Done or LIVE, so also those waiting in QA. The ring shows the resolved %.',
  qaLastFiled: 'Latest day an issue was created, and how many that day.',
  qaRework:
    'Issues sent back from QA to To do or In progress, or a new issue filed on an issue. % of all issues.',

  // QA cards
  issuesByAssignee: 'Open vs resolved (Done or LIVE), or bug vs feedback, per person or project.',
  issuesByStage: 'Issues per Kanban stage, in board order and colours.',
  testing:
    'Tasks tagged testing or re-testing, or assigned to QA Testing. Late = pending past deadline.',
  retest: 'Issues in QA Backlog or In QA, by who filed them. Oldest = days waiting.',
  issueAge: 'Open issues by days since they were created.',
  rework: 'Reopens per person or project, and the % of their issues that were reworked.',
  latestFiled: 'Issues created on the Last filed date.',
  allIssues: 'Every bug or feedback in the filters, or the number you clicked.',
} as const;
