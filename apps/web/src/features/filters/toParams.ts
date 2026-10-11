// URL filter state -> API query params. The URL uses the API's own parameter names so a
// shared link and the request it makes read the same.
/** Every page: the dashboard tabs, then the Employee module (side drawer, 2026-10-11). */
export type Tab =
  | 'kpi'
  | 'dev'
  | 'qa'
  | 'support'
  | 'insights'
  | 'org'
  | 'people'
  | 'access'
  | 'connections'
  | 'mailing';
export const DASHBOARD_TABS = ['kpi', 'dev', 'qa', 'support'] as const;
export const isDashboardTab = (t: Tab): t is (typeof DASHBOARD_TABS)[number] =>
  (DASHBOARD_TABS as readonly string[]).includes(t);
export type IssueTypeFilter = 'bug' | 'feedback';
export type DateField = 'created' | 'deadline';

export interface FilterState {
  project: number[];
  assignee: number[];
  tag: string[];
  type: IssueTypeFilter | null;
  dateField: DateField | null;
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTERS: FilterState = {
  project: [],
  assignee: [],
  tag: [],
  type: null,
  dateField: null,
  from: null,
  to: null,
};

/** The facet only one tab shows (SRS 6: QA swaps Tag for Bug or Feedback; KPI has neither). */
export const tabOnlyFacet: Record<Tab, 'tag' | 'type' | null> = {
  kpi: null,
  dev: 'tag',
  qa: 'type',
  support: null,
  insights: null,
  org: null,
  people: null,
  access: null,
  connections: null,
  mailing: null,
};

/** Query params for a metrics request; empty filters are left out, lists sorted for stable keys. */
export function toParams(tab: Tab, f: FilterState): Record<string, string> {
  const p: Record<string, string> = {};
  const nums = (a: number[]) => [...a].sort((x, y) => x - y).join(',');
  if (f.project.length) p.project = nums(f.project);
  if (f.assignee.length) p.assignee = nums(f.assignee);
  if (tab === 'dev' && f.tag.length) p.tag = [...f.tag].sort().join(',');
  if (tab === 'qa' && f.type) p.type = f.type;
  if (f.from || f.to) {
    p.dateField = f.dateField ?? 'created';
    if (f.from) p.from = f.from;
    if (f.to) p.to = f.to;
  }
  return p;
}

export const hasFilters = (tab: Tab, f: FilterState) => Object.keys(toParams(tab, f)).length > 0;
