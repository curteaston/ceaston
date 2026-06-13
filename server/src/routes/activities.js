import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import { h, badRequest, notFound } from '../util.js';
import { emit } from '../events.js';

const router = Router();

router.get('/', h(async (req, res) => {
  const { company_id, contact_id, type } = req.query;
  const where = [];
  const values = [];
  const add = (col, value) => {
    values.push(value);
    where.push(`a.${col} = $${values.length}`);
  };
  if (company_id) add('company_id', company_id);
  if (contact_id) add('contact_id', contact_id);
  if (type) add('type', type);
  const { rows } = await query(
    `SELECT a.*, ct.name AS contact_name, co.name AS company_name FROM activities a
     LEFT JOIN contacts ct ON ct.id = a.contact_id
     JOIN companies co ON co.id = a.company_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.occurred_at DESC LIMIT 500`,
    values
  );
  res.json(rows);
}));

// POST /api/activities — log a call/email/meeting outcome (n8n: log call outcomes)
router.post('/', h(async (req, res) => {
  const b = req.body;
  let companyId = b.company_id || null;
  if (!companyId && b.contact_id) {
    const { rows } = await query('SELECT company_id FROM contacts WHERE id = $1', [b.contact_id]);
    companyId = rows[0]?.company_id;
  }
  if (!companyId) throw badRequest('company_id or contact_id is required');

  const { rows } = await query(
    `INSERT INTO activities (company_id, contact_id, type, outcome, body, occurred_at)
     VALUES ($1, $2, coalesce($3, 'call'), $4, $5, coalesce($6, now())) RETURNING *`,
    [companyId, b.contact_id || null, b.type || null, b.outcome || null, b.body || null, b.occurred_at || null]
  );
  const activity = rows[0];
  emit('activity.logged', { activity });
  await touchCompany(companyId, activity.occurred_at);
  if (activity.contact_id) {
    await query(
      `UPDATE contacts SET last_contacted_at = GREATEST(coalesce(last_contacted_at, 'epoch'), $2) WHERE id = $1`,
      [activity.contact_id, activity.occurred_at]
    );
  }
  res.status(201).json(activity);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM activities WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Activity not found');
  res.status(204).end();
}));

export default router;
