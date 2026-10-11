// Employee module data (apps/api/src/routes/employees.ts and access.ts).
import { useApi } from '../../api/queries';

/** Every right (apps/api/src/auth/rights.ts): one per menu page, plus the permissions under them. */
export interface Rights {
  scope: 'all' | 'own';
  edit: 'all' | 'limited';
  kpi: boolean;
  dev: boolean;
  qa: boolean;
  support: boolean;
  inbox: boolean;
  insights: boolean;
  org: boolean;
  people: boolean;
  admin: boolean;
  connections: boolean;
  mailing: boolean;
  helpFeedback: boolean;
  helpInbox: boolean;
  helpDocs: boolean;
  helpFaq: boolean;
}
export type RightKey = keyof Rights;
/** Saved grants may still hold the old `employees` (company tree and people directory). */
export type Grant = Partial<Rights> & { employees?: boolean };
export type Source = 'role' | 'department' | 'person' | 'locked';
export type Role = 'admin' | 'pm' | 'teamLead' | 'productOwner' | 'member' | 'local';
export type SignInStatus = 'active' | 'signedIn' | 'ended' | 'earlier' | 'never';

export interface PersonRef {
  id: number;
  name: string;
  position: string | null;
}

export interface DeptNode {
  id: number;
  name: string;
  parentId: number | null;
  head: PersonRef | null;
  members: PersonRef[];
}

export interface Employee extends PersonRef {
  departments: string[];
  active: boolean;
  role: Role;
  rights: Rights;
  loginCount: number;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
  status: SignInStatus;
  open: number;
  overdue: number;
}

export interface AccessPerson extends PersonRef {
  departments: string[];
  role: Role;
  locked: boolean;
  defaults: Rights;
  /** Without their own override: the role, then departments. */
  inherited: Rights;
  grant: Grant | null;
  rights: Rights;
  source: Record<RightKey, Source>;
}

export interface AccessDept {
  id: number;
  name: string;
  parentId: number | null;
  depth: number;
  head: string | null;
  members: number;
  grant: Grant | null;
}

export interface AuditRow {
  id: number;
  at: string;
  by: string;
  subject: string;
  subjectType: 'user' | 'dept';
  before: Grant | null;
  after: Grant | null;
}

export const useOrgTree = () => useApi<{ departments: DeptNode[] }>('/api/employees/tree', {});
export const useEmployees = () => useApi<{ rows: Employee[] }>('/api/employees', {});
export const useAccess = () =>
  useApi<{ people: AccessPerson[]; departments: AccessDept[] }>('/api/access', {});
export const useAudit = () => useApi<{ rows: AuditRow[] }>('/api/access/audit', {});
