// The menu as modules and pages, and the right behind each (2026-10-12, SRS 7). One definition
// for the side menu (apps/web nav.tsx), the Access permissions screen and the server's checks,
// so a new page shows up on the Access screen by itself.
//
// Each page has its own right (on or off). Some pages carry further permissions under them:
// Development holds the data scope and what may be edited (they apply to every task page),
// Support its feedback inbox, Help › Feedback the feedback inbox for Help.
// Finance is not here: it is for admins only, always, and cannot be granted.

export type PageRight =
  | 'kpi'
  | 'dev'
  | 'qa'
  | 'support'
  | 'insights'
  | 'workflow'
  | 'projectTypes'
  | 'org'
  | 'people'
  | 'admin'
  | 'connections'
  | 'mailing'
  | 'helpFeedback'
  | 'helpDocs'
  | 'helpFaq';

export type ExtraRight = 'scope' | 'edit' | 'inbox' | 'helpInbox';

export interface PermissionDef {
  key: ExtraRight;
  label: string;
  hint: string;
  /** Names of the two values: [on, off]. */
  values: [string, string];
}

export interface PageDef {
  /** The page (tab) id. */
  id: string;
  label: string;
  hint: string;
  right: PageRight;
  permissions?: PermissionDef[];
}

export interface ModuleDef {
  label: string;
  pages: PageDef[];
}

export const MODULES: ModuleDef[] = [
  {
    label: 'Dashboard',
    pages: [
      { id: 'kpi', label: 'KPI', hint: 'Management overview', right: 'kpi' },
      {
        id: 'dev',
        label: 'Development',
        hint: 'Tasks, issues, deadlines',
        right: 'dev',
        permissions: [
          {
            key: 'scope',
            label: 'Data',
            hint: 'Every project and person, or only tasks assigned to or created by them (all task pages)',
            values: ['All data', 'Own tasks'],
          },
          {
            key: 'edit',
            label: 'Edit tasks',
            hint: 'Every task field, or only stage, status and tags (all task pages)',
            values: ['All fields', 'Stage, status, tags'],
          },
        ],
      },
      { id: 'qa', label: 'QA', hint: 'Bugs, feedback, retesting', right: 'qa' },
      {
        id: 'support',
        label: 'Support',
        hint: 'Feedback for the Support tab',
        right: 'support',
        permissions: [
          {
            key: 'inbox',
            label: 'Support inbox',
            hint: 'Read the Support feedback answers',
            values: ['Allowed', 'Not allowed'],
          },
        ],
      },
    ],
  },
  {
    label: 'Insights',
    pages: [
      { id: 'insights', label: 'Insights', hint: 'What is holding us back', right: 'insights' },
    ],
  },
  {
    label: 'Projects',
    pages: [
      {
        id: 'workflow',
        label: 'Workflow',
        hint: 'How tasks move to LIVE, who does what',
        right: 'workflow',
      },
      {
        id: 'projecttypes',
        label: 'Project types',
        hint: 'Projects by their Kanban stages',
        right: 'projectTypes',
      },
    ],
  },
  {
    label: 'Employees',
    pages: [
      { id: 'org', label: 'Company tree', hint: 'Departments, heads and teams', right: 'org' },
      {
        id: 'people',
        label: 'People directory',
        hint: 'Who has access, who is active',
        right: 'people',
      },
      {
        id: 'access',
        label: 'Access permissions',
        hint: 'Rights per person or department',
        right: 'admin',
      },
    ],
  },
  {
    label: 'Integration',
    pages: [
      {
        id: 'connections',
        label: 'Connections',
        hint: 'Microsoft 365, Slack, Infowan',
        right: 'connections',
      },
      { id: 'mailing', label: 'Mailing', hint: 'Reports by mail and Slack', right: 'mailing' },
    ],
  },
  {
    label: 'Help',
    pages: [
      {
        id: 'feedback',
        label: 'Feedback',
        hint: 'Tell us about an issue or idea',
        right: 'helpFeedback',
        permissions: [
          {
            key: 'helpInbox',
            label: 'Feedback inbox',
            hint: 'Read everyone’s feedback and its attachments',
            values: ['Allowed', 'Not allowed'],
          },
        ],
      },
      { id: 'docs', label: 'Documents', hint: 'PDF guides to download', right: 'helpDocs' },
      { id: 'faq', label: 'FAQs', hint: 'Answers to common questions', right: 'helpFaq' },
    ],
  },
];

/** Every page right, in menu order. */
export const PAGE_RIGHTS: PageRight[] = MODULES.flatMap((m) => m.pages.map((p) => p.right));
