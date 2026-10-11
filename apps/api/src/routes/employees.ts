// Employee module (SRS 17, 2026-10-11): the company tree and the people directory, for those
// with the employees right (by default admins, PM and team leads). People and departments come
// from Bitrix24 (users, departments); sign-in and activity from user_prefs; access areas are each
// person's effective rights (auth/rights.ts); open and overdue tasks from the request's dataset.
import { isOverdue, isPending } from '@nural/shared';
import ExcelJS from 'exceljs';
import { brandSheet, exportedAt } from '../exports/theme';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RequestDataset, Viewer } from '../auth/roles';
import type { Resolved, Role } from '../auth/rights';
import type { Dataset } from '../data/dataset';
import { contextOf, type AppOptions } from './context';
import { contentDisposition } from './export';
import type { Activity } from './prefs';

/** Signed-in requests within this long count as "active now". */
export const ACTIVE_MS = 5 * 60_000;

export type SignInStatus = 'active' | 'signedIn' | 'ended' | 'earlier' | 'never';

/** Where a person stands with the dashboard, from their sign-ins and last request. */
export function signInStatus(
  a: Activity | undefined,
  now: Date,
  sessionDays: number,
): SignInStatus {
  if (!a || (!a.loginCount && !a.lastSeenAt)) return 'never';
  if (a.lastSeenAt && now.getTime() - a.lastSeenAt.getTime() < ACTIVE_MS) return 'active';
  if (a.lastSignInAt) {
    return now.getTime() - a.lastSignInAt.getTime() < sessionDays * 86_400_000
      ? 'signedIn'
      : 'ended';
  }
  // Signed in before sign-in times were kept (2026-10-11).
  return 'earlier';
}

export interface EmployeeDeps extends AppOptions {
  activity: () => Promise<Map<number, Activity>>;
  /** Role and effective rights of a person. */
  resolve: (id: number, ds: Dataset) => Resolved & { role: Role; locked: boolean };
  sessionDays: number;
}

const STATUS_LABEL: Record<SignInStatus, string> = {
  active: 'Active now',
  signedIn: 'Signed in',
  ended: 'Session ended',
  earlier: 'Signed in earlier',
  never: 'Never signed in',
};

export function employeeRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  deps: EmployeeDeps,
) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/employees')) return;
    if (!(await viewer(req)).employees) {
      return reply
        .code(403)
        .send({ error: 'The Employee module is for admins, PM and team leads.' });
    }
  });

  app.get('/api/employees/tree', async (req) => {
    const ds = await getDataset(req);
    const person = (id: number) => {
      const u = ds.users.get(id);
      return u ? { id: u.id, name: u.name, position: u.workPosition } : null;
    };
    const departments = (ds.departments ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      head: d.headId ? person(d.headId) : null,
      members: [...ds.users.values()]
        .filter((u) => u.active && u.departmentIds?.includes(d.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => ({ id: u.id, name: u.name, position: u.workPosition })),
    }));
    return { departments };
  });

  async function rows(req: FastifyRequest) {
    const ds = await getDataset(req);
    const ctx = contextOf(ds, deps);
    const now = ctx.now;
    const activity = await deps.activity();
    const deptName = new Map((ds.departments ?? []).map((d) => [d.id, d.name]));
    const open = new Map<number, number>();
    const overdue = new Map<number, number>();
    for (const t of ds.tasks) {
      if (!t.responsibleId || !isPending(t)) continue;
      open.set(t.responsibleId, (open.get(t.responsibleId) ?? 0) + 1);
      if (isOverdue(t, ctx)) overdue.set(t.responsibleId, (overdue.get(t.responsibleId) ?? 0) + 1);
    }
    return [...ds.users.values()]
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
      .map((u) => {
        const r = deps.resolve(u.id, ds);
        const a = activity.get(u.id);
        return {
          id: u.id,
          name: u.name,
          position: u.workPosition,
          departments: (u.departmentIds ?? []).map((d) => deptName.get(d) ?? String(d)),
          active: u.active,
          role: r.role,
          rights: r.rights,
          loginCount: a?.loginCount ?? 0,
          lastSignInAt: a?.lastSignInAt ?? null,
          lastSeenAt: a?.lastSeenAt ?? null,
          status: signInStatus(a, now, deps.sessionDays),
          open: open.get(u.id) ?? 0,
          overdue: overdue.get(u.id) ?? 0,
        };
      });
  }

  app.get('/api/employees', async (req) => ({ rows: await rows(req) }));

  app.get('/api/employees/export', async (req, reply) => {
    const list = await rows(req);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Employees');
    sheet.columns = [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Designation', key: 'position', width: 24 },
      { header: 'Department', key: 'departments', width: 24 },
      { header: 'Bitrix24 account', key: 'active', width: 14 },
      { header: 'Role', key: 'role', width: 14 },
      { header: 'Data scope', key: 'scope', width: 12 },
      { header: 'Access areas', key: 'areas', width: 40 },
      { header: 'Dashboard', key: 'status', width: 16 },
      { header: 'Sign-ins', key: 'loginCount', width: 9 },
      { header: 'Last sign-in', key: 'lastSignInAt', width: 18 },
      { header: 'Last active', key: 'lastSeenAt', width: 18 },
      { header: 'Open tasks', key: 'open', width: 10 },
      { header: 'Overdue', key: 'overdue', width: 9 },
    ];
    for (const r of list) {
      const areas = [
        r.rights.kpi && 'KPI',
        'Development',
        'QA',
        r.rights.support && 'Support',
        r.rights.inbox && 'Feedback inbox',
        r.rights.employees && 'Employees',
        r.rights.edit === 'all' ? 'Edit all fields' : 'Edit stage, status, tags',
        r.rights.admin && 'Access admin',
      ].filter(Boolean);
      sheet.addRow({
        ...r,
        departments: r.departments.join(', '),
        active: r.active ? 'Active' : 'Inactive',
        scope: r.rights.scope === 'all' ? 'All data' : 'Own tasks',
        areas: areas.join(', '),
        status: STATUS_LABEL[r.status],
        lastSignInAt: r.lastSignInAt ?? '',
        lastSeenAt: r.lastSeenAt ?? '',
      });
    }
    brandSheet(sheet, 'People directory', `${list.length} people`, exportedAt('Asia/Kolkata'));
    const buf = await wb.xlsx.writeBuffer();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header(
        'Content-Disposition',
        contentDisposition(`Employees ${new Date().toISOString().slice(0, 10)}.xlsx`),
      )
      .send(Buffer.from(buf));
  });
}
