import { Router } from 'express';
import crypto from 'crypto';
import { query, touchCompany } from '../db.js';
import { h, badRequest, HttpError } from '../util.js';

const router = Router();

const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const REDIRECT_URI = `${BASE_URL}/api/integrations/microsoft/callback`;
const SCOPES = 'offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite';
const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';

const configured = Boolean(CLIENT_ID && CLIENT_SECRET);
const pendingStates = new Map(); // state -> expiry (CSRF protection for the OAuth flow)

async function getSetting(key) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, value]
  );
}

async function exchangeToken(params) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: SCOPES,
      ...params,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, `Microsoft token error: ${data.error_description || data.error}`);
  return data;
}

async function saveTokens(tokens, account) {
  await setSetting('microsoft', {
    account,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in - 60) * 1000,
  });
}

// Returns a valid access token, refreshing through the stored refresh token when expired.
async function getAccessToken() {
  const stored = await getSetting('microsoft');
  if (!stored) throw new HttpError(400, 'Office 365 is not connected. Connect it in Settings.');
  if (Date.now() < stored.expires_at) return { token: stored.access_token, account: stored.account };
  const refreshed = await exchangeToken({ grant_type: 'refresh_token', refresh_token: stored.refresh_token });
  await saveTokens({ ...refreshed, refresh_token: refreshed.refresh_token || stored.refresh_token }, stored.account);
  return { token: refreshed.access_token, account: stored.account };
}

async function graphFetch(path, options = {}) {
  const { token } = await getAccessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (res.status === 202 || res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, `Microsoft Graph error: ${data.error?.message || res.statusText}`);
  return data;
}

// --- OAuth flow ---

router.get('/integrations/microsoft/status', h(async (req, res) => {
  const stored = configured ? await getSetting('microsoft') : null;
  res.json({
    configured,
    connected: Boolean(stored),
    account: stored?.account || null,
    redirect_uri: REDIRECT_URI,
  });
}));

router.get('/integrations/microsoft/connect', h(async (req, res) => {
  if (!configured) throw badRequest('Set MS_CLIENT_ID and MS_CLIENT_SECRET to enable the Office 365 integration.');
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  const url = `${AUTH_BASE}/authorize?` + new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPES,
    state,
  });
  res.redirect(url);
}));

router.get('/integrations/microsoft/callback', h(async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) return res.redirect(`/settings?ms_error=${encodeURIComponent(error_description || error)}`);
  const expiry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!expiry || expiry < Date.now()) return res.redirect('/settings?ms_error=Invalid+or+expired+state');

  const tokens = await exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI });
  await setSetting('microsoft', {
    account: null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in - 60) * 1000,
  });
  const me = await graphFetch('/me');
  const account = me.mail || me.userPrincipalName;
  const stored = await getSetting('microsoft');
  await setSetting('microsoft', { ...stored, account });
  res.redirect('/settings?ms_connected=1');
}));

router.post('/integrations/microsoft/disconnect', h(async (req, res) => {
  await query(`DELETE FROM app_settings WHERE key = 'microsoft'`, []);
  res.json({ ok: true });
}));

// --- Email ---

// POST /api/email/send — send via Office 365 and log an email activity
router.post('/email/send', h(async (req, res) => {
  const { to, subject, body, company_id, contact_id, log = true } = req.body;
  if (!to || !subject) throw badRequest('to and subject are required');

  const { account } = await getAccessToken();
  await graphFetch('/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: body || '' },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });

  if (log && (company_id || contact_id)) {
    let companyId = company_id || null;
    if (!companyId && contact_id) {
      const { rows } = await query('SELECT company_id FROM contacts WHERE id = $1', [contact_id]);
      companyId = rows[0]?.company_id;
    }
    if (companyId) {
      await query(
        `INSERT INTO activities (company_id, contact_id, type, outcome, body)
         VALUES ($1, $2, 'email', 'sent', $3)`,
        [companyId, contact_id || null, `To ${to} — ${subject}\n\n${(body || '').slice(0, 2000)}`]
      );
      await touchCompany(companyId);
      if (contact_id) {
        await query(`UPDATE contacts SET last_contacted_at = now() WHERE id = $1`, [contact_id]);
      }
    }
  }
  res.json({ ok: true, from: account });
}));

// --- Calendar ---

// GET /api/calendar/today — today's Office 365 calendar events
router.get('/calendar/today', h(async (req, res) => {
  const stored = configured ? await getSetting('microsoft') : null;
  if (!stored) return res.json({ connected: false, events: [] });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const data = await graphFetch(
    `/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}` +
    `&$orderby=start/dateTime&$top=20&$select=subject,start,end,location,webLink,organizer`
  );
  res.json({
    connected: true,
    events: (data.value || []).map((e) => ({
      subject: e.subject,
      start: e.start?.dateTime ? `${e.start.dateTime}Z` : null,
      end: e.end?.dateTime ? `${e.end.dateTime}Z` : null,
      location: e.location?.displayName || null,
      link: e.webLink || null,
      organizer: e.organizer?.emailAddress?.name || null,
    })),
  });
}));

// --- Email sync: pull recent emails matching CRM contacts into activities ---

// GET /api/email/sync — pull last N days of sent+received mail, match to contacts, log as activities
router.post('/email/sync', h(async (req, res) => {
  const days = Number(req.body?.days || 7);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const data = await graphFetch(
    `/me/messages?$filter=receivedDateTime ge ${since}` +
    `&$select=subject,from,toRecipients,receivedDateTime,bodyPreview,webLink,isDraft` +
    `&$orderby=receivedDateTime desc&$top=100`
  );

  const emails = (data?.value || []).filter((m) => !m.isDraft);
  let synced = 0;

  for (const email of emails) {
    const addrs = [
      email.from?.emailAddress?.address,
      ...(email.toRecipients || []).map((r) => r.emailAddress?.address),
    ].filter(Boolean).map((a) => a.toLowerCase());

    for (const addr of addrs) {
      const { rows: contacts } = await query(
        `SELECT c.id, c.company_id FROM contacts c WHERE lower(c.email) = $1 LIMIT 1`, [addr]
      );
      if (!contacts.length) continue;
      const { id: contactId, company_id: companyId } = contacts[0];

      // Skip if already logged (match on subject + date)
      const { rows: existing } = await query(
        `SELECT 1 FROM activities WHERE contact_id = $1 AND type = 'email'
         AND occurred_at::date = $2::date AND body LIKE $3 LIMIT 1`,
        [contactId, email.receivedDateTime, `%${email.subject?.slice(0, 40) || ''}%`]
      );
      if (existing.length) continue;

      const direction = email.from?.emailAddress?.address?.toLowerCase() === addr ? 'Received' : 'Sent';
      await query(
        `INSERT INTO activities (company_id, contact_id, type, outcome, body, occurred_at)
         VALUES ($1, $2, 'email', $3, $4, $5)`,
        [companyId, contactId, direction,
          `${email.subject || '(no subject)'}\n\n${email.bodyPreview || ''}`,
          email.receivedDateTime]
      );
      await touchCompany(companyId, new Date(email.receivedDateTime));
      synced++;
      break; // only log once per email even if multiple CRM contacts match
    }
  }

  res.json({ ok: true, synced, scanned: emails.length });
}));

// --- Calendar: create event in Outlook from CRM ---

// POST /api/calendar/events — create a calendar event and log it as a meeting activity
router.post('/calendar/events', h(async (req, res) => {
  const { subject, body, start, end, attendees = [], company_id, contact_id, location } = req.body;
  if (!subject || !start || !end) throw badRequest('subject, start, end are required');

  const event = await graphFetch('/me/events', {
    method: 'POST',
    body: JSON.stringify({
      subject,
      body: { contentType: 'Text', content: body || '' },
      start: { dateTime: start, timeZone: 'UTC' },
      end: { dateTime: end, timeZone: 'UTC' },
      location: location ? { displayName: location } : undefined,
      attendees: attendees.map((email) => ({
        emailAddress: { address: email }, type: 'required',
      })),
    }),
  });

  // Log as meeting activity in CRM
  if (company_id || contact_id) {
    let companyId = company_id || null;
    if (!companyId && contact_id) {
      const { rows } = await query('SELECT company_id FROM contacts WHERE id = $1', [contact_id]);
      companyId = rows[0]?.company_id;
    }
    if (companyId) {
      await query(
        `INSERT INTO activities (company_id, contact_id, type, outcome, body, occurred_at)
         VALUES ($1, $2, 'meeting', 'scheduled', $3, $4)`,
        [companyId, contact_id || null, `${subject}${location ? ' @ ' + location : ''}`, start]
      );
      await touchCompany(companyId, new Date(start));
    }
  }

  res.status(201).json({ ok: true, event_id: event.id, webLink: event.webLink });
}));

// GET /api/calendar/events — upcoming events (next N days)
router.get('/calendar/events', h(async (req, res) => {
  const days = Number(req.query.days || 7);
  const stored = configured ? await getSetting('microsoft') : null;
  if (!stored) return res.json({ connected: false, events: [] });

  const start = new Date();
  const end = new Date(Date.now() + days * 86400000);
  const data = await graphFetch(
    `/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}` +
    `&$orderby=start/dateTime&$top=50` +
    `&$select=subject,start,end,location,webLink,organizer,attendees,bodyPreview`
  );

  res.json({
    connected: true,
    events: (data?.value || []).map((e) => ({
      id: e.id,
      subject: e.subject,
      start: e.start?.dateTime,
      end: e.end?.dateTime,
      location: e.location?.displayName || null,
      link: e.webLink || null,
      organizer: e.organizer?.emailAddress?.name || null,
      attendees: (e.attendees || []).map((a) => a.emailAddress?.address).filter(Boolean),
      preview: e.bodyPreview || null,
    })),
  });
}));

// DELETE /api/calendar/events/:id — cancel/delete an event
router.delete('/calendar/events/:id', h(async (req, res) => {
  await graphFetch(`/me/events/${req.params.id}`, { method: 'DELETE' });
  res.json({ ok: true });
}));

export default router;
