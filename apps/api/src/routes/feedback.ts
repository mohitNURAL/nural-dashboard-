// Support tab feedback (2026-10-11): the support team and management say what they need, to shape
// the Support tab and the dashboard. Anyone who may see the Support tab (Tech Support team, PM,
// team leads, admins) can submit and read their own entries; only admins and the head of Tech Support read everything.
import ExcelJS from 'exceljs';
import { brandSheet, exportedAt } from '../exports/theme';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestDataset, Viewer } from '../auth/roles';
import { sessionUserOf } from '../auth/routes';
import { contentDisposition } from './export';

export const FEEDBACK_TOPICS = ['supportTab', 'dashboard', 'problem', 'other'] as const;
export const FEEDBACK_NEEDS = [
  'openByProject',
  'ageing',
  'firstResponse',
  'resolutionTime',
  'byClient',
  'byPerson',
  'reopened',
  'escalated',
  'trend',
  'workload',
  'alerts',
  'export',
] as const;

export const feedbackInput = z.object({
  topic: z.enum(FEEDBACK_TOPICS),
  needs: z.array(z.enum(FEEDBACK_NEEDS)).max(FEEDBACK_NEEDS.length).default([]),
  frequency: z.enum(['daily', 'weekly-several', 'weekly', 'monthly']).optional(),
  problem: z.string().trim().min(10, 'Tell us a little more (at least 10 characters).').max(4000),
  manualReports: z.string().trim().max(4000).optional(),
  decision: z.string().trim().max(4000).optional(),
  priority: z.enum(['must', 'should', 'nice']),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  details: z.string().trim().max(4000).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackInput>;

export interface FeedbackEntry extends FeedbackInput {
  id: number;
  at: Date;
  userId: number;
  name: string;
  role: string;
  dept: string;
  status: 'new' | 'reviewed';
  adminNote: string | null;
}

export interface FeedbackStore {
  add(e: Omit<FeedbackEntry, 'id' | 'at' | 'status' | 'adminNote'>): Promise<FeedbackEntry>;
  all(): Promise<FeedbackEntry[]>;
  mine(userId: number): Promise<FeedbackEntry[]>;
  review(
    id: number,
    patch: { status?: 'new' | 'reviewed'; adminNote?: string | null },
  ): Promise<FeedbackEntry | null>;
}

/** In-memory store (tests, and local runs without a database). */
export function memoryFeedbackStore(): FeedbackStore {
  const rows: FeedbackEntry[] = [];
  let next = 1;
  return {
    async add(e) {
      const row: FeedbackEntry = {
        ...e,
        id: next++,
        at: new Date(),
        status: 'new',
        adminNote: null,
      };
      rows.push(row);
      return row;
    },
    all: async () => [...rows].reverse(),
    mine: async (userId) => rows.filter((r) => r.userId === userId).reverse(),
    async review(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (!r) return null;
      Object.assign(
        r,
        Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      );
      return r;
    },
  };
}

const DEPT_LABEL: Record<string, string> = {
  dev: 'Development',
  qa: 'QA',
  support: 'Support',
  ba: 'BA',
  other: 'Other',
};

export function feedbackRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  store: FeedbackStore,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
) {
  /** Who is asking, or why not (the Support tab audience only). */
  async function who(req: FastifyRequest) {
    const v = await viewer(req);
    if (!v.support)
      return { error: 'The Support tab is for the support team and management.' } as const;
    return { v } as const;
  }

  app.post('/api/feedback', async (req, reply) => {
    const w = await who(req);
    if ('error' in w) return reply.code(403).send({ error: w.error });
    const parsed = feedbackInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: parsed.error.issues[0]?.message ?? 'Invalid feedback.' });
    }
    const ds = await getDataset(req);
    const session = sessionUserOf(req);
    const userId = w.v.userId;
    const entry = await store.add({
      ...parsed.data,
      userId,
      name: session?.name ?? ds.users.get(userId)?.name ?? 'Local copy',
      role: w.v.role,
      dept: DEPT_LABEL[ds.kpiDept?.get(userId) ?? 'other'] ?? 'Other',
    });
    return { ok: true, id: entry.id };
  });

  app.get('/api/feedback/mine', async (req, reply) => {
    const w = await who(req);
    if ('error' in w) return reply.code(403).send({ error: w.error });
    return { rows: await store.mine(w.v.userId) };
  });

  // The inbox: every entry, admins and the head of Tech Support only.
  app.get('/api/feedback', async (req, reply) => {
    if (!(await viewer(req)).inbox) return reply.code(403).send({ error: 'Admins only.' });
    const rows = await store.all();
    return {
      rows,
      counts: {
        total: rows.length,
        new: rows.filter((r) => r.status === 'new').length,
        mustHave: rows.filter((r) => r.priority === 'must').length,
      },
    };
  });

  app.post('/api/feedback/:id/review', async (req, reply) => {
    if (!(await viewer(req)).inbox) return reply.code(403).send({ error: 'Admins only.' });
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const patch = z
      .object({
        status: z.enum(['new', 'reviewed']).optional(),
        adminNote: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(req.body);
    const row = await store.review(id, patch);
    return row ? { ok: true, row } : reply.code(404).send({ error: 'Not found' });
  });

  app.get('/api/feedback/export', async (req, reply) => {
    if (!(await viewer(req)).inbox) return reply.code(403).send({ error: 'Admins only.' });
    const rows = await store.all();
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Feedback');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 6 },
      { header: 'Date', key: 'at', width: 18 },
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Role', key: 'role', width: 12 },
      { header: 'Department', key: 'dept', width: 12 },
      { header: 'About', key: 'topic', width: 14 },
      { header: 'Needs', key: 'needs', width: 40 },
      { header: 'How often', key: 'frequency', width: 14 },
      { header: 'Biggest problem', key: 'problem', width: 50 },
      { header: 'Manual reports', key: 'manualReports', width: 40 },
      { header: 'Decision it helps', key: 'decision', width: 40 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Rating', key: 'rating', width: 8 },
      { header: 'Anything else', key: 'details', width: 40 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Admin note', key: 'adminNote', width: 30 },
    ];
    for (const r of rows) sheet.addRow({ ...r, needs: r.needs.join(', ') });
    brandSheet(sheet, 'Support feedback', `${rows.length} answers`, exportedAt('Asia/Kolkata'));
    const buf = await wb.xlsx.writeBuffer();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header(
        'Content-Disposition',
        contentDisposition(`Dashboard feedback ${new Date().toISOString().slice(0, 10)}.xlsx`),
      )
      .send(Buffer.from(buf));
  });
}

/** Postgres-backed store (table feedback). */
export async function dbFeedbackStore(): Promise<FeedbackStore> {
  const { db, schema } = await import('../db/client');
  const { desc, eq } = await import('drizzle-orm');
  const t = schema.feedback;
  const toEntry = (r: typeof t.$inferSelect): FeedbackEntry =>
    ({
      ...r,
      frequency: r.frequency ?? undefined,
      manualReports: r.manualReports ?? undefined,
      decision: r.decision ?? undefined,
      rating: r.rating ?? undefined,
      details: r.details ?? undefined,
    }) as FeedbackEntry;
  return {
    async add(e) {
      const [row] = await db.insert(t).values(e).returning();
      return toEntry(row!);
    },
    all: async () => (await db.select().from(t).orderBy(desc(t.at))).map(toEntry),
    mine: async (userId) =>
      (await db.select().from(t).where(eq(t.userId, userId)).orderBy(desc(t.at))).map(toEntry),
    async review(id, patch) {
      const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (!Object.keys(set).length) {
        const [row] = await db.select().from(t).where(eq(t.id, id));
        return row ? toEntry(row) : null;
      }
      const [row] = await db.update(t).set(set).where(eq(t.id, id)).returning();
      return row ? toEntry(row) : null;
    },
  };
}
