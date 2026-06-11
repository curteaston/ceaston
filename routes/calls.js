const router = require('express').Router();
const axios  = require('axios');
const { v4: uuid } = require('uuid');
const { z }  = require('zod');
const { db } = require('../db');
const { requireAuth, loadTenant } = require('../middleware/auth');

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

router.use(requireAuth, loadTenant);

const saveCallSchema = z.object({
  contactId:   z.string().max(200).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  phone:       z.string().max(30).optional().nullable(),
  durationSecs: z.number().int().min(0).max(86400).default(0),
  outcome:     z.string().max(100).optional().nullable(),
  notes:       z.string().max(5000).optional().nullable()
});

const logSchema = z.object({
  callId:    z.string().uuid(),
  contactId: z.string().min(1).max(200),
  notes:     z.string().max(5000).optional().nullable(),
  outcome:   z.string().max(100).optional().nullable(),
  duration:  z.number().int().min(0).max(86400).default(0)
});

// POST /api/calls — save call record to DB after call ends
router.post('/', (req, res) => {
  const result = saveCallSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

  const { contactId, contactName, phone, durationSecs, outcome, notes } = result.data;
  const id = uuid();

  db.prepare(`
    INSERT INTO calls (id, tenant_id, user_id, contact_id, contact_name, phone, duration_secs, outcome, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.session.tenantId, req.session.userId, contactId, contactName, phone, durationSecs, outcome, notes);

  res.json({ id });
});

// GET /api/calls — last 50 calls for the current user
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, contact_id, contact_name, phone, duration_secs, outcome, notes, ghl_logged, created_at
    FROM calls
    WHERE tenant_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.session.tenantId, req.session.userId);

  res.json({ calls: rows });
});

// POST /api/calls/log — post notes as GHL contact note + mark ghl_logged
router.post('/log', async (req, res) => {
  const result = logSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

  const { callId, contactId, notes, outcome, duration } = result.data;

  if (!req.tenant?.ghl_api_key) {
    return res.status(503).json({ error: 'GoHighLevel not configured for this account' });
  }

  // Verify the call belongs to this tenant
  const callRow = db.prepare('SELECT id FROM calls WHERE id = ? AND tenant_id = ?').get(callId, req.session.tenantId);
  if (!callRow) return res.status(404).json({ error: 'Call not found' });

  const noteBody = [
    '📞 Power Dialer Call Log',
    `Duration: ${fmtDuration(duration)}`,
    outcome ? `Outcome: ${outcome}` : null,
    notes ? `\nNotes:\n${notes}` : null
  ].filter(Boolean).join('\n');

  try {
    await axios.post(
      `${GHL_BASE}/contacts/${contactId}/notes`,
      { body: noteBody, ...(req.tenant.ghl_user_id && { userId: req.tenant.ghl_user_id }) },
      {
        headers: { Authorization: `Bearer ${req.tenant.ghl_api_key}`, Version: GHL_VERSION, 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    db.prepare('UPDATE calls SET ghl_logged = 1, notes = ?, outcome = ? WHERE id = ?').run(notes, outcome, callId);

    res.json({ ok: true });
  } catch (err) {
    console.error('[GHL log]', err.response?.status, err.message);
    res.status(502).json({ error: 'Failed to log call to GoHighLevel' });
  }
});

function fmtDuration(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = router;
