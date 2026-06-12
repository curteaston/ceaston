import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import { h, badRequest, notFound } from '../util.js';

const router = Router();

router.get('/', h(async (req, res) => {
  const { company_id, contact_id, deal_id } = req.query;
  const where = [];
  const values = [];
  const add = (col, value) => {
    values.push(value);
    where.push(`n.${col} = $${values.length}`);
  };
  if (company_id) add('company_id', company_id);
  if (contact_id) add('contact_id', contact_id);
  if (deal_id) add('deal_id', deal_id);
  const { rows } = await query(
    `SELECT n.*, ct.name AS contact_name FROM notes n
     LEFT JOIN contacts ct ON ct.id = n.contact_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY n.created_at DESC LIMIT 500`,
    values
  );
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const b = req.body;
  if (!b.body || !b.body.trim()) throw badRequest('body is required');

  let companyId = b.company_id || null;
  if (!companyId && b.contact_id) {
    const { rows } = await query('SELECT company_id FROM contacts WHERE id = $1', [b.contact_id]);
    companyId = rows[0]?.company_id;
  }
  if (!companyId && b.deal_id) {
    const { rows } = await query('SELECT company_id FROM deals WHERE id = $1', [b.deal_id]);
    companyId = rows[0]?.company_id;
  }
  if (!companyId) throw badRequest('company_id, contact_id, or deal_id is required');

  const { rows } = await query(
    `INSERT INTO notes (company_id, contact_id, deal_id, body, source)
     VALUES ($1, $2, $3, $4, coalesce($5, 'typed')) RETURNING *`,
    [companyId, b.contact_id || null, b.deal_id || null, b.body.trim(), b.source || null]
  );
  await touchCompany(companyId);
  res.status(201).json(rows[0]);
}));

// PATCH /api/notes/:id — edit a transcription / note body
router.patch('/:id', h(async (req, res) => {
  if (!req.body.body || !req.body.body.trim()) throw badRequest('body is required');
  const { rows } = await query(
    'UPDATE notes SET body = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [req.body.body.trim(), req.params.id]
  );
  if (!rows[0]) throw notFound('Note not found');
  res.json(rows[0]);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM notes WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Note not found');
  res.status(204).end();
}));

export default router;
