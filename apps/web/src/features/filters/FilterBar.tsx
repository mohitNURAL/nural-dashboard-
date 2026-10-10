// Sticky filter bar shared by both tabs (DEV-00). Each dropdown's options are limited to the
// data matching every other filter.
import { SearchCombobox } from '../../components/SearchCombobox';
import { useFilterOptions } from '../../api/queries';
import { DateRangePicker } from './DateRangePicker';
import { hasFilters, type Tab } from './toParams';
import { useDevScope, useFilters } from './useFilters';

const ISSUE_TYPE_LABEL = { bug: 'Bug', feedback: 'Feedback' } as const;

export function FilterBar({ tab }: { tab: Tab }) {
  const { filters, setFilters, reset } = useFilters();
  const [scope] = useDevScope();
  // Development options follow its All / Dev / Issues switch.
  const { data, isLoading } = useFilterOptions(tab, filters, tab === 'dev' ? { scope } : {});
  const ids = (v: number[]) => v.map(String);
  const nums = (v: string[]) => v.map(Number);

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="mx-auto grid max-w-page grid-cols-2 gap-3 px-4 py-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:px-6">
        <SearchCombobox
          label="Project"
          loading={isLoading}
          options={(data?.projects ?? []).map((p) => ({
            value: String(p.id),
            label: p.name,
            count: p.count,
          }))}
          selected={ids(filters.project)}
          onChange={(v) => setFilters({ project: nums(v) })}
        />
        <SearchCombobox
          label="Assignee"
          loading={isLoading}
          options={(data?.assignees ?? []).map((a) => ({
            value: String(a.id),
            label: a.name,
            count: a.count,
            group: a.deptGroup,
          }))}
          selected={ids(filters.assignee)}
          onChange={(v) => setFilters({ assignee: nums(v) })}
        />
        {tab === 'dev' ? (
          <SearchCombobox
            label="Tag"
            loading={isLoading}
            options={(data?.tags ?? []).map((t) => ({
              value: t.value,
              label: t.value,
              count: t.count,
            }))}
            selected={filters.tag}
            onChange={(v) => setFilters({ tag: v })}
          />
        ) : (
          <SearchCombobox
            label="Bug or Feedback"
            single
            loading={isLoading}
            options={(data?.issueTypes ?? []).map((t) => ({
              value: t.value,
              label: ISSUE_TYPE_LABEL[t.value],
              count: t.count,
            }))}
            selected={filters.type ? [filters.type] : []}
            onChange={(v) => setFilters({ type: (v[0] as 'bug' | 'feedback' | undefined) ?? null })}
          />
        )}
        <DateRangePicker value={filters} onChange={(r) => setFilters(r)} />
        <button
          type="button"
          onClick={reset}
          disabled={!hasFilters(tab, filters)}
          className="col-span-2 h-10 rounded-control px-3 font-heading text-button text-primary hover:bg-primary-soft-100 disabled:text-text-muted disabled:hover:bg-transparent lg:col-span-1"
        >
          Reset filters
        </button>
      </div>
    </div>
  );
}
