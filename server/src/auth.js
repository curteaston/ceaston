import crypto from 'crypto';
import { Router } from 'express';

const APP_PASSWORD = process.env.APP_PASSWORD || '';
const API_KEY = process.env.API_KEY || '';
const COOKIE = 'crm_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Cookie-signing key derived from the password (changing the password invalidates sessions).
const signingKey = crypto.createHash('sha256')
  .update('hvac-crm:' + APP_PASSWORD + (process.env.APP_SECRET || ''))
  .digest();

export const authRequired = Boolean(APP_PASSWORD);
// Any auth at all (password for the UI, or API key for n8n).
const gateEnabled = Boolean(APP_PASSWORD || API_KEY);

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function makeToken() {
  const exp = Date.now() + MAX_AGE_MS;
  const sig = crypto.createHmac('sha256', signingKey).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}

function validToken(token) {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', signingKey).update(exp).digest('hex');
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function checkPassword(pw) {
  if (!APP_PASSWORD || !pw) return false;
  const a = Buffer.from(String(pw));
  const b = Buffer.from(APP_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isSecure(req) {
  return (process.env.APP_BASE_URL || '').startsWith('https')
    || req.secure
    || req.get('x-forwarded-proto') === 'https';
}

function providedKey(req) {
  return req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
}

// Gate for /api: allow when disabled, or with a valid API key (n8n) or session cookie (browser).
export function requireAuth(req, res, next) {
  if (!gateEnabled) return next();
  if (API_KEY && providedKey(req) === API_KEY) return next();
  if (APP_PASSWORD && validToken(readCookie(req, COOKIE))) return next();
  res.status(401).json({ error: 'Authentication required' });
}

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  res.json({
    auth_required: authRequired,
    authenticated: !authRequired || validToken(readCookie(req, COOKIE)),
  });
});

authRouter.post('/login', (req, res) => {
  if (!authRequired) return res.json({ ok: true }); // nothing to log into
  if (!checkPassword(req.body?.password)) {
    // Small delay to slow brute-force guessing.
    return setTimeout(() => res.status(401).json({ error: 'Incorrect password' }), 400);
  }
  res.cookie(COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(req),
    maxAge: MAX_AGE_MS,
    path: '/',
  });
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});
