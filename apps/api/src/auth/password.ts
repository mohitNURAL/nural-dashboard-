// Pulse account: sign in with a Nural work email and a password (2026-11-02), beside Sign in with
// Bitrix24. Only work emails of the allowed domains (SIGNUP_EMAIL_DOMAINS, nuraltech.com), and
// only an email that belongs to an active Bitrix24 user: the account is that user, so their role
// and data scope (NFR-4) are the same as with Bitrix24. Creating an account or a new password
// needs a 6-digit code mailed to that address (Microsoft 365), so nobody can claim a colleague's
// email. Passwords are scrypt hashes; 5 wrong passwords lock the account for 15 minutes.
// Task changes still need the person's Bitrix24 sign-in (their own token), as before.
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface Account {
  userId: number;
  email: string;
  hash: string;
  failed: number;
  lockedUntil: Date | null;
}

export interface AccountStore {
  byEmail(email: string): Promise<Account | undefined>;
  /** Creates or replaces the person's password; clears failed tries and the lock. */
  setPassword(userId: number, email: string, hash: string): Promise<void>;
  /** A wrong password: the new count of failed tries and the lock, if any. */
  failed(userId: number, failed: number, lockedUntil: Date | null): Promise<void>;
  /** A right password: clears failed tries and the lock, counts the sign-in time. */
  succeeded(userId: number): Promise<void>;
}

export interface PasswordMailer {
  connected: boolean;
  send(m: { to: string[]; subject: string; html: string }): Promise<void>;
}

export interface PortalUser {
  id: number;
  name: string;
  email?: string | null;
  active: boolean;
}

export interface PasswordOptions {
  store: AccountStore;
  mailer: PasswordMailer;
  /** Allowed email domains, lower case (e.g. ['nuraltech.com']). */
  domains: string[];
  users: () => Promise<Iterable<PortalUser>>;
  /** Sets the session cookie and counts the sign-in. */
  signIn: (reply: FastifyReply, user: { id: number; name: string }) => Promise<void>;
  now?: () => number;
}

export const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200;
const CODE_MINUTES = 10;
const CODE_TRIES = 5;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
/** One code a minute and 5 an hour per email; 300 code mails an hour in all. */
const RESEND_MS = 60_000;
const CODES_PER_HOUR = 5;
const ALL_CODES_PER_HOUR = 300;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, SCRYPT, (e, k) =>
      e ? reject(e) : resolve(k),
    ),
  );

/** `scrypt$<salt>$<hash>`, base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${(await derive(password, salt)).toString('base64url')}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await derive(password, Buffer.from(salt, 'base64url'));
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Same work as a real check, so a missing account answers as slowly as a wrong password. */
const DUMMY = hashPassword(randomBytes(12).toString('hex'));

export const normEmail = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

const sha = (s: string) => createHash('sha256').update(s).digest();

/** In-memory store (tests, and local runs without a database). */
export function memoryAccountStore(): AccountStore {
  const rows = new Map<number, Account>();
  return {
    byEmail: async (email) => {
      const a = [...rows.values()].find((r) => r.email === email);
      return a && { ...a };
    },
    async setPassword(userId, email, hash) {
      for (const [id, r] of rows) if (r.email === email && id !== userId) rows.delete(id);
      rows.set(userId, { userId, email, hash, failed: 0, lockedUntil: null });
    },
    async failed(userId, failed, lockedUntil) {
      const r = rows.get(userId);
      if (r) rows.set(userId, { ...r, failed, lockedUntil });
    },
    async succeeded(userId) {
      const r = rows.get(userId);
      if (r) rows.set(userId, { ...r, failed: 0, lockedUntil: null });
    },
  };
}

/** Postgres-backed store (table local_accounts). */
export async function dbAccountStore(): Promise<AccountStore> {
  const { db, schema } = await import('../db/client');
  const { eq, and, ne } = await import('drizzle-orm');
  const t = schema.localAccounts;
  return {
    async byEmail(email) {
      const [r] = await db.select().from(t).where(eq(t.email, email));
      return (
        r && {
          userId: r.userId,
          email: r.email,
          hash: r.passwordHash,
          failed: r.failedCount,
          lockedUntil: r.lockedUntil,
        }
      );
    },
    async setPassword(userId, email, hash) {
      // An email belongs to one person: a stale row of someone else with it goes.
      await db.delete(t).where(and(eq(t.email, email), ne(t.userId, userId)));
      const set = {
        email,
        passwordHash: hash,
        failedCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      };
      await db
        .insert(t)
        .values({ userId, ...set })
        .onConflictDoUpdate({ target: t.userId, set });
    },
    async failed(userId, failed, lockedUntil) {
      await db.update(t).set({ failedCount: failed, lockedUntil }).where(eq(t.userId, userId));
    },
    async succeeded(userId) {
      await db
        .update(t)
        .set({ failedCount: 0, lockedUntil: null, lastSignInAt: new Date() })
        .where(eq(t.userId, userId));
    },
  };
}

interface Code {
  hash: Buffer;
  userId: number;
  exp: number;
  tries: number;
}

export function passwordRoutes(app: FastifyInstance, opts: PasswordOptions) {
  const now = opts.now ?? Date.now;
  // Codes live only in memory: a restart just means asking for a new one.
  const codes = new Map<string, Code>();
  const sent = new Map<string, number[]>();
  let allSent: number[] = [];

  const allowed = (email: string) => {
    const at = email.lastIndexOf('@');
    return (
      at > 0 &&
      email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      opts.domains.includes(email.slice(at + 1))
    );
  };
  const domainText = opts.domains.map((d) => `@${d}`).join(' or ');

  const userByEmail = async (email: string) => {
    for (const u of await opts.users()) if (normEmail(u.email) === email) return u;
    return undefined;
  };
  const userById = async (id: number) => {
    for (const u of await opts.users()) if (u.id === id) return u;
    return undefined;
  };

  // Form posts from other sites cannot send JSON, so these accept only JSON (no sign-in CSRF).
  const jsonOnly = (req: FastifyRequest, reply: FastifyReply) => {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      void reply.code(415).send({ error: 'Send JSON.' });
      return false;
    }
    return true;
  };

  // 1. A code to the work email, to create an account or set a new password.
  app.post('/api/auth/code', async (req, reply) => {
    if (!jsonOnly(req, reply)) return reply;
    const email = normEmail((req.body as { email?: unknown } | null)?.email);
    if (!allowed(email)) {
      return reply.code(400).send({ error: `Use your Nural work email (${domainText}).` });
    }
    if (!opts.mailer.connected) {
      return reply
        .code(503)
        .send({ error: 'Email is not set up on this server yet. Sign in with Bitrix24 for now.' });
    }
    const t = now();
    const mine = (sent.get(email) ?? []).filter((x) => t - x < 3_600_000);
    allSent = allSent.filter((x) => t - x < 3_600_000);
    if (mine.length && t - mine[mine.length - 1]! < RESEND_MS) {
      return reply
        .code(429)
        .send({ error: 'A code was just sent. Wait a minute before asking again.' });
    }
    if (mine.length >= CODES_PER_HOUR || allSent.length >= ALL_CODES_PER_HOUR) {
      return reply.code(429).send({ error: 'Too many codes asked for. Try again in an hour.' });
    }
    // The same answer whether or not the email is a Bitrix24 user, so nobody can probe the list.
    const answer = {
      ok: true,
      message: `If ${email} is an active Nural Bitrix24 account, a 6-digit code is on its way. It works for ${CODE_MINUTES} minutes.`,
    };
    const user = await userByEmail(email);
    if (!user?.active) {
      req.log.info('sign-up code asked for an email that is not an active portal user');
      return answer;
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    codes.set(email, {
      hash: sha(code),
      userId: user.id,
      exp: t + CODE_MINUTES * 60_000,
      tries: 0,
    });
    sent.set(email, [...mine, t]);
    allSent.push(t);
    try {
      await opts.mailer.send({
        to: [email],
        subject: `${code} is your Nural Pulse code`,
        html: codeMail(user.name, code),
      });
    } catch (e) {
      codes.delete(email);
      req.log.error({ err: (e as Error).message }, 'could not mail a sign-up code');
      return reply
        .code(502)
        .send({ error: 'The code mail could not be sent. Try again in a minute.' });
    }
    return answer;
  });

  // 2. The code and a password: creates the account (or sets the new password) and signs in.
  app.post('/api/auth/password', async (req, reply) => {
    if (!jsonOnly(req, reply)) return reply;
    const body = (req.body ?? {}) as { email?: unknown; code?: unknown; password?: unknown };
    const email = normEmail(body.email);
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      return reply
        .code(400)
        .send({ error: `Use a password of at least ${MIN_PASSWORD} characters.` });
    }
    if (normEmail(password) === email) {
      return reply.code(400).send({ error: 'Do not use your email as the password.' });
    }
    const c = codes.get(email);
    const wrong = () =>
      reply.code(400).send({ error: 'That code is wrong or has expired. Ask for a new one.' });
    if (!c || c.exp < now()) {
      codes.delete(email);
      return wrong();
    }
    const given = sha(code);
    if (!/^\d{6}$/.test(code) || !timingSafeEqual(given, c.hash)) {
      if (++c.tries >= CODE_TRIES) codes.delete(email);
      return wrong();
    }
    codes.delete(email);
    const user = await userById(c.userId);
    if (!user?.active) return wrong();
    await opts.store.setPassword(user.id, email, await hashPassword(password));
    await opts.signIn(reply, user);
    req.log.info({ userId: user.id }, 'Pulse password set');
    return { ok: true };
  });

  // 3. Email and password.
  app.post('/api/auth/password-login', async (req, reply) => {
    if (!jsonOnly(req, reply)) return reply;
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const email = normEmail(body.email);
    const password = typeof body.password === 'string' ? body.password.slice(0, MAX_PASSWORD) : '';
    const no = () => reply.code(401).send({ error: 'Email or password is wrong.' });
    const acc = email ? await opts.store.byEmail(email) : undefined;
    if (!acc) {
      await checkPassword(password, await DUMMY);
      return no();
    }
    const t = now();
    if (acc.lockedUntil && acc.lockedUntil.getTime() > t) {
      const mins = Math.ceil((acc.lockedUntil.getTime() - t) / 60_000);
      return reply.code(429).send({
        error: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or set a new password with Forgot password.`,
      });
    }
    if (!(await checkPassword(password, acc.hash))) {
      const failed = acc.failed + 1;
      const lock = failed >= LOCK_AFTER ? new Date(t + LOCK_MINUTES * 60_000) : null;
      await opts.store.failed(acc.userId, lock ? 0 : failed, lock);
      req.log.warn({ userId: acc.userId, locked: !!lock }, 'wrong Pulse password');
      return no();
    }
    // Someone who left (inactive in Bitrix24) cannot sign in any more.
    const user = await userById(acc.userId);
    if (!user?.active) {
      req.log.warn({ userId: acc.userId }, 'Pulse sign-in refused: not an active portal user');
      return reply.code(403).send({ error: 'This account is not active in Nural Bitrix24.' });
    }
    await opts.store.succeeded(acc.userId);
    await opts.signIn(reply, user);
    return { ok: true };
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function codeMail(name: string, code: string) {
  return (
    '<div style="font-family:Segoe UI,Arial,sans-serif;color:#231f20;max-width:480px">' +
    `<p>Hi ${esc(name.split(' ')[0] ?? name)},</p>` +
    '<p>Your Nural Pulse code is:</p>' +
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#18244e;margin:8px 0 16px">${code}</p>` +
    `<p>It works for ${CODE_MINUTES} minutes. Enter it on the Pulse sign-in page to set your password.</p>` +
    '<p style="color:#6b6567;font-size:13px">If you did not ask for this, ignore this mail: nothing changes without the code.</p>' +
    '</div>'
  );
}
