// "i" texts of the KPI tab (SRS 13): the rule behind every number, in one line each.
export const KPI_INFO = {
  tab: 'Every task in every project, all departments. A task is closed when it first reaches QA Backlog (or, without QA stages, when Bitrix24 closes it).',
  open: 'Tasks not closed yet. Department = the assignee’s department.',
  overdue: 'Open tasks whose deadline has passed. "Over 30 days" = more than 30 days late.',
  closed:
    'Tasks closed in the period (first QA Backlog, else the Bitrix24 closed date). Clean-ups of 30+ tasks closed in one project on one day are left out.',
  onTime:
    'Of the tasks closed in the period that had a deadline, the share closed on or before it.',
  active:
    'Projects with open tasks and any action (task change or comment) in the last 30 days. Silent = open tasks and no action for 10+ working days.',
  noDeadline: 'Open tasks without a deadline: they cannot be overdue or planned.',
  projects:
    'One row per project, worst first. Red: over 25 % of open tasks overdue (at least 3), or a task over 30 days late. Amber: any overdue task, or silent. Green: neither.',
  overdue2: 'Open tasks past their deadline, by how many days late, per project and per person.',
  workload:
    'Open project tasks per person: overdue, due in the next 10 working days, due later, no deadline.',
  people:
    'Per person: tasks closed in the period (vs the one before), on-time %, open and overdue now, QA send-backs on closed tasks, and closed tasks over the last 8 periods.',
  activity:
    'Busiest projects of the last 7 days: new tasks, bugs raised, stage moves and comments (ranked by new×2 + bugs×3 + moves + comments). Silent projects below.',
  insights: 'Findings worked out from the same numbers. Click one to see its tasks.',
  workingTime: 'Working time: Monday to Friday, 09:30 to 18:30 IST, public holidays excluded.',
} as const;
