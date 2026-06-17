import { Router } from 'express';
import { pool, query } from '../db.js';
import { auditChange, createAuditBatch } from '../audit.js';
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
  const client = await pool.connect();
  let view;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    auditBatchId = await createAuditBatch(client, {
      action: 'saved_view.create',
      summary: `Create ${entity} saved view ${name}`,
      req,
      metadata: { entity },
    });
    const { rows } = await client.query(
      'INSERT INTO saved_views (entity, name, state) VALUES ($1, $2, $3) RETURNING *',
      [entity, name, state || {}]
    );
    view = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'saved_views',
      operation: 'insert',
      before: null,
      after: view,
      metadata: { route: 'saved_view.create' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ ...view, audit_batch_id: auditBatchId });
}));

router.put('/:id', h(async (req, res) => {
  const { name, state } = req.body;
  const client = await pool.connect();
  let view;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM saved_views WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('View not found');
    auditBatchId = await createAuditBatch(client, {
      action: 'saved_view.update',
      summary: `Update saved view ${req.params.id}`,
      req,
      metadata: { view_id: req.params.id },
    });
    const { rows } = await client.query(
      'UPDATE saved_views SET name = coalesce($2, name), state = coalesce($3, state) WHERE id = $1 RETURNING *',
      [req.params.id, name || null, state ?? null]
    );
    view = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'saved_views',
      operation: 'update',
      before: beforeRows[0],
      after: view,
      metadata: { route: 'saved_view.update' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ ...view, audit_batch_id: auditBatchId });
}));

router.delete('/:id', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM saved_views WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('View not found');
    const auditBatchId = await createAuditBatch(client, {
      action: 'saved_view.delete',
      summary: `Delete saved view ${beforeRows[0].name}`,
      req,
      metadata: { view_id: req.params.id, entity: beforeRows[0].entity },
    });
    await auditChange(client, auditBatchId, {
      table: 'saved_views',
      operation: 'delete',
      before: beforeRows[0],
      after: null,
      metadata: { route: 'saved_view.delete' },
    });
    const { rowCount } = await client.query('DELETE FROM saved_views WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('View not found');
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
