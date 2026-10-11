// Help (2026-10-12, SRS 20). Feedback: anyone with the right sends an issue or idea about the
// dashboard, a page, a project or a person, with up to 5 attachments (images, PDF, Excel, Word;
// 8 MB each, sent as base64 in JSON). The project and person pickers offer only what the sender
// can see (their scoped dataset). The writer sees their own; the Feedback inbox (helpInbox) sees
// everyone's, marks them reviewed with a note and exports them. Finance feedback is for admins.
// Attachments are stored in Postgres and only ever downloaded (images may show inline), never run.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { RequestDataset, Viewer } from '../auth/roles';
import { brandSheet, exportedAt } from '../exports/theme';
import { contentDisposition } from './export';

export const MAX_FILES = 5;
export const MAX_BYTES = 8 * 1024 * 1024;

/** Allowed attachments: by extension, with the types a browser sends for them. */
const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};
const INLINE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** The file's type from its name, or null when it is not allowed. */
export function fileType(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return TYPES[ext] ?? null;
}

const fileInput = z.object({
  name: z.string().trim().min(1).max(160),
  /** base64 of the file. */
  data: z.string().min(1),
});

export const helpInput = z.object({
  aboutKind: z.enum(['dashboard', 'page', 'project', 'person', 'finance']),
  aboutId: z.number().int().positive().nullable().optional(),
  aboutLabel: z.string().trim().max(120).nullable().optional(),
  title: z.string().trim().min(3).max(160),
  details: z.string().trim().min(5).max(5000),
  impact: z.enum(['low', 'medium', 'high']),
  files: z.array(fileInput).max(MAX_FILES).default([]),
});

export interface HelpFile {
  id: number;
  feedbackId: number;
  name: string;
  mime: string;
  size: number;
}

export interface HelpRow {
  id: number;
  at: Date;
  userId: number;
  name: string;
  aboutKind: string;
  aboutId: number | null;
  aboutLabel: string | null;
  title: string;
  details: string;
  impact: string;
  status: string;
  adminNote: string | null;
  files: HelpFile[];
}

export interface HelpStore {
  add(
    row: Omit<HelpRow, 'id' | 'at' | 'status' | 'adminNote' | 'files'>,
    files: { name: string; mime: string; data: Buffer }[],
  ): Promise<number>;
  mine(userId: number): Promise<HelpRow[]>;
  all(): Promise<HelpRow[]>;
  review(id: number, status: 'new' | 'reviewed', note: string | null): Promise<boolean>;
  file(id: number): Promise<(HelpFile & { data: Buffer; ownerId: number }) | null>;
}

export function memoryHelpStore(): HelpStore {
  const rows: HelpRow[] = [];
  const blobs = new Map<number, Buffer>();
  let n = 0;
  let f = 0;
  return {
    async add(row, files) {
      const id = ++n;
      rows.push({
        ...row,
        id,
        at: new Date(),
        status: 'new',
        adminNote: null,
        files: files.map((x) => {
          const fid = ++f;
          blobs.set(fid, x.data);
          return { id: fid, feedbackId: id, name: x.name, mime: x.mime, size: x.data.length };
        }),
      });
      return id;
    },
    mine: async (userId) => rows.filter((r) => r.userId === userId).reverse(),
    all: async () => [...rows].reverse(),
    async review(id, status, note) {
      const r = rows.find((x) => x.id === id);
      if (!r) return false;
      Object.assign(r, { status, adminNote: note });
      return true;
    },
    async file(id) {
      for (const r of rows)
        for (const x of r.files)
          if (x.id === id) return { ...x, data: blobs.get(id)!, ownerId: r.userId };
      return null;
    },
  };
}

export async function dbHelpStore(): Promise<HelpStore> {
  const { db, schema } = await import('../db/client');
  const { desc, eq, inArray } = await import('drizzle-orm');
  const t = schema.helpFeedback;
  const fl = schema.helpFiles;
  const withFiles = async (rows: (typeof t.$inferSelect)[]): Promise<HelpRow[]> => {
    const ids = rows.map((r) => r.id);
    const files = ids.length
      ? await db
          .select({
            id: fl.id,
            feedbackId: fl.feedbackId,
            name: fl.name,
            mime: fl.mime,
            size: fl.size,
          })
          .from(fl)
          .where(inArray(fl.feedbackId, ids))
      : [];
    return rows.map((r) => ({ ...r, files: files.filter((x) => x.feedbackId === r.id) }));
  };
  return {
    async add(row, files) {
      const [r] = await db.insert(t).values(row).returning({ id: t.id });
      if (files.length)
        await db.insert(fl).values(
          files.map((x) => ({
            feedbackId: r!.id,
            name: x.name,
            mime: x.mime,
            size: x.data.length,
            data: x.data,
          })),
        );
      return r!.id;
    },
    mine: async (userId) =>
      withFiles(await db.select().from(t).where(eq(t.userId, userId)).orderBy(desc(t.at))),
    all: async () => withFiles(await db.select().from(t).orderBy(desc(t.at)).limit(2000)),
    async review(id, status, note) {
      const r = await db
        .update(t)
        .set({ status, adminNote: note })
        .where(eq(t.id, id))
        .returning({ id: t.id });
      return r.length > 0;
    },
    async file(id) {
      const [x] = await db.select().from(fl).where(eq(fl.id, id));
      if (!x) return null;
      const [owner] = await db.select({ userId: t.userId }).from(t).where(eq(t.id, x.feedbackId));
      return { ...x, ownerId: owner?.userId ?? -1 };
    },
  };
}

const view = (r: HelpRow) => ({ ...r, at: r.at.toISOString() });

export function helpRoutes(
  app: FastifyInstance,
  getDataset: RequestDataset,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
  store: HelpStore,
) {
  /** Projects and people the sender may name: only those in their own view. */
  app.get('/api/help/options', async (req, reply) => {
    const v = await viewer(req);
    if (!v.helpFeedback) return reply.code(403).send({ error: 'You have no access to Feedback.' });
    const ds = await getDataset(req);
    const projectIds = new Set(
      ds.tasks.map((t) => t.groupId).filter((g): g is number => g != null),
    );
    const peopleIds = new Set(ds.tasks.flatMap((t) => [t.responsibleId, t.createdBy]));
    if (v.full) for (const u of ds.users.values()) if (u.active) peopleIds.add(u.id);
    return {
      projects: [...projectIds]
        .map((id) => ({ id, name: ds.projects.get(id)?.name ?? `Project ${id}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      people: [...peopleIds]
        .map((id) => ds.users.get(id))
        .filter((u): u is NonNullable<typeof u> => !!u?.active)
        .map((u) => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  app.post(
    '/api/help/feedback',
    // 5 files of 8 MB, as base64 (a third more), and the text.
    { bodyLimit: Math.ceil(MAX_FILES * MAX_BYTES * 1.4) + 100_000 },
    async (req, reply) => {
      const v = await viewer(req);
      const parsed = helpInput.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: parsed.error.issues[0]?.message ?? 'Invalid feedback.' });
      const d = parsed.data;
      if (d.aboutKind === 'finance' ? !v.admin : !v.helpFeedback)
        return reply.code(403).send({ error: 'You have no access to send this feedback.' });
      const files: { name: string; mime: string; data: Buffer }[] = [];
      for (const f of d.files) {
        const mime = fileType(f.name);
        if (!mime)
          return reply
            .code(400)
            .send({ error: `${f.name}: only images, PDF, Excel and Word files can be attached.` });
        const data = Buffer.from(f.data, 'base64');
        if (data.length > MAX_BYTES)
          return reply.code(400).send({ error: `${f.name} is over 8 MB.` });
        files.push({ name: f.name, mime, data });
      }
      // A named project or person must be one the sender can see.
      if (d.aboutKind === 'project' || d.aboutKind === 'person') {
        const ds = await getDataset(req);
        const visible =
          d.aboutKind === 'project'
            ? ds.tasks.some((t) => t.groupId === d.aboutId)
            : d.aboutId != null &&
              (ds.tasks.some((t) => t.responsibleId === d.aboutId || t.createdBy === d.aboutId) ||
                (v.full && !!ds.users.get(d.aboutId)?.active));
        if (!visible)
          return reply.code(400).send({ error: 'Choose a project or person you can see.' });
      }
      const ds = await getDataset(req);
      const id = await store.add(
        {
          userId: v.userId,
          name: ds.users.get(v.userId)?.name ?? 'Someone',
          aboutKind: d.aboutKind,
          aboutId: d.aboutId ?? null,
          aboutLabel: d.aboutLabel ?? null,
          title: d.title,
          details: d.details,
          impact: d.impact,
        },
        files,
      );
      return { ok: true, id };
    },
  );

  app.get('/api/help/feedback/mine', async (req) => ({
    rows: (await store.mine((await viewer(req)).userId)).map(view),
  }));

  app.get('/api/help/feedback', async (req, reply) => {
    const v = await viewer(req);
    if (!v.helpInbox)
      return reply.code(403).send({ error: 'The Feedback inbox is not open to you.' });
    const rows = await store.all();
    // Finance feedback is for admins only.
    return { rows: rows.filter((r) => r.aboutKind !== 'finance' || v.admin).map(view) };
  });

  app.post('/api/help/feedback/:id/review', async (req, reply) => {
    if (!(await viewer(req)).helpInbox)
      return reply.code(403).send({ error: 'The Feedback inbox is not open to you.' });
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const b = z
      .object({
        status: z.enum(['new', 'reviewed']),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'Invalid review.' });
    return (await store.review(id, b.data.status, b.data.note ?? null))
      ? { ok: true }
      : reply.code(404).send({ error: 'No such feedback.' });
  });

  app.get('/api/help/files/:id', async (req, reply) => {
    const v = await viewer(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const f = await store.file(id);
    if (!f || (f.ownerId !== v.userId && !v.helpInbox))
      return reply.code(404).send({ error: 'No such file.' });
    const inline =
      INLINE.has(f.mime) && (req.query as { download?: string }).download === undefined;
    return reply
      .header('Content-Type', f.mime)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox")
      .header(
        'Content-Disposition',
        inline
          ? contentDisposition(f.name).replace(/^attachment/, 'inline')
          : contentDisposition(f.name),
      )
      .send(f.data);
  });

  app.get('/api/help/feedback/export', async (req, reply) => {
    const v = await viewer(req);
    if (!v.helpInbox)
      return reply.code(403).send({ error: 'The Feedback inbox is not open to you.' });
    const rows = (await store.all()).filter((r) => r.aboutKind !== 'finance' || v.admin);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Feedback');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 6 },
      { header: 'Date', key: 'at', width: 18 },
      { header: 'From', key: 'name', width: 20 },
      { header: 'About', key: 'about', width: 26 },
      { header: 'Title', key: 'title', width: 36 },
      { header: 'Details', key: 'details', width: 60 },
      { header: 'Impact', key: 'impact', width: 9 },
      { header: 'Attachments', key: 'files', width: 30 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Note', key: 'adminNote', width: 30 },
    ];
    for (const r of rows)
      sheet.addRow({
        ...r,
        at: r.at.toISOString().slice(0, 16).replace('T', ' '),
        about: [r.aboutKind, r.aboutLabel].filter(Boolean).join(': '),
        files: r.files.map((f) => f.name).join(', '),
      });
    brandSheet(sheet, 'Help feedback', `${rows.length} items`, exportedAt('Asia/Kolkata'));
    const buf = await wb.xlsx.writeBuffer();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header(
        'Content-Disposition',
        contentDisposition(`Help feedback ${new Date().toISOString().slice(0, 10)}.xlsx`),
      )
      .send(Buffer.from(buf));
  });
}
