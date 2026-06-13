import { Router } from 'express';
import { query } from '../db.js';
import { h, badRequest, notFound } from '../util.js';
import { EVENT_TYPES } from '../events.js';

const router = Router();

router.get('/events', (req, res) => res.json(EVENT_TYPES));

router.get('/', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM webhooks ORDER BY created_at DESC');
  res.json(rows);
}));

function validateEvents(events) {
  if (!Array.isArray(events) || events.length === 0) throw badRequest('events must be a non-empty array');
  const bad = events.filter((e) => !EVENT_TYPES.includes(e));
  if (bad.length) throw badRequest(`Unknown events: ${bad.join(', ')}`);
}

router.post('/', h(async (req, res) => {
  const { url, events, secret, active } = req.body;
  if (!url || !/^https?:\/\//.test(url)) throw badRequest('A valid http(s) url is required');
  validateEvents(events);
  const { rows } = await query(
    'INSERT INTO webhooks (url, events, secret, active) VALUES ($1, $2, $3, coalesce($4, true)) RETURNING *',
    [url, events, secret || null, active]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', h(async (req, res) => {
  const { url, events, secret, active } = req.body;
  if (events !== undefined) validateEvents(events);
  const { rows } = await query(
    `UPDATE webhooks SET url = coalesce($2, url), events = coalesce($3, events),
       secret = coalesce($4, secret), active = coalesce($5, active) WHERE id = $1 RETURNING *`,
    [req.params.id, url || null, events ?? null, secret ?? null, active]
  );
  if (!rows[0]) throw notFound('Webhook not found');
  res.json(rows[0]);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM webhooks WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Webhook not found');
  res.status(204).end();
}));

// POST /api/webhooks/:id/test — send a sample payload to verify the endpoint
router.post('/:id/test', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM webhooks WHERE id = $1', [req.params.id]);
  const webhook = rows[0];
  if (!webhook) throw notFound('Webhook not found');
  const payload = JSON.stringify({
    event: 'test',
    data: { message: 'Test event from HVAC CRM', company: { id: 0, name: 'Example HVAC Co' } },
    fired_at: new Date().toISOString(),
  });
  try {
    const res2 = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Event': 'test' },
      body: payload,
    });
    res.json({ ok: res2.ok, status: res2.status });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
}));

export default router;
