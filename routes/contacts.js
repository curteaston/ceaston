const router = require('express').Router();
const axios  = require('axios');
const { z }  = require('zod');
const { requireAuth, loadTenant } = require('../middleware/auth');

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

router.use(requireAuth, loadTenant);

// GET /api/contacts?query=&limit=&skip=
router.get('/', async (req, res) => {
  if (!req.tenant?.ghl_api_key || !req.tenant?.ghl_location_id) {
    return res.status(503).json({ error: 'GoHighLevel not configured for this account', contacts: [] });
  }

  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  const skip  = Math.max(parseInt(req.query.skip) || 0, 0);
  const params = { locationId: req.tenant.ghl_location_id, limit, skip };
  if (req.query.query) params.query = req.query.query.slice(0, 200);

  try {
    const { data } = await axios.get(`${GHL_BASE}/contacts/`, {
      headers: { Authorization: `Bearer ${req.tenant.ghl_api_key}`, Version: GHL_VERSION },
      params,
      timeout: 10000
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) return res.status(502).json({ error: 'GHL API key is invalid', contacts: [] });
    console.error('[GHL contacts]', status, err.message);
    res.status(502).json({ error: 'Failed to fetch contacts from GoHighLevel', contacts: [] });
  }
});

module.exports = router;
