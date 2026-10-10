// Filter and tab state kept in the URL (DEV-00: a filtered view can be shared as a link).
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import { useCallback, useMemo } from 'react';
import type { DevScope } from '@nural/shared';
import { useFilterOptions } from '../../api/queries';
import { filterSummary } from './summary';
import { EMPTY_FILTERS, tabOnlyFacet, type FilterState, type Tab } from './toParams';

const filterParsers = {
  project: parseAsArrayOf(parseAsInteger).withDefault([]),
  assignee: parseAsArrayOf(parseAsInteger).withDefault([]),
  tag: parseAsArrayOf(parseAsString).withDefault([]),
  type: parseAsStringLiteral(['bug', 'feedback'] as const),
  dateField: parseAsStringLiteral(['created', 'deadline'] as const),
  from: parseAsString,
  to: parseAsString,
};

// KPI is the first tab and the default (SRS 13); its URL has no `tab`.
const tabParser = parseAsStringLiteral(['kpi', 'dev', 'qa'] as const).withDefault('kpi');

export function useTab() {
  const [tab, setTabRaw] = useQueryState('tab', tabParser);
  const [, setFilters] = useQueryStates(filterParsers);
  const setTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      // Drop the facet only the current tab shows, so a hidden filter never narrows the view.
      const facet = tabOnlyFacet[tab];
      if (facet) void setFilters({ [facet]: null });
      void setTabRaw(next === 'kpi' ? null : next);
    },
    [tab, setFilters, setTabRaw],
  );
  return [tab, setTab] as const;
}

export function useFilters() {
  const [raw, setRaw] = useQueryStates(filterParsers);
  const filters: FilterState = useMemo(() => ({ ...EMPTY_FILTERS, ...raw }), [raw]);
  const setFilters = useCallback(
    (patch: Partial<FilterState>) => {
      // Empty lists are removed from the URL rather than written as `project=`.
      const next = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, Array.isArray(v) && !v.length ? null : v]),
      );
      void setRaw(next);
    },
    [setRaw],
  );
  const reset = useCallback(
    () => void setRaw(Object.fromEntries(Object.keys(filterParsers).map((k) => [k, null]))),
    [setRaw],
  );
  return { filters, setFilters, reset };
}

/** Clicking a breakdown row narrows the filter to that assignee or project (0 = no project). */
export function useFocusRow() {
  const { setFilters } = useFilters();
  return useCallback(
    (by: 'assignee' | 'project', id: number) => {
      if (id) setFilters({ [by]: [id] });
    },
    [setFilters],
  );
}

const scopeParser = parseAsStringLiteral(['all', 'dev', 'issues'] as const).withDefault('all');

/**
 * Development tab switch: All, Dev or Issues (SRS DEV-00). Kept in the URL with the filters;
 * "all" is the default and is left out of the URL.
 */
export function useDevScope() {
  const [scope, setScope] = useQueryState('scope', scopeParser);
  return [scope, (s: DevScope) => void setScope(s === 'all' ? null : s)] as const;
}

const deptParser = parseAsStringLiteral(['all', 'dev', 'qa', 'support'] as const).withDefault(
  'all',
);
const periodParser = parseAsStringLiteral(['day', 'week', 'month'] as const).withDefault('week');
export type KpiDept = 'all' | 'dev' | 'qa' | 'support';
export type KpiPeriod = 'day' | 'week' | 'month';

/** KPI tab: Department and Day / Week / Month, in the URL; defaults (all, week) left out. */
export function useKpiControls() {
  const [dept, setDept] = useQueryState('dept', deptParser);
  const [period, setPeriod] = useQueryState('period', periodParser);
  return {
    dept,
    period,
    setDept: (d: KpiDept) => void setDept(d === 'all' ? null : d),
    setPeriod: (p: KpiPeriod) => void setPeriod(p === 'week' ? null : p),
  };
}

/** "Showing: …" for the tab's "i" tooltips, with project and people names from the options. */
export function useFilterSummary(tab: Tab) {
  const { filters } = useFilters();
  const [scope] = useDevScope();
  const { data } = useFilterOptions(tab, filters, tab === 'dev' ? { scope } : {});
  return useMemo(
    () =>
      filterSummary(filters, {
        scope: tab === 'dev' ? scope : undefined,
        projects: new Map(data?.projects.map((p) => [p.id, p.name])),
        people: new Map(data?.assignees.map((a) => [a.id, a.name])),
      }),
    [filters, scope, tab, data],
  );
}
