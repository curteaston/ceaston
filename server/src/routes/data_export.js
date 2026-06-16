import { Router } from 'express';
import { query } from '../db.js';
import { h, SCHEMA_VERSION } from '../util.js';

const router = Router();

const TABLES = [
  ['companies', 'id'],
  ['contacts', 'id'],
  ['deals', 'id'],
  ['tasks', 'id'],
  ['notes', 'id'],
  ['activities', 'id'],
  ['sequences', 'id'],
  ['sequence_steps', 'id'],
  ['sequence_enrollments', 'id'],
  ['sequence_step_runs', 'id'],
  ['tags', 'id'],
  ['company_tags', 'company_id, tag_id'],
  ['contact_tags', 'contact_id, tag_id'],
  ['saved_views', 'id'],
  ['email_templates', 'id'],
];

async function readTable(table, orderBy) {
  const { rows } = await query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
  return rows;
}

router.get('/snapshot', h(async (req, res) => {
  const entries = await Promise.all(TABLES.map(async ([table, orderBy]) => [
    table,
    await readTable(table, orderBy),
  ]));
  const data = Object.fromEntries(entries);

  const { rows: webhooks } = await query(
    `SELECT id, url, events, active, created_at, last_status, last_fired_at,
            (secret IS NOT NULL AND secret <> '') AS has_secret
       FROM webhooks
      ORDER BY id`
  );
  data.webhooks = webhooks;

  const counts = Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length]));

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    kind: 'prospecting-data-snapshot',
    counts,
    excluded: ['app_settings', 'webhooks.secret'],
    data,
  });
}));

export default router;
