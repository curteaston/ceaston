import { Router } from 'express';
import { query } from '../db.js';
import { h, badRequest, notFound } from '../util.js';

const router = Router();

router.get('/', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM email_templates ORDER BY category, name');
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const { name, category, subject, body } = req.body;
  if (!name?.trim()) throw badRequest('name is required');
  const { rows } = await query(
    `INSERT INTO email_templates (name, category, subject, body) VALUES ($1, $2, $3, $4) RETURNING *`,
    [name.trim(), category?.trim() || 'General', subject || '', body || '']
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id', h(async (req, res) => {
  const { name, category, subject, body } = req.body;
  const { rows } = await query(
    `UPDATE email_templates SET name=$2, category=$3, subject=$4, body=$5, updated_at=now() WHERE id=$1 RETURNING *`,
    [req.params.id, name, category || 'General', subject || '', body || '']
  );
  if (!rows[0]) throw notFound('Template not found');
  res.json(rows[0]);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM email_templates WHERE id=$1', [req.params.id]);
  if (!rowCount) throw notFound('Template not found');
  res.status(204).end();
}));

export default router;
