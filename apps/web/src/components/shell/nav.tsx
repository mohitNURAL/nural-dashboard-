// What the side drawer offers: the dashboard tabs and the Employee module, each shown only to
// those with the right (the server enforces the same rights).
import type { ReactNode } from 'react';
import type { Me } from '../../api/me';
import type { Tab } from '../../features/filters/toParams';
import {
  IconDev,
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
        allowed: () => true,
      },
      {
        id: 'qa',
        label: 'QA',
        hint: 'Bugs, feedback, retesting',
        icon: <IconQa />,
        allowed: () => true,
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
    label: 'Insights',
    icon: <IconInsights />,
    items: [
      {
        id: 'insights',
        label: 'Insights',
        hint: 'What is holding us back',
        icon: <IconInsights />,
        // Everyone: members see their own work, managers the company (the data is scoped).
        allowed: () => true,
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
        allowed: (me) => !!me.employees,
      },
      {
        id: 'people',
        label: 'People directory',
        hint: 'Who has access, who is active',
        icon: <IconPeople />,
        allowed: (me) => !!me.employees,
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
        allowed: (me) => me.admin,
      },
      {
        id: 'mailing',
        label: 'Mailing',
        hint: 'Reports by mail and Slack',
        icon: <IconMail />,
        allowed: (me) => me.admin,
      },
    ],
  },
];

/** The groups and pages this person may open. */
export function navFor(me: Me | undefined): NavGroup[] {
  if (!me) return [];
  return ALL.map((g) => ({
    label: g.label,
    icon: g.icon,
    items: g.items.filter((i) => i.allowed(me)),
  })).filter((g) => g.items.length);
}

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
