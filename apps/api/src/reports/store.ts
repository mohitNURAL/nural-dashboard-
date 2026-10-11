// Reports and their runs (tables reports, report_runs). A send is claimed before it goes out
// (report, period, recipient, channel are unique), so a report never goes twice for one period.
import type { Definition, Report, ReportState } from './model';

export interface RunClaim {
  reportId: number;
  periodKey: string;
  recipient: string;
  channel: 'mail' | 'slack' | 'slack-channel';
  preview: boolean;
  subject: string;
}

export interface Run extends RunClaim {
  id: number;
  at: Date;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'test';
  error: string | null;
}

export interface ReportStore {
  list(): Promise<Report[]>;
  get(id: number): Promise<Report | null>;
  create(name: string, definition: Definition, by: number): Promise<Report>;
  update(id: number, name: string, definition: Definition): Promise<Report | null>;
  setState(id: number, state: ReportState): Promise<Report | null>;
  remove(id: number): Promise<void>;
  /** The run's ID, or null when this period, recipient and channel already had one. */
  claim(run: RunClaim): Promise<number | null>;
  finish(id: number, status: Run['status'], error?: string | null): Promise<void>;
  runs(reportId: number, limit: number): Promise<Run[]>;
}

export function memoryReportStore(): ReportStore {
  const reports = new Map<number, Report>();
  const runs: Run[] = [];
  let next = 1;
  let nextRun = 1;
  return {
    list: async () => [...reports.values()].sort((a, b) => a.id - b.id),
    get: async (id) => reports.get(id) ?? null,
    async create(name, definition, by) {
      const r: Report = {
        id: next++,
        name,
        state: 'preview',
        definition,
        createdBy: by,
        updatedAt: new Date(),
      };
      reports.set(r.id, r);
      return r;
    },
    async update(id, name, definition) {
      const r = reports.get(id);
      if (!r) return null;
      Object.assign(r, { name, definition, updatedAt: new Date() });
      return r;
    },
    async setState(id, state) {
      const r = reports.get(id);
      if (!r) return null;
      Object.assign(r, { state, updatedAt: new Date() });
      return r;
    },
    async remove(id) {
      reports.delete(id);
    },
    async claim(c) {
      if (
        runs.some(
          (r) =>
            r.reportId === c.reportId &&
            r.periodKey === c.periodKey &&
            r.recipient === c.recipient &&
            r.channel === c.channel,
        )
      ) {
        return null;
      }
      const run: Run = { ...c, id: nextRun++, at: new Date(), status: 'pending', error: null };
      runs.push(run);
      return run.id;
    },
    async finish(id, status, error = null) {
      const r = runs.find((x) => x.id === id);
      if (r) Object.assign(r, { status, error });
    },
    runs: async (reportId, limit) =>
      runs
        .filter((r) => r.reportId === reportId)
        .reverse()
        .slice(0, limit),
  };
}

/** Postgres-backed store. */
export async function dbReportStore(): Promise<ReportStore> {
  const { db, schema } = await import('../db/client');
  const { desc, eq } = await import('drizzle-orm');
  const t = schema.reports;
  const r = schema.reportRuns;
  const toReport = (row: typeof t.$inferSelect): Report => ({
    id: row.id,
    name: row.name,
    state: row.state as ReportState,
    definition: row.definition as Definition,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
  });
  return {
    list: async () => (await db.select().from(t).orderBy(t.id)).map(toReport),
    async get(id) {
      const [row] = await db.select().from(t).where(eq(t.id, id));
      return row ? toReport(row) : null;
    },
    async create(name, definition, by) {
      const [row] = await db.insert(t).values({ name, definition, createdBy: by }).returning();
      return toReport(row!);
    },
    async update(id, name, definition) {
      const [row] = await db
        .update(t)
        .set({ name, definition, updatedAt: new Date() })
        .where(eq(t.id, id))
        .returning();
      return row ? toReport(row) : null;
    },
    async setState(id, state) {
      const [row] = await db
        .update(t)
        .set({ state, updatedAt: new Date() })
        .where(eq(t.id, id))
        .returning();
      return row ? toReport(row) : null;
    },
    async remove(id) {
      await db.delete(t).where(eq(t.id, id));
    },
    async claim(c) {
      const [row] = await db
        .insert(r)
        .values({ ...c, status: 'pending' })
        .onConflictDoNothing()
        .returning({ id: r.id });
      return row?.id ?? null;
    },
    async finish(id, status, error = null) {
      await db.update(r).set({ status, error }).where(eq(r.id, id));
    },
    runs: async (reportId, limit) =>
      (
        await db.select().from(r).where(eq(r.reportId, reportId)).orderBy(desc(r.at)).limit(limit)
      ).map((x) => ({
        ...x,
        channel: x.channel as Run['channel'],
        status: x.status as Run['status'],
        subject: x.subject ?? '',
      })),
  };
}
