// Sign-in routes and the guard on /api (SRS 7, Auth). AUTH=off (local dev) lets everything
// through; AUTH=bitrix needs a session cookie on every /api call except /api/auth/*.
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authorizeUrl, exchangeCode, portalUserId, type TokenResponse } from './bitrixOAuth';
import {
  cookie,
  parseCookies,
  readSession,
  SESSION_COOKIE,
  SESSION_DAYS,
  sign,
  STATE_COOKIE,
  verify,
  type Session,
} from './session';

export interface AuthOptions {
  mode: 'off' | 'bitrix';
  clientId?: string;
  clientSecret?: string;
  sessionSecret?: string;
  /** e.g. https://nural.bitrix24.in */
  portalOrigin: string;
  /** Secure cookies (HTTPS). */
  secure: boolean;
  /** Public URL of /api/auth/callback, sent as redirect_uri (e.g. https://host/api/auth/callback). */
  callbackUrl?: string;
  /** An active portal user from our users table. */
  findUser: (id: number) => Promise<{ id: number; name: string; active: boolean } | undefined>;
  /** Defaults to the real code exchange; tests pass a stub. */
  exchange?: (code: string) => Promise<TokenResponse>;
  now?: () => number;
}

const STATE_TTL_SEC = 10 * 60;

const isOpen = (url: string) => !url.startsWith('/api/') || url.startsWith('/api/auth/');

export function authRoutes(app: FastifyInstance, opts: AuthOptions) {
  const now = opts.now ?? Date.now;
  const secret = opts.sessionSecret ?? '';
  const session = (req: FastifyRequest): Session | null =>
    opts.mode === 'off'
      ? { userId: 0, name: 'Local', exp: Infinity }
      : readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], secret, now());

  app.addHook('onRequest', async (req, reply) => {
    if (opts.mode === 'off' || isOpen(req.url)) return;
    if (!session(req)) return reply.code(401).send({ error: 'Sign in required' });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const s = session(req);
    if (!s) return reply.code(401).send({ error: 'Sign in required' });
    return { id: s.userId, name: s.name, auth: opts.mode };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.header('Set-Cookie', cookie(SESSION_COOKIE, '', 0, opts.secure));
    return { ok: true };
  });

  if (opts.mode === 'off') return;
  const clientId = opts.clientId ?? '';
  const exchange =
    opts.exchange ?? ((code: string) => exchangeCode(code, clientId, opts.clientSecret ?? ''));

  app.get('/api/auth/login', async (_req, reply) => {
    const state = randomBytes(16).toString('base64url');
    reply.header(
      'Set-Cookie',
      cookie(STATE_COOKIE, sign({ state }, secret), STATE_TTL_SEC, opts.secure),
    );
    return reply.redirect(authorizeUrl(opts.portalOrigin, clientId, state, opts.callbackUrl));
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    '/api/auth/callback',
    async (req, reply) => {
      const deny = (why: string) => {
        req.log.warn({ why }, 'sign-in refused');
        return refuse(reply, opts.secure);
      };
      const saved = verify<{ state: string }>(
        parseCookies(req.headers.cookie)[STATE_COOKIE],
        secret,
      );
      const { code, state } = req.query;
      if (!code || !state || saved?.state !== state) return deny('state mismatch');
      const userId = portalUserId(await exchange(code), opts.portalOrigin);
      if (!userId) return deny('token not for this portal');
      const user = await opts.findUser(userId);
      if (!user?.active) return deny(`user ${userId} not an active portal user`);
      const s: Session = {
        userId: user.id,
        name: user.name,
        exp: now() + SESSION_DAYS * 86_400_000,
      };
      reply.header('Set-Cookie', [
        cookie(SESSION_COOKIE, sign(s, secret), SESSION_DAYS * 86_400, opts.secure),
        cookie(STATE_COOKIE, '', 0, opts.secure),
      ]);
      return reply.redirect('/');
    },
  );
}

function refuse(reply: FastifyReply, secure: boolean) {
  return reply
    .code(403)
    .header('Set-Cookie', cookie(STATE_COOKIE, '', 0, secure))
    .type('text/html')
    .send(
      '<!doctype html><meta charset="utf-8"><title>Sign-in refused</title>' +
        '<p style="font-family:sans-serif">Sign-in was refused. Use your Nural Bitrix24 account, ' +
        'then <a href="/api/auth/login">try again</a>.</p>',
    );
}
