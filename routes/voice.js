const router = require('express').Router();
const twilio = require('twilio');
const { z }  = require('zod');
const { db } = require('../db');

const E164 = /^\+[1-9]\d{7,14}$/;

// POST /api/voice?tenantId=xxx — Twilio TwiML webhook (no session auth, uses Twilio signature)
// Your TwiML App Request URL must be: https://your-domain.com/api/voice?tenantId=YOUR_TENANT_ID
router.post('/', (req, res) => {
  const tenantId = req.query.tenantId;

  // Load tenant to get auth token for signature validation
  const tenant = tenantId
    ? db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId)
    : null;

  const authToken = tenant?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = tenant?.twilio_phone_number || process.env.TWILIO_PHONE_NUMBER;

  // Validate Twilio signature — prevents forged webhook calls
  if (authToken && process.env.NODE_ENV === 'production') {
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/voice${tenantId ? `?tenantId=${tenantId}` : ''}`;
    const valid = twilio.validateRequest(
      authToken,
      req.headers['x-twilio-signature'] || '',
      webhookUrl,
      req.body
    );
    if (!valid) return res.status(403).send('Invalid Twilio signature');
  }

  const to = req.body.To;
  const twiml = new twilio.twiml.VoiceResponse();

  if (!to || !E164.test(to)) {
    twiml.say('The destination number is invalid.');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  const dial = twiml.dial({ callerId: phoneNumber });
  dial.number(to);

  res.type('text/xml');
  res.send(twiml.toString());
});

module.exports = router;
