import { Router } from 'express';
import { pool, query } from '../db.js';
import { auditChange, auditRowDiff, auditRows, createAuditBatch } from '../audit.js';
import {
  h, badRequest, notFound, buildUpdate, STAGES, DEFAULT_PROBABILITY,
  assertEnum, requireNonBlank, rejectBlank,
} from '../util.js';
import { emit } from '../events.js';

const router = Router();

const DEAL_FIELDS = ['name', 'value', 'stage', 'probability', 'expected_close_date'];

function validateStage(stage) {
  assertEnum('stage', stage, STAGES);
}

function normalizeProbability(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw badRequest('probability must be a number between 0 and 100');
  }
  return n;
}

async function touchCompanyWithClient(client, companyId, when) {
  await client.query(
    `UPDATE companies SET last_activity_at = GREATEST(coalesce(last_activity_at, 'epoch'), $2)
     WHERE id = $1`,
    [companyId, when || new Date()]
  );
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
  if (!company_id) where.push('co.archived_at IS NULL');
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
  b.name = requireNonBlank('name', b.name);
  const { rows: companyRows } = await query('SELECT name, archived_at FROM companies WHERE id = $1', [b.company_id]);
  if (!companyRows[0]) throw notFound('Company not found');
  if (companyRows[0].archived_at) throw badRequest(`Cannot add deal to archived account: ${companyRows[0].name}`);
  validateStage(b.stage);
  const stage = b.stage || 'lead';
  const probability = normalizeProbability(b.probability) ?? DEFAULT_PROBABILITY[stage];

  const client = await pool.connect();
  let deal;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [b.company_id]);
    auditBatchId = await createAuditBatch(client, {
      action: 'deal.create',
      summary: `Create deal ${b.name}`,
      req,
      metadata: { company_id: b.company_id },
    });
    const { rows } = await client.query(
      `INSERT INTO deals (company_id, name, value, stage, probability, expected_close_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [b.company_id, b.name, b.value ?? 0, stage, probability, b.expected_close_date || null]
    );
    deal = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'deals',
      operation: 'insert',
      before: null,
      after: deal,
      metadata: { route: 'deal.create' },
    });
    await touchCompanyWithClient(client, b.company_id);
    const { rows: afterCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [b.company_id]);
    await auditRowDiff(client, auditBatchId, 'companies', beforeCompanyRows, afterCompanyRows, { route: 'deal.create.touch_company' });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  emit('deal.created', { deal });
  res.status(201).json({ ...deal, audit_batch_id: auditBatchId });
}));

router.patch('/:id', h(async (req, res) => {
  const { rows: prevRows } = await query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
  const prev = prevRows[0];
  if (!prev) throw notFound('Deal not found');

  // Stage moves get a default probability unless the caller overrides it.
  const body = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(body, 'name')) body.name = rejectBlank('name', body.name);
  if (Object.prototype.hasOwnProperty.call(body, 'stage')) body.stage = rejectBlank('stage', body.stage);
  validateStage(body.stage);
  if (Object.prototype.hasOwnProperty.call(body, 'probability')) body.probability = normalizeProbability(body.probability);
  if (body.stage && body.stage !== prev.stage && body.probability === undefined) {
    body.probability = DEFAULT_PROBABILITY[body.stage];
  }
  const upd = buildUpdate('deals', req.params.id, body, DEAL_FIELDS, ['updated_at = now()']);
  if (!upd) throw badRequest('No updatable fields provided');

  const client = await pool.connect();
  let deal;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [prev.company_id]);
    auditBatchId = await createAuditBatch(client, {
      action: 'deal.update',
      summary: `Update deal ${req.params.id}`,
      req,
      metadata: { deal_id: req.params.id, patch: body },
    });
    const { rows } = await client.query(upd.text, upd.values);
    deal = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'deals',
      operation: 'update',
      before: prev,
      after: deal,
      metadata: { route: 'deal.update' },
    });

    if (body.stage && body.stage !== prev.stage) {
      const { rows: activityRows } = await client.query(
        `INSERT INTO activities (company_id, type, body) VALUES ($1, 'stage_change', $2) RETURNING *`,
        [deal.company_id, `Deal "${deal.name}" moved: ${prev.stage} -> ${deal.stage}`]
      );
      await auditChange(client, auditBatchId, {
        table: 'activities',
        operation: 'insert',
        before: null,
        after: activityRows[0],
        metadata: { route: 'deal.update.stage_change' },
      });
    }

    await touchCompanyWithClient(client, deal.company_id);
    const { rows: afterCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [deal.company_id]);
    await auditRowDiff(client, auditBatchId, 'companies', beforeCompanyRows, afterCompanyRows, { route: 'deal.update.touch_company' });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (body.stage && body.stage !== prev.stage) {
    emit('deal.stage_changed', { deal, from: prev.stage, to: deal.stage });
    if (deal.stage === 'won') emit('deal.won', { deal });
    if (deal.stage === 'lost') emit('deal.lost', { deal });
  }
  res.json({ ...deal, audit_batch_id: auditBatchId });
}));

router.delete('/:id', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Deal not found');
    const auditBatchId = await createAuditBatch(client, {
      action: 'deal.delete',
      summary: `Delete deal ${beforeRows[0].name}`,
      req,
      metadata: { deal_id: req.params.id, company_id: beforeRows[0].company_id },
    });
    const { rows: noteRows } = await client.query('SELECT * FROM notes WHERE deal_id = $1 ORDER BY id', [req.params.id]);
    await auditRows(client, auditBatchId, 'notes', 'delete', noteRows, { route: 'deal.delete.cascade_notes' });
    await auditChange(client, auditBatchId, {
      table: 'deals',
      operation: 'delete',
      before: beforeRows[0],
      after: null,
      metadata: { route: 'deal.delete' },
    });
    const { rowCount } = await client.query('DELETE FROM deals WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Deal not found');
    await client.query('COMMIT');
    res.json({ deleted: 1, audit_batch_id: auditBatchId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
