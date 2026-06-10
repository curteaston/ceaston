require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  TWILIO_TWIML_APP_SID,
  GHL_API_KEY,
  GHL_LOCATION_ID,
  GHL_USER_ID,
  PORT = 3000
} = process.env;

const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

// ── Twilio Access Token ───────────────────────────────────────────────────────
// Generates a short-lived JWT so the browser can make/receive calls via Twilio
app.post('/api/token', (req, res) => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY || !TWILIO_API_SECRET || !TWILIO_TWIML_APP_SID) {
    return res.status(503).json({ error: 'Twilio not configured' });
  }

  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;

  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity: req.body.identity || 'power-dialer',
    ttl: 3600
  });

  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID,
    incomingAllow: true
  }));

  res.json({ token: token.toJwt() });
});

// ── TwiML: outbound call instructions ────────────────────────────────────────
// Twilio hits this webhook when the browser initiates a call.
// Point your TwiML App's Request URL here: POST /api/voice
app.post('/api/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.To) {
    twiml.say('No destination number provided.');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  const dial = twiml.dial({ callerId: TWILIO_PHONE_NUMBER });
  dial.number(req.body.To);

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── GoHighLevel: fetch contacts ───────────────────────────────────────────────
app.get('/api/contacts', async (req, res) => {
  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    return res.status(503).json({ error: 'GoHighLevel not configured', contacts: [] });
  }

  const { query, limit = 100, skip = 0 } = req.query;
  const params = { locationId: GHL_LOCATION_ID, limit, skip };
  if (query) params.query = query;

  try {
    const response = await axios.get(`${GHL_BASE}/contacts/`, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: GHL_VERSION },
      params
    });
    res.json(response.data);
  } catch (err) {
    console.error('[GHL contacts]', err.response?.status, err.response?.data || err.message);
    res.status(502).json({ error: 'Failed to fetch contacts', contacts: [] });
  }
});

// ── GoHighLevel: log call as a note ──────────────────────────────────────────
app.post('/api/call/log', async (req, res) => {
  if (!GHL_API_KEY) {
    return res.status(503).json({ error: 'GoHighLevel not configured' });
  }

  const { contactId, notes, outcome, duration } = req.body;

  if (!contactId) {
    return res.status(400).json({ error: 'contactId required' });
  }

  const body = [
    `📞 Power Dialer Call`,
    `Duration: ${formatDuration(duration || 0)}`,
    outcome ? `Outcome: ${outcome}` : null,
    notes ? `\nNotes:\n${notes}` : null
  ].filter(Boolean).join('\n');

  try {
    const response = await axios.post(
      `${GHL_BASE}/contacts/${contactId}/notes`,
      { body, ...(GHL_USER_ID && { userId: GHL_USER_ID }) },
      { headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: GHL_VERSION, 'Content-Type': 'application/json' } }
    );
    res.json(response.data);
  } catch (err) {
    console.error('[GHL log]', err.response?.status, err.response?.data || err.message);
    res.status(502).json({ error: 'Failed to log call to GoHighLevel' });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    twilio: !!(TWILIO_ACCOUNT_SID && TWILIO_API_KEY && TWILIO_TWIML_APP_SID),
    ghl: !!(GHL_API_KEY && GHL_LOCATION_ID)
  });
});

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

app.listen(PORT, () => {
  console.log(`Power Dialer running → http://localhost:${PORT}/dialer.html`);
  console.log(`Twilio configured: ${!!(TWILIO_ACCOUNT_SID && TWILIO_API_KEY)}`);
  console.log(`GHL configured:    ${!!(GHL_API_KEY && GHL_LOCATION_ID)}`);
});
