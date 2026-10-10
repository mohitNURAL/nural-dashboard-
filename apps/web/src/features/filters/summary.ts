// The "Showing: …" line under every "i" explanation: what the current filters and switch cover.
import type { DevScope } from '@nural/shared';
import { fmtDate } from '../dev/format';
import type { FilterState } from './toParams';

const SCOPE_LABEL: Record<DevScope, string> = {
  all: 'Tasks and issues',
  dev: 'Dev tasks',
  issues: 'Issues',
};

const names = (ids: number[], known: Map<number, string>, one: string, many: string) => {
  if (!ids.length) return null;
  const listed = ids.map((id) => known.get(id)).filter((n): n is string => !!n);
  if (listed.length !== ids.length || ids.length > 2)
    return `${ids.length} ${ids.length === 1 ? one : many}`;
  return listed.join(', ');
};

/** E.g. "Showing: Dev tasks · Moto India · Umang Singh · created 1 Sept 2026 to 10 Oct 2026". */
export function filterSummary(
  f: FilterState,
  opts: {
    scope?: DevScope;
    projects?: Map<number, string>;
    people?: Map<number, string>;
  } = {},
): string {
  const parts: string[] = [];
  if (opts.scope) parts.push(SCOPE_LABEL[opts.scope]);
  if (f.type) parts.push(f.type === 'bug' ? 'Bugs' : 'Feedback');
  parts.push(names(f.project, opts.projects ?? new Map(), 'project', 'projects') ?? 'all projects');
  parts.push(names(f.assignee, opts.people ?? new Map(), 'person', 'people') ?? 'everyone');
  if (f.tag.length) parts.push(`tag ${f.tag.join(', ')}`);
  if (f.from || f.to) {
    const field = f.dateField === 'deadline' ? 'deadline' : 'created';
    const at = (d: string | null) => (d ? fmtDate(`${d}T12:00:00+05:30`) : '…');
    parts.push(`${field} ${at(f.from)} to ${at(f.to)}`);
  }
  return `Showing: ${parts.join(' · ')}`;
}
