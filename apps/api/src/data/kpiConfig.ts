// KPI tab configuration files in the repo's config/ folder (SRS 13.5): working calendar and
// holidays, project owners, department mapping. Read once at start; edit and redeploy to change.
import { workCalendar, type CalendarConfig, type Dept, type WorkCalendar } from '@nural/shared';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../../../../config/', import.meta.url));

function read<T>(name: string, fallback: T): T {
  const file = `${dir}${name}`;
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export interface KpiConfig {
  calendar: WorkCalendar;
  /** Workgroup ID → owner user ID (overrides the Bitrix24 group owner). */
  owners: Map<number, number>;
  /** Bitrix24 department names per KPI department. */
  departments: Record<Exclude<Dept, 'other'>, string[]>;
  /** User ID → KPI department, over their Bitrix24 department (e.g. Yajur → ba). */
  people: Map<number, Dept>;
}

let cached: KpiConfig | undefined;

export function kpiConfig(): KpiConfig {
  if (cached) return cached;
  const cal = read<CalendarConfig & { workDays?: number[] }>('holidays.json', {});
  const owners = read<{ owners?: Record<string, number> }>('project-owners.json', {});
  const depts = read<Partial<KpiConfig['departments']> & { people?: Record<string, Dept> }>(
    'departments.json',
    {},
  );
  cached = {
    calendar: workCalendar({ ...cal, days: cal.workDays ?? cal.days }),
    owners: new Map(Object.entries(owners.owners ?? {}).map(([g, u]) => [Number(g), Number(u)])),
    departments: {
      dev: depts.dev ?? ['Software Development'],
      qa: depts.qa ?? ['QA Testing'],
      support: depts.support ?? ['Tech Support'],
      ba: depts.ba ?? [],
    },
    people: new Map(Object.entries(depts.people ?? {}).map(([u, d]) => [Number(u), d])),
  };
  return cached;
}
