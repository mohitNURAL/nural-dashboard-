// Per-person settings (2026-10-11): the sign-in count (the guided tour plays on the first three
// sign-ins), the order of tiles, cards and sections, and guided-tour state. Each person reads and
// writes only their own; nothing here is shared or sent to Bitrix24.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Viewer } from '../auth/roles';

const id = z.string().regex(/^[A-Za-z0-9._-]{1,60}$/);

/**
 * Per group: its order ("dev.tiles": ["total", "pending"]), the cards put side by side
 * ("dev.pairs") and the data points hidden ("dev.tiles.hidden"). The menu's order of modules and
 * of the pages in each ("menu.modules", "menu.Dashboard"). Per table (2026-10-12): its column
 * order and hidden columns ("table.tasks.cols", "table.tasks.hidden"), the person's own row
 * order ("table.tasks.rows", up to 2,000 row keys) and whether it is in use ("table.tasks.mode").
 */
const GROUP = /^[a-z]+\.[a-z]+(\.hidden)?$/;
const MENU = /^menu\.[A-Za-z]{1,30}$/;
const TABLE = /^table\.[a-z][a-z0-9-]{0,40}\.(cols|hidden|rows|mode)$/;
export const layoutInput = z
  .record(
    z.string().refine((k) => GROUP.test(k) || MENU.test(k) || TABLE.test(k), 'Unknown layout key.'),
    z.array(id).max(2000),
  )
  .refine((v) => Object.keys(v).length <= 200, 'Too many groups.')
  .refine(
    (v) => Object.entries(v).every(([k, list]) => k.endsWith('.rows') || list.length <= 60),
    'Too many items in a group.',
  );

export const tourInput = z.object({
  /** Read steps aloud (browser voice). */
  voice: z.boolean().optional(),
  /** Per tab, the sign-in number the tab's tour was last shown at. */
  shown: z.record(z.string().regex(/^[a-z]{1,20}$/), z.number().int().min(0)).optional(),
  /** What's-new entries already walked through or dismissed. */
  seen: z.array(id).max(500).optional(),
});

export const prefsInput = z
  .object({ layout: layoutInput.optional(), tour: tourInput.optional() })
  .strict();

export type Layout = z.infer<typeof layoutInput>;
export type TourPrefs = z.infer<typeof tourInput>;
export interface Prefs {
  loginCount: number;
  layout: Layout;
  tour: TourPrefs;
}

export interface PrefsStore {
  get(userId: number): Promise<Prefs>;
  /** One more sign-in. */
  signIn(userId: number): Promise<void>;
  /** Replaces the fields given. */
  save(userId: number, patch: { layout?: Layout; tour?: TourPrefs }): Promise<Prefs>;
  /** The person made a signed-in request (People directory: last active). */
  seen(userId: number, at: Date): Promise<void>;
  /** Sign-ins and activity of everyone (People directory). */
  activity(): Promise<Map<number, Activity>>;
}

export interface Activity {
  loginCount: number;
  lastSignInAt: Date | null;
  lastSeenAt: Date | null;
}

const EMPTY = (): Prefs => ({ loginCount: 0, layout: {}, tour: {} });

/** In-memory store (tests, and local runs without a database). */
export function memoryPrefsStore(): PrefsStore {
  const rows = new Map<number, Prefs>();
  const acts = new Map<number, Activity>();
  const row = (userId: number) => rows.get(userId) ?? EMPTY();
  const act = (userId: number) =>
    acts.get(userId) ?? { loginCount: 0, lastSignInAt: null, lastSeenAt: null };
  return {
    get: async (userId) => structuredClone(row(userId)),
    async signIn(userId) {
      const r = row(userId);
      rows.set(userId, { ...r, loginCount: r.loginCount + 1 });
      const now = new Date();
      acts.set(userId, { loginCount: r.loginCount + 1, lastSignInAt: now, lastSeenAt: now });
    },
    async seen(userId, at) {
      acts.set(userId, { ...act(userId), lastSeenAt: at });
    },
    activity: async () => new Map(acts),
    async save(userId, patch) {
      const next = { ...row(userId), ...patch };
      rows.set(userId, next);
      return structuredClone(next);
    },
  };
}

export function prefsRoutes(
  app: FastifyInstance,
  store: PrefsStore,
  viewer: (req: FastifyRequest) => Promise<Viewer>,
) {
  app.get('/api/prefs', async (req) => store.get((await viewer(req)).userId));

  app.put('/api/prefs', async (req, reply) => {
    const parsed = prefsInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: parsed.error.issues[0]?.message ?? 'Invalid settings.' });
    }
    return store.save((await viewer(req)).userId, parsed.data);
  });
}

/** Postgres-backed store (table user_prefs). */
export async function dbPrefsStore(): Promise<PrefsStore> {
  const { db, schema } = await import('../db/client');
  const { eq, sql } = await import('drizzle-orm');
  const t = schema.userPrefs;
  const get = async (userId: number): Promise<Prefs> => {
    const [r] = await db.select().from(t).where(eq(t.userId, userId));
    return r
      ? { loginCount: r.loginCount, layout: r.layout as Layout, tour: r.tour as TourPrefs }
      : EMPTY();
  };
  return {
    get,
    async signIn(userId) {
      await db
        .insert(t)
        .values({ userId, loginCount: 1, lastSignInAt: new Date(), lastSeenAt: new Date() })
        .onConflictDoUpdate({
          target: t.userId,
          set: {
            loginCount: sql`${t.loginCount} + 1`,
            lastSignInAt: new Date(),
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          },
        });
    },
    async seen(userId, at) {
      await db
        .insert(t)
        .values({ userId, lastSeenAt: at })
        .onConflictDoUpdate({ target: t.userId, set: { lastSeenAt: at } });
    },
    async activity() {
      const rows = await db
        .select({
          userId: t.userId,
          loginCount: t.loginCount,
          lastSignInAt: t.lastSignInAt,
          lastSeenAt: t.lastSeenAt,
        })
        .from(t);
      return new Map(rows.map(({ userId, ...a }) => [userId, a]));
    },
    async save(userId, patch) {
      const set = { ...patch, updatedAt: new Date() };
      await db
        .insert(t)
        .values({ userId, ...set })
        .onConflictDoUpdate({ target: t.userId, set });
      return get(userId);
    },
  };
}
