import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE = 'admin_session';
const sessions = new Map();

export function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token || !sessions.has(token)) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
  }
  next();
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

export function checkCredentials(login, password) {
  return login === config.adminLogin && password === config.adminPassword;
}

export { COOKIE };
