import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import { h, badRequest, notFound, buildUpdate, STAGES, DEFAULT_PROBABILITY } from '../util.js';
import { emit } from '../events.js';

const router = Router();

const DEAL_FIELDS = ['name', 'value', 'stage', 'probability', 'expected_close_date'];

function validateStage(stage) {
  if (stage && !STAGES.includes(stage)) {
    throw badRequest(`stage must be one of: ${STAGES.join(', ')}`);
  }
}

router.get('/', h(async (req, res) => {
  const { company_id, stage } = req.query;
  const where = [];
  const values = [];
  if (company_id) {
    values.push(company_id);
    where.push(`d.company_id = $${values.length}`);
  }
  if (stage) {
    values.push(stage);
    where.push(`d.stage = $${values.length}`);
  }
  const { rows } = await query(
    `SELECT d.*, co.name AS company_name FROM deals d
     JOIN companies co ON co.id = d.company_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY d.updated_at DESC LIMIT 500`,
    values
  );
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const b = req.body;
  if (!b.company_id) throw badRequest('company_id is required');
  if (!b.name) throw badRequest('name is required');
  validateStage(b.stage);
  const stage = b.stage || 'lead';
  const probability = b.probability ?? DEFAULT_PROBABILITY[stage];
  const { rows } = await query(
    `INSERT INTO deals (company_id, name, value, stage, probability, expected_close_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [b.company_id, b.name, b.value ?? 0, stage, probability, b.expected_close_date || null]
  );
  await touchCompany(b.company_id);
  emit('deal.created', { deal: rows[0] });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', h(async (req, res) => {
  validateStage(req.body.stage);
  const { rows: prevRows } = await query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
  const prev = prevRows[0];
  if (!prev) throw notFound('Deal not found');

  // Stage moves get a default probability unless the caller overrides it.
  const body = { ...req.body };
  if (body.stage && body.stage !== prev.stage && body.probability === undefined) {
    body.probability = DEFAULT_PROBABILITY[body.stage];
  }
  const upd = buildUpdate('deals', req.params.id, body, DEAL_FIELDS, ['updated_at = now()']);
  if (!upd) throw badRequest('No updatable fields provided');
  const { rows } = await query(upd.text, upd.values);
  const deal = rows[0];

  if (body.stage && body.stage !== prev.stage) {
    await query(
      `INSERT INTO activities (company_id, type, body) VALUES ($1, 'stage_change', $2)`,
      [deal.company_id, `Deal "${deal.name}" moved: ${prev.stage} → ${deal.stage}`]
    );
    emit('deal.stage_changed', { deal, from: prev.stage, to: deal.stage });
    if (deal.stage === 'won') emit('deal.won', { deal });
    if (deal.stage === 'lost') emit('deal.lost', { deal });
  }
  await touchCompany(deal.company_id);
  res.json(deal);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM deals WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Deal not found');
  res.status(204).end();
}));

export default router;
