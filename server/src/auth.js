// Dashboard roles (SRS §3): "viewer" reads everything, "admin" (Pipeline admin)
// may also run the Missing Value write-back. Users come from DASHBOARD_USERS.

const DEV_USER = { name: 'local-dev', role: 'admin' };

export function createAuth(users, { log = console } = {}) {
  if (!users) log.warn('[auth] DASHBOARD_USERS not set — every request is treated as admin "local-dev". Do not run like this in production.');
  const byToken = new Map((users ?? []).map((u) => [u.token, { name: u.name, role: u.role === 'admin' ? 'admin' : 'viewer' }]));

  function authenticate(req, res, next) {
    if (!users) {
      req.user = DEV_USER;
      return next();
    }
    // EventSource cannot send headers, so the live stream alone accepts ?access_token=.
    const header = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const token = header || (req.path === '/stream' ? String(req.query.access_token || '') : '');
    const user = byToken.get(token);
    if (!user) return res.status(401).json({ error: 'Sign in required' });
    req.user = user;
    next();
  }

  function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Pipeline admin role required' });
    next();
  }

  return { authenticate, requireAdmin };
}
