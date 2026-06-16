import { Router } from 'express';
import { query } from '../db.js';
import { h, badRequest, notFound } from '../util.js';

const router = Router();

// GET /api/views?entity=company|contact
router.get('/', h(async (req, res) => {
  const { entity } = req.query;
  const { rows } = entity
    ? await query('SELECT * FROM saved_views WHERE entity = $1 ORDER BY name', [entity])
    : await query('SELECT * FROM saved_views ORDER BY entity, name');
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const { entity, name, state } = req.body;
  if (!['company', 'contact'].includes(entity)) throw badRequest('entity must be company or contact');
  if (!name) throw badRequest('name is required');
  const { rows } = await query(
    'INSERT INTO saved_views (entity, name, state) VALUES ($1, $2, $3) RETURNING *',
    [entity, name, state || {}]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', h(async (req, res) => {
  const { name, state } = req.body;
  const { rows } = await query(
    'UPDATE saved_views SET name = coalesce($2, name), state = coalesce($3, state) WHERE id = $1 RETURNING *',
    [req.params.id, name || null, state ?? null]
  );
  if (!rows[0]) throw notFound('View not found');
  res.json(rows[0]);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM saved_views WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('View not found');
  res.status(204).end();
}));

export default router;
