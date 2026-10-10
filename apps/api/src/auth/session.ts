// Signed cookies for the sign-in session (SRS 7, Auth). No session table: the cookie holds
// { userId, name, exp } and an HMAC-SHA256 over it; a changed SESSION_SECRET signs everyone out.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'nural_session';
export const STATE_COOKIE = 'nural_oauth_state';
export const SESSION_DAYS = 7;

export interface Session {
  userId: number;
  name: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

const mac = (secret: string, body: string) =>
  createHmac('sha256', secret).update(body).digest('base64url');

/** `<base64url json>.<base64url hmac>` */
export function sign(value: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${mac(secret, body)}`;
}

/** The signed value, or null when the signature does not match or the text is malformed. */
export function verify<T>(token: string | undefined, secret: string): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const got = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(secret, body));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function readSession(token: string | undefined, secret: string, now = Date.now()) {
  const s = verify<Session>(token, secret);
  return s && typeof s.userId === 'number' && s.exp > now ? s : null;
}

/** Cookie header → { name: value }. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    try {
      out[key] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      // A malformed value is ignored, as if the cookie were absent.
    }
  }
  return out;
}

/** Set-Cookie value: HttpOnly, SameSite=Lax, Path=/, Secure on HTTPS. maxAge 0 clears it. */
export function cookie(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
