import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { h, badRequest, notFound } from '../util.js';

const router = Router();
export const publicDialer = Router();

function configValue(key) {
  const value = String(process.env[key] || '').trim();
  if (!value || value.startsWith('your-') || value === '...') return '';
  return value;
}

function getConfig() {
  return {
    accountSid: configValue('TWILIO_ACCOUNT_SID'),
    apiKeySid: configValue('TWILIO_API_KEY_SID'),
    apiKeySecret: configValue('TWILIO_API_KEY_SECRET'),
    twimlAppSid: configValue('TWILIO_TWIML_APP_SID'),
    fromNumber: normalizePhone(configValue('TWILIO_FROM_NUMBER')),
  };
}

function missingConfigKeys(cfg = getConfig()) {
  return [
    !cfg.accountSid ? 'TWILIO_ACCOUNT_SID' : null,
    !cfg.apiKeySid ? 'TWILIO_API_KEY_SID' : null,
    !cfg.apiKeySecret ? 'TWILIO_API_KEY_SECRET' : null,
    !cfg.twimlAppSid ? 'TWILIO_TWIML_APP_SID' : null,
    !cfg.fromNumber ? 'TWILIO_FROM_NUMBER' : null,
  ].filter(Boolean);
}

function maskPhone(value) {
  const text = String(value || '');
  if (text.length <= 4) return text;
  return `${text.slice(0, 2)}******${text.slice(-4)}`;
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) {
    const digits = raw.replace(/[^\d]/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  }
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload, secret) {
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function signCallToken({ phone, companyId, contactId, secret }) {
  const payload = {
    phone,
    company_id: companyId || null,
    contact_id: contactId || null,
    exp: Date.now() + 5 * 60 * 1000,
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedPayload}.${signature}`;
}

function verifyCallToken(token, secret) {
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) return null;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const sig = Buffer.from(signature);
  const exp = Buffer.from(expected);
  if (sig.length !== exp.length || !crypto.timingSafeEqual(sig, exp)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function voiceToken({ cfg, identity }) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = 60 * 60;
  return signJwt({
    jti: `${cfg.apiKeySid}-${now}`,
    iss: cfg.apiKeySid,
    sub: cfg.accountSid,
    exp: now + ttl,
    grants: {
      identity,
      voice: {
        outgoing: { application_sid: cfg.twimlAppSid },
        incoming: { allow: false },
      },
    },
  }, cfg.apiKeySecret);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function resolveCallTarget({ contact_id, company_id }) {
  if (contact_id) {
    const { rows } = await query(
      `SELECT
         ct.id AS contact_id,
         ct.company_id,
         ct.name AS contact_name,
         ct.do_not_contact AS contact_do_not_contact,
         ct.not_interested AS contact_not_interested,
         ct.bad_fit AS contact_bad_fit,
         co.name AS company_name,
         co.do_not_contact AS company_do_not_contact,
         co.not_interested AS company_not_interested,
         co.bad_fit AS company_bad_fit,
         co.archived_at,
         co.suppression_reason
       FROM contacts ct
       JOIN companies co ON co.id = ct.company_id
       WHERE ct.id = $1`,
      [contact_id]
    );
    const target = rows[0];
    if (!target) throw notFound('Contact not found');
    if (company_id && Number(company_id) !== Number(target.company_id)) {
      throw badRequest('contact_id does not belong to company_id');
    }
    return target;
  }

  if (!company_id) throw badRequest('contact_id or company_id is required');
  const { rows } = await query(
    `SELECT
       co.id AS company_id,
       co.name AS company_name,
       co.do_not_contact AS company_do_not_contact,
       co.not_interested AS company_not_interested,
       co.bad_fit AS company_bad_fit,
       co.archived_at,
       co.suppression_reason
     FROM companies co
     WHERE co.id = $1`,
    [company_id]
  );
  if (!rows[0]) throw notFound('Company not found');
  return rows[0];
}

function blockedReason(target) {
  if (target.archived_at) return `Cannot call archived account: ${target.company_name}`;
  if (target.contact_do_not_contact || target.company_do_not_contact) {
    return target.suppression_reason || 'Call blocked because this record is marked do not contact.';
  }
  if (target.contact_not_interested || target.company_not_interested) {
    return target.suppression_reason || 'Call blocked because this record is marked not interested.';
  }
  if (target.contact_bad_fit || target.company_bad_fit) {
    return target.suppression_reason || 'Call blocked because this record is marked bad fit.';
  }
  return '';
}

function callTwiml({ to, from }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `<Dial callerId="${xmlEscape(from)}" answerOnBridge="true" timeout="30">`,
    `<Number>${xmlEscape(to)}</Number>`,
    '</Dial>',
    '</Response>',
  ].join('');
}

router.get('/status', h(async (req, res) => {
  const cfg = getConfig();
  const missing = missingConfigKeys(cfg);
  res.json({
    configured: missing.length === 0,
    mode: 'browser',
    missing_env: missing,
    from_number: cfg.fromNumber ? maskPhone(cfg.fromNumber) : null,
  });
}));

router.post('/token', h(async (req, res) => {
  const cfg = getConfig();
  const missing = missingConfigKeys(cfg);
  if (missing.length) {
    throw badRequest(`Twilio browser calling is not configured. Missing ${missing.join(', ')}.`);
  }
  res.json({
    token: voiceToken({ cfg, identity: 'crm-user' }),
    identity: 'crm-user',
    expires_in: 3600,
  });
}));

router.post('/authorize-call', h(async (req, res) => {
  const cfg = getConfig();
  const missing = missingConfigKeys(cfg);
  if (missing.length) {
    throw badRequest(`Twilio browser calling is not configured. Missing ${missing.join(', ')}.`);
  }
  const phone = normalizePhone(req.body?.phone);
  if (!phone) throw badRequest('phone must be a valid US or E.164 phone number');

  const target = await resolveCallTarget({
    contact_id: req.body?.contact_id || null,
    company_id: req.body?.company_id || null,
  });
  const reason = blockedReason(target);
  if (reason) throw badRequest(reason);

  res.json({
    ok: true,
    phone,
    dial_token: signCallToken({
      phone,
      companyId: target.company_id,
      contactId: target.contact_id || null,
      secret: cfg.apiKeySecret,
    }),
    contact_id: target.contact_id || null,
    company_id: target.company_id,
  });
}));

// Public Twilio webhook. Configure the TwiML App voice request URL to:
// https://your-crm-host/api/dialer/twiml
publicDialer.post('/twiml', expressBodyCompat, h(async (req, res) => {
  const cfg = getConfig();
  const to = normalizePhone(req.body?.To || req.query?.To);
  const callToken = verifyCallToken(req.body?.CallToken || req.query?.CallToken, cfg.apiKeySecret);
  if (!cfg.fromNumber || !to || !callToken || callToken.phone !== to) {
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Reject /></Response>');
    return;
  }
  res.type('text/xml').send(callTwiml({ to, from: cfg.fromNumber }));
}));

function expressBodyCompat(req, res, next) {
  if (req.body && Object.keys(req.body).length > 0) return next();
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    req.body = Object.fromEntries(new URLSearchParams(raw));
    next();
  });
}

export default router;
