const router = require('express').Router();
const { z }  = require('zod');
const { db } = require('../db');
const { requireAdmin, loadTenant } = require('../middleware/auth');

router.use(requireAdmin, loadTenant);

const setupSchema = z.object({
  twilioAccountSid:  z.string().regex(/^AC[0-9a-f]{32}$/).optional().or(z.literal('')),
  twilioAuthToken:   z.string().min(32).max(64).optional().or(z.literal('')),
  twilioPhoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/).optional().or(z.literal('')),
  twilioApiKey:      z.string().regex(/^SK[0-9a-f]{32}$/).optional().or(z.literal('')),
  twilioApiSecret:   z.string().min(8).max(128).optional().or(z.literal('')),
  twilioTwimlAppSid: z.string().regex(/^AP[0-9a-f]{32}$/).optional().or(z.literal('')),
  ghlApiKey:         z.string().max(256).optional().or(z.literal('')),
  ghlLocationId:     z.string().max(100).optional().or(z.literal('')),
  ghlUserId:         z.string().max(100).optional().or(z.literal(''))
});

// GET /api/setup — return current config (masked secrets)
router.get('/', (req, res) => {
  const t = req.tenant || {};
  res.json({
    twilioAccountSid:  t.twilio_account_sid  || '',
    twilioPhoneNumber: t.twilio_phone_number  || '',
    twilioApiKey:      t.twilio_api_key       || '',
    twilioTwimlAppSid: t.twilio_twiml_app_sid || '',
    ghlLocationId:     t.ghl_location_id      || '',
    ghlUserId:         t.ghl_user_id          || '',
    // Mask secrets — only show whether they are set
    twilioAuthTokenSet: !!t.twilio_auth_token,
    twilioApiSecretSet: !!t.twilio_api_secret,
    ghlApiKeySet:       !!t.ghl_api_key
  });
});

// PUT /api/setup — save credentials
router.put('/', (req, res) => {
  const result = setupSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

  const d = result.data;
  const fields = [];
  const values = [];

  const map = {
    twilioAccountSid:  'twilio_account_sid',
    twilioAuthToken:   'twilio_auth_token',
    twilioPhoneNumber: 'twilio_phone_number',
    twilioApiKey:      'twilio_api_key',
    twilioApiSecret:   'twilio_api_secret',
    twilioTwimlAppSid: 'twilio_twiml_app_sid',
    ghlApiKey:         'ghl_api_key',
    ghlLocationId:     'ghl_location_id',
    ghlUserId:         'ghl_user_id'
  };

  for (const [key, col] of Object.entries(map)) {
    if (d[key] !== undefined && d[key] !== '') {
      fields.push(`${col} = ?`);
      values.push(d[key]);
    }
  }

  if (!fields.length) return res.json({ ok: true });

  values.push(req.session.tenantId);
  db.prepare(`UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  res.json({ ok: true });
});

// GET /api/setup/health — test Twilio + GHL connectivity
router.get('/health', async (req, res) => {
  const t = req.tenant || {};
  const result = { twilio: false, ghl: false };

  // Test Twilio
  if (t.twilio_account_sid && t.twilio_auth_token) {
    try {
      const twilio = require('twilio')(t.twilio_account_sid, t.twilio_auth_token);
      await twilio.api.accounts(t.twilio_account_sid).fetch();
      result.twilio = true;
    } catch { result.twilio = false; }
  }

  // Test GHL
  if (t.ghl_api_key && t.ghl_location_id) {
    try {
      const axios = require('axios');
      await axios.get('https://services.leadconnectorhq.com/contacts/', {
        headers: { Authorization: `Bearer ${t.ghl_api_key}`, Version: '2021-07-28' },
        params: { locationId: t.ghl_location_id, limit: 1 },
        timeout: 6000
      });
      result.ghl = true;
    } catch { result.ghl = false; }
  }

  res.json(result);
});

module.exports = router;
