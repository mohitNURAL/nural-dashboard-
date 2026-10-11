// Who gets a report and what it covers for each of them (SRS 19). A recipient never gets data
// beyond their own rights; within them, the report covers their part of the work:
// - management (admins, PM): the company;
// - team leads: the projects they own and the people under them (departments they head in the
//   Bitrix24 tree, sub-departments included), and their own tasks;
// - product owners: their projects and their own tasks;
// - everyone else: their own tasks.
import type { MetricTask } from '@nural/shared';
import { inScope, resolveFor, type RolesConfig } from '../auth/roles';
import { departmentChain, type Grants, type Role } from '../auth/rights';
import type { Dataset } from '../data/dataset';
import type { Definition } from './model';

export type Level = 'company' | 'team' | 'projects' | 'own';

export const LEVEL_LABEL: Record<Level, string> = {
  company: 'The whole company',
  team: 'Your team and projects',
  projects: 'Your projects',
  own: 'Your tasks',
};

export interface RecipientScope {
  userId: number;
  role: Role;
  level: Level;
  tasks: MetricTask[];
}

/** People under a person: members of the departments they head, sub-departments included. */
export function teamOf(id: number, ds: Pick<Dataset, 'departments' | 'users'>): Set<number> {
  const depts = ds.departments ?? [];
  const headed = new Set(depts.filter((d) => d.headId === id).map((d) => d.id));
  if (!headed.size) return new Set();
  const under = new Set(
    depts.filter((d) => departmentChain([d.id], depts).some((c) => headed.has(c))).map((d) => d.id),
  );
  return new Set(
    [...ds.users.values()]
      .filter((u) => u.active && u.departmentIds?.some((d) => under.has(d)))
      .map((u) => u.id),
  );
}

export function reportScope(
  id: number,
  ds: Dataset,
  roles: RolesConfig,
  grants: Grants,
): RecipientScope {
  const r = resolveFor(id, ds, roles, grants);
  const own = () => ds.tasks.filter((t) => inScope(t, id));
  if (r.rights.scope !== 'all') return { userId: id, role: r.role, level: 'own', tasks: own() };
  if (r.role === 'admin' || r.role === 'pm')
    return { userId: id, role: r.role, level: 'company', tasks: [...ds.tasks] };
  const projects = new Set([...(ds.owners ?? [])].filter(([, o]) => o === id).map(([g]) => g));
  if (r.role === 'teamLead') {
    const team = teamOf(id, ds);
    if (!team.size && !projects.size)
      return { userId: id, role: r.role, level: 'own', tasks: own() };
    return {
      userId: id,
      role: r.role,
      level: 'team',
      tasks: ds.tasks.filter(
        (t) => team.has(t.responsibleId) || projects.has(t.groupId) || inScope(t, id),
      ),
    };
  }
  if (r.role === 'productOwner') {
    return projects.size
      ? {
          userId: id,
          role: r.role,
          level: 'projects',
          tasks: ds.tasks.filter((t) => projects.has(t.groupId) || inScope(t, id)),
        }
      : { userId: id, role: r.role, level: 'own', tasks: own() };
  }
  // A member an admin gave all data: the company.
  return { userId: id, role: r.role, level: 'company', tasks: [...ds.tasks] };
}

/** Active people the report goes to: by role and by name. */
export function recipientsOf(
  def: Definition,
  ds: Dataset,
  roles: RolesConfig,
  grants: Grants,
): number[] {
  const wanted = new Set(def.audience.roles);
  const out = new Set<number>(def.audience.users.filter((u) => ds.users.get(u)?.active));
  if (wanted.size) {
    for (const u of ds.users.values()) {
      if (!u.active) continue;
      if (wanted.has(resolveFor(u.id, ds, roles, grants).role as never)) out.add(u.id);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** People who manage access: preview copies go to them. */
export const adminsOf = (ds: Dataset, roles: RolesConfig, grants: Grants) =>
  [...ds.users.values()]
    .filter((u) => u.active && resolveFor(u.id, ds, roles, grants).rights.admin)
    .map((u) => u.id);
