// Pulse account: sign in with a Nural work email and a password (2026-11-02), beside Sign in with
// Bitrix24. Only work emails of the allowed domains (SIGNUP_EMAIL_DOMAINS, nuraltech.com), and
// only an email that belongs to an active Bitrix24 user: the account is that user, so their role
// and data scope (NFR-4) are the same as with Bitrix24. Creating an account or a new password
// needs a 6-digit code mailed to that address (Microsoft 365), so nobody can claim a colleague's
// email. Passwords are scrypt hashes; 5 wrong passwords lock the account for 15 minutes.
// Task changes still need the person's Bitrix24 sign-in (their own token), as before.
// Admins can also create an account in the People directory (no mail needed): they set a
// temporary password, and the person must choose their own at the first sign-in with it.
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface Account {
  userId: number;
  email: string;
  hash: string;
  failed: number;
  lockedUntil: Date | null;
  /** Set by an admin: the person must choose their own password at the next sign-in. */
  mustChange: boolean;
  lastSignInAt: Date | null;
}

export interface AccountStore {
  byEmail(email: string): Promise<Account | undefined>;
  byUser(userId: number): Promise<Account | undefined>;
  /** Creates or replaces the person's password; clears failed tries and the lock. */
  setPassword(userId: number, email: string, hash: string, mustChange?: boolean): Promise<void>;
  /** Removes the account: no more sign-in with a password. */
  remove(userId: number): Promise<void>;
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
    byUser: async (userId) => {
      const a = rows.get(userId);
      return a && { ...a };
    },
    async setPassword(userId, email, hash, mustChange = false) {
      for (const [id, r] of rows) if (r.email === email && id !== userId) rows.delete(id);
      const lastSignInAt = rows.get(userId)?.lastSignInAt ?? null;
      rows.set(userId, {
        userId,
        email,
        hash,
        failed: 0,
        lockedUntil: null,
        mustChange,
        lastSignInAt,
      });
    },
    async remove(userId) {
      rows.delete(userId);
    },
    async failed(userId, failed, lockedUntil) {
      const r = rows.get(userId);
      if (r) rows.set(userId, { ...r, failed, lockedUntil });
    },
    async succeeded(userId) {
      const r = rows.get(userId);
      if (r) rows.set(userId, { ...r, failed: 0, lockedUntil: null, lastSignInAt: new Date() });
    },
  };
}

/** Postgres-backed store (table local_accounts). */
export async function dbAccountStore(): Promise<AccountStore> {
  const { db, schema } = await import('../db/client');
  const { eq, and, ne } = await import('drizzle-orm');
  const t = schema.localAccounts;
  const toAccount = (r: typeof t.$inferSelect | undefined): Account | undefined =>
    r && {
      userId: r.userId,
      email: r.email,
      hash: r.passwordHash,
      failed: r.failedCount,
      lockedUntil: r.lockedUntil,
      mustChange: r.mustChange,
      lastSignInAt: r.lastSignInAt,
    };
  return {
    byEmail: async (email) => toAccount((await db.select().from(t).where(eq(t.email, email)))[0]),
    byUser: async (userId) => toAccount((await db.select().from(t).where(eq(t.userId, userId)))[0]),
    async remove(userId) {
      await db.delete(t).where(eq(t.userId, userId));
    },
    async setPassword(userId, email, hash, mustChange = false) {
      // An email belongs to one person: a stale row of someone else with it goes.
      await db.delete(t).where(and(eq(t.email, email), ne(t.userId, userId)));
      const set = {
        email,
        passwordHash: hash,
        mustChange,
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
    const bad = badPassword(password, email);
    if (bad) return reply.code(400).send({ error: bad });
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

  /** The account if the password is right; else the reply (wrong, locked) has been sent. */
  async function check(req: FastifyRequest, reply: FastifyReply, email: string, password: string) {
    const acc = email ? await opts.store.byEmail(email) : undefined;
    if (!acc) {
      await checkPassword(password, await DUMMY);
      await reply.code(401).send({ error: 'Email or password is wrong.' });
      return null;
    }
    const t = now();
    if (acc.lockedUntil && acc.lockedUntil.getTime() > t) {
      const mins = Math.ceil((acc.lockedUntil.getTime() - t) / 60_000);
      await reply.code(429).send({
        error: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or set a new password with Forgot password.`,
      });
      return null;
    }
    if (!(await checkPassword(password, acc.hash))) {
      const failed = acc.failed + 1;
      const lock = failed >= LOCK_AFTER ? new Date(t + LOCK_MINUTES * 60_000) : null;
      await opts.store.failed(acc.userId, lock ? 0 : failed, lock);
      req.log.warn({ userId: acc.userId, locked: !!lock }, 'wrong Pulse password');
      await reply.code(401).send({ error: 'Email or password is wrong.' });
      return null;
    }
    // Someone who left (inactive in Bitrix24) cannot sign in any more.
    const user = await userById(acc.userId);
    if (!user?.active) {
      req.log.warn({ userId: acc.userId }, 'Pulse sign-in refused: not an active portal user');
      await reply.code(403).send({ error: 'This account is not active in Nural Bitrix24.' });
      return null;
    }
    return { acc, user };
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_PASSWORD) : '');

  // 3. Email and password. A temporary password from an admin answers { change: true } and no
  // session: the person chooses their own first (4).
  app.post('/api/auth/password-login', async (req, reply) => {
    if (!jsonOnly(req, reply)) return reply;
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const ok = await check(req, reply, normEmail(body.email), str(body.password));
    if (!ok) return reply;
    if (ok.acc.mustChange) return { change: true };
    await opts.store.succeeded(ok.acc.userId);
    await opts.signIn(reply, ok.user);
    return { ok: true };
  });

  // 4. A new password in place of the current one (after a temporary one), then signed in.
  app.post('/api/auth/password-change', async (req, reply) => {
    if (!jsonOnly(req, reply)) return reply;
    const body = (req.body ?? {}) as {
      email?: unknown;
      password?: unknown;
      newPassword?: unknown;
    };
    const email = normEmail(body.email);
    const next = typeof body.newPassword === 'string' ? body.newPassword : '';
    const bad = badPassword(next, email);
    if (bad) return reply.code(400).send({ error: bad });
    const current = str(body.password);
    if (next === current) {
      return reply.code(400).send({ error: 'Choose a new password, not the one you were given.' });
    }
    const ok = await check(req, reply, email, current);
    if (!ok) return reply;
    await opts.store.setPassword(ok.acc.userId, ok.acc.email, await hashPassword(next));
    await opts.store.succeeded(ok.acc.userId);
    await opts.signIn(reply, ok.user);
    req.log.info({ userId: ok.acc.userId }, 'Pulse password changed');
    return { ok: true };
  });
}

/** Why a password cannot be used, or null. */
export function badPassword(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return `Use a password of at least ${MIN_PASSWORD} characters.`;
  }
  if (normEmail(password) === email) return 'Do not use your email as the password.';
  return null;
}

export interface AdminAccountOptions {
  store: AccountStore;
  domains: string[];
  users: () => Promise<Iterable<PortalUser>>;
  /** The person asking: only admins (the admin right) manage accounts. */
  viewer: (req: FastifyRequest) => Promise<{ admin: boolean; userId: number }>;
}

/**
 * Admins (People directory › Edit person): a person's Pulse account, a temporary password (the
 * person must choose their own at the first sign-in), or removing the account. No mail needed.
 */
export function accountAdminRoutes(app: FastifyInstance, opts: AdminAccountOptions) {
  const domainText = opts.domains.map((d) => `@${d}`).join(' or ');
  const target = async (req: FastifyRequest, reply: FastifyReply) => {
    const me = await opts.viewer(req);
    if (!me.admin) {
      await reply.code(403).send({ error: 'Only admins manage Pulse accounts.' });
      return null;
    }
    const id = Number((req.params as { id?: string }).id);
    let user: PortalUser | undefined;
    for (const u of await opts.users()) if (u.id === id) user = u;
    if (!user) {
      await reply.code(404).send({ error: 'No such person.' });
      return null;
    }
    const email = normEmail(user.email);
    const domainOk = email.includes('@') && opts.domains.includes(email.split('@').pop()!);
    return { me, user, email, domainOk };
  };

  app.get('/api/accounts/:id', async (req, reply) => {
    const t = await target(req, reply);
    if (!t) return reply;
    const acc = await opts.store.byUser(t.user.id);
    return {
      email: t.email || null,
      allowed: t.domainOk && t.user.active,
      domains: opts.domains,
      account: acc
        ? {
            email: acc.email,
            mustChange: acc.mustChange,
            locked: !!acc.lockedUntil && acc.lockedUntil.getTime() > Date.now(),
            lastSignInAt: acc.lastSignInAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  app.put('/api/accounts/:id', async (req, reply) => {
    const t = await target(req, reply);
    if (!t) return reply;
    if (!t.user.active) {
      return reply.code(400).send({ error: `${t.user.name} is not active in Bitrix24.` });
    }
    if (!t.domainOk) {
      return reply
        .code(400)
        .send({ error: `${t.user.name} has no ${domainText} email in Bitrix24.` });
    }
    const password = (req.body as { password?: unknown } | null)?.password;
    const bad = typeof password === 'string' ? badPassword(password, t.email) : 'Give a password.';
    if (bad) return reply.code(400).send({ error: bad });
    await opts.store.setPassword(t.user.id, t.email, await hashPassword(password as string), true);
    req.log.info(
      { by: t.me.userId, userId: t.user.id },
      'Pulse temporary password set by an admin',
    );
    return { ok: true, email: t.email };
  });

  app.delete('/api/accounts/:id', async (req, reply) => {
    const t = await target(req, reply);
    if (!t) return reply;
    await opts.store.remove(t.user.id);
    req.log.info({ by: t.me.userId, userId: t.user.id }, 'Pulse account removed by an admin');
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
