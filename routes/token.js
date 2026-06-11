const router = require('express').Router();
const twilio = require('twilio');
const { requireAuth, loadTenant } = require('../middleware/auth');

router.use(requireAuth, loadTenant);

// POST /api/token — issue Twilio Voice access token for the browser SDK
router.post('/', (req, res) => {
  const t = req.tenant;

  const accountSid   = t?.twilio_account_sid  || process.env.TWILIO_ACCOUNT_SID;
  const apiKey       = t?.twilio_api_key       || process.env.TWILIO_API_KEY;
  const apiSecret    = t?.twilio_api_secret    || process.env.TWILIO_API_SECRET;
  const twimlAppSid  = t?.twilio_twiml_app_sid || process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    return res.status(503).json({ error: 'Twilio not configured for this account' });
  }

  const { AccessToken } = twilio.jwt;
  const { VoiceGrant }  = AccessToken;

  const token = new AccessToken(accountSid, apiKey, apiSecret, {
    identity: `${req.session.tenantId}:${req.session.userId}`,
    ttl: 3600
  });

  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true
  }));

  res.json({ token: token.toJwt() });
});

module.exports = router;
