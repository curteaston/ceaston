import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import { h, badRequest, notFound, NOTE_SOURCES, assertEnum } from '../util.js';

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
  if (!company_id && !contact_id && !deal_id) where.push('co.archived_at IS NULL');
  const { rows } = await query(
    `SELECT n.*, ct.name AS contact_name FROM notes n
     LEFT JOIN contacts ct ON ct.id = n.contact_id
     JOIN companies co ON co.id = n.company_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY n.created_at DESC LIMIT 500`,
    values
  );
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const b = req.body;
  if (!b.body || !b.body.trim()) throw badRequest('body is required');
  const source = b.source === '' ? null : b.source;
  assertEnum('source', source, NOTE_SOURCES);

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
  const { rows: companyRows } = await query('SELECT name, archived_at FROM companies WHERE id = $1', [companyId]);
  if (!companyRows[0]) throw notFound('Company not found');
  if (companyRows[0].archived_at) throw badRequest(`Cannot add note to archived account: ${companyRows[0].name}`);

  const { rows } = await query(
    `INSERT INTO notes (company_id, contact_id, deal_id, body, source)
     VALUES ($1, $2, $3, $4, coalesce($5, 'typed')) RETURNING *`,
    [companyId, b.contact_id || null, b.deal_id || null, b.body.trim(), source]
  );
  await touchCompany(companyId);
  res.status(201).json(rows[0]);
}));

// PATCH /api/notes/:id — edit body and/or pinned
router.patch('/:id', h(async (req, res) => {
  const { body, pinned } = req.body;
  if (body !== undefined && !body.trim()) throw badRequest('body cannot be empty');
  const sets = [];
  const values = [];
  if (body !== undefined) { values.push(body.trim()); sets.push(`body = $${values.length}`); values.push(new Date()); sets.push(`updated_at = $${values.length}`); }
  if (pinned !== undefined) { values.push(Boolean(pinned)); sets.push(`pinned = $${values.length}`); }
  if (!sets.length) throw badRequest('Nothing to update');
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE notes SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
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
