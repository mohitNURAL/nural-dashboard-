// What the side drawer offers: the menu modules and their pages, each shown only to those with
// that page's right (packages/shared modules.ts; the server enforces the same rights).
import type { ReactNode } from 'react';
import type { Me } from '../../api/me';
import type { Tab } from '../../features/filters/toParams';
import {
  IconBook,
  IconCoin,
  IconDaily,
  IconDev,
  IconFeedback,
  IconFlow,
  IconLayers,
  IconHelp,
  IconGrid,
  IconInsights,
  IconKpi,
  IconMail,
  IconPlug,
  IconPeople,
  IconQa,
  IconShield,
  IconSupport,
  IconTree,
} from '../ui/icons';

export interface NavItem {
  id: Tab;
  label: string;
  hint: string;
  icon: ReactNode;
}

/** A menu module: its pages (submodules) are shown under it. */
export interface NavGroup {
  label: string;
  icon: ReactNode;
  items: NavItem[];
}

const ALL: {
  label: string;
  icon: ReactNode;
  items: (NavItem & { allowed: (me: Me) => boolean })[];
}[] = [
  {
    label: 'Dashboard',
    icon: <IconGrid />,
    items: [
      {
        id: 'kpi',
        label: 'KPI',
        hint: 'Management overview',
        icon: <IconKpi />,
        allowed: (me) => me.kpi ?? me.full,
      },
      {
        id: 'dev',
        label: 'Development',
        hint: 'Tasks, issues, deadlines',
        icon: <IconDev />,
        allowed: (me) => me.dev !== false,
      },
      {
        id: 'qa',
        label: 'QA',
        hint: 'Bugs, feedback, retesting',
        icon: <IconQa />,
        allowed: (me) => me.qa !== false,
      },
      {
        id: 'support',
        label: 'Support',
        hint: 'Feedback for the Support tab',
        icon: <IconSupport />,
        allowed: (me) => me.support,
      },
    ],
  },
  {
    label: 'My work',
    icon: <IconDaily />,
    items: [
      {
        id: 'daily',
        label: 'Daily update',
        hint: 'Plan the day, wrap it up, post to Slack',
        icon: <IconDaily />,
        allowed: (me) => me.dailyUpdate !== false,
      },
    ],
  },
  {
    label: 'Report',
    icon: <IconBook />,
    items: [
      {
        id: 'dailyreport',
        label: 'Daily task update',
        hint: 'Who planned and wrapped up, planned vs done',
        icon: <IconDaily />,
        allowed: (me) => me.dailyReport !== false,
      },
    ],
  },
  {
    label: 'Insights',
    icon: <IconInsights />,
    items: [
      {
        id: 'insights',
        label: 'Insights',
        hint: 'What is holding us back',
        icon: <IconInsights />,
        allowed: (me) => me.insights !== false,
      },
    ],
  },
  {
    label: 'Projects',
    icon: <IconFlow />,
    items: [
      {
        id: 'workflow',
        label: 'Workflow',
        hint: 'How tasks move to LIVE, who does what',
        icon: <IconFlow />,
        allowed: (me) => me.workflow !== false,
      },
      {
        id: 'projecttypes',
        label: 'Project types',
        hint: 'Projects by their Kanban stages',
        icon: <IconLayers />,
        allowed: (me) => me.projectTypes !== false,
      },
    ],
  },
  {
    label: 'Employees',
    icon: <IconPeople />,
    items: [
      {
        id: 'org',
        label: 'Company tree',
        hint: 'Departments, heads and teams',
        icon: <IconTree />,
        allowed: (me) => me.org ?? !!me.employees,
      },
      {
        id: 'people',
        label: 'People directory',
        hint: 'Who has access, who is active',
        icon: <IconPeople />,
        allowed: (me) => me.people ?? !!me.employees,
      },
      {
        id: 'access',
        label: 'Access permissions',
        hint: 'Rights per person or department',
        icon: <IconShield />,
        allowed: (me) => me.admin,
      },
    ],
  },
  {
    label: 'Integration',
    icon: <IconPlug />,
    items: [
      {
        id: 'connections',
        label: 'Connections',
        hint: 'Microsoft 365, Slack, Infowan',
        icon: <IconPlug />,
        allowed: (me) => me.connections ?? me.admin,
      },
      {
        id: 'mailing',
        label: 'Mailing',
        hint: 'Reports by mail and Slack',
        icon: <IconMail />,
        allowed: (me) => me.mailing ?? me.admin,
      },
    ],
  },
  {
    label: 'Finance',
    icon: <IconCoin />,
    items: [
      {
        id: 'finance',
        label: 'Cost to company',
        hint: 'Coming soon: tell us what you need',
        icon: <IconCoin />,
        // Admins only, always: not grantable on the Access screen.
        allowed: (me) => me.admin,
      },
    ],
  },
  {
    label: 'Help',
    icon: <IconHelp />,
    items: [
      {
        id: 'feedback',
        label: 'Feedback',
        hint: 'Tell us about an issue or idea',
        icon: <IconFeedback />,
        allowed: (me) => me.helpFeedback !== false,
      },
      {
        id: 'docs',
        label: 'Documents',
        hint: 'PDF guides to download',
        icon: <IconBook />,
        allowed: (me) => me.helpDocs !== false,
      },
      {
        id: 'faq',
        label: 'FAQs',
        hint: 'Answers to common questions',
        icon: <IconHelp />,
        allowed: (me) => me.helpFaq !== false,
      },
    ],
  },
];

/** The groups and pages this person may open. Help is last by default (2026-10-12). */
export function navFor(me: Me | undefined): NavGroup[] {
  if (!me) return [];
  return ALL.map((g) => ({
    label: g.label,
    icon: g.icon,
    items: g.items.filter((i) => i.allowed(me)),
  })).filter((g) => g.items.length);
}

/** The first page this person may open (where a page they may not open sends them). */
export const firstPage = (me: Me | undefined): Tab => navFor(me)[0]?.items[0]?.id ?? 'dev';

/** May this person open the page? */
export const allowedPage = (me: Me | undefined, tab: Tab) =>
  navFor(me).some((g) => g.items.some((i) => i.id === tab));

/** The module a page belongs to. */
export const moduleOf = (tab: Tab) => ALL.find((g) => g.items.some((i) => i.id === tab))?.label;

/** "Dashboard › QA". */
export function crumbs(tab: Tab): [string, string] {
  for (const g of ALL) {
    const item = g.items.find((i) => i.id === tab);
    if (item) return [g.label, item.label];
  }
  return ['Dashboard', tab];
}
