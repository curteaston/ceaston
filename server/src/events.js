import crypto from 'crypto';
import { query } from './db.js';

// Catalog of emittable events (also drives the Settings webhook checkboxes via /api/webhooks/events).
export const EVENT_TYPES = [
  'company.created',
  'contact.created',
  'deal.created',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  'activity.logged',
  'task.completed',
  'sequence.email_sent',
];

// Fire-and-forget: POST the payload to every active webhook subscribed to this event.
// Never throws into the caller — webhook delivery must not break CRM writes.
export async function emit(event, data) {
  try {
    const { rows } = await query(
      `SELECT * FROM webhooks WHERE active AND $1 = ANY(events)`,
      [event]
    );
    if (!rows.length) return;
    const payload = JSON.stringify({ event, data, fired_at: new Date().toISOString() });
    await Promise.all(rows.map((w) => deliver(w, payload)));
  } catch (err) {
    console.error('webhook emit error:', err.message);
  }
}

async function deliver(webhook, payload) {
  const headers = { 'Content-Type': 'application/json', 'X-CRM-Event': JSON.parse(payload).event };
  if (webhook.secret) {
    headers['X-CRM-Signature'] =
      'sha256=' + crypto.createHmac('sha256', webhook.secret).update(payload).digest('hex');
  }
  let status = 'ok';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(webhook.url, { method: 'POST', headers, body: payload, signal: controller.signal });
    clearTimeout(timer);
    status = res.ok ? `ok (${res.status})` : `http ${res.status}`;
  } catch (err) {
    status = `error: ${err.message}`;
  }
  await query('UPDATE webhooks SET last_status = $2, last_fired_at = now() WHERE id = $1', [webhook.id, status])
    .catch(() => {});
}
