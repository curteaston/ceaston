import { Router } from 'express';
import { pool, query } from '../db.js';
import { auditChange, createAuditBatch } from '../audit.js';
import { h, badRequest, notFound } from '../util.js';

const router = Router();

router.get('/', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM email_templates ORDER BY category, name');
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const { name, category, subject, body } = req.body;
  if (!name?.trim()) throw badRequest('name is required');
  const client = await pool.connect();
  let template;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    auditBatchId = await createAuditBatch(client, {
      action: 'email_template.create',
      summary: `Create email template ${name.trim()}`,
      req,
      metadata: { category: category?.trim() || 'General' },
    });
    const { rows } = await client.query(
      `INSERT INTO email_templates (name, category, subject, body) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), category?.trim() || 'General', subject || '', body || '']
    );
    template = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'email_templates',
      operation: 'insert',
      before: null,
      after: template,
      metadata: { route: 'email_template.create' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ ...template, audit_batch_id: auditBatchId });
}));

router.patch('/:id', h(async (req, res) => {
  const { name, category, subject, body } = req.body;
  const client = await pool.connect();
  let template;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Template not found');
    auditBatchId = await createAuditBatch(client, {
      action: 'email_template.update',
      summary: `Update email template ${req.params.id}`,
      req,
      metadata: { template_id: req.params.id },
    });
    const { rows } = await client.query(
      `UPDATE email_templates SET name=$2, category=$3, subject=$4, body=$5, updated_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id, name, category || 'General', subject || '', body || '']
    );
    template = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'email_templates',
      operation: 'update',
      before: beforeRows[0],
      after: template,
      metadata: { route: 'email_template.update' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ ...template, audit_batch_id: auditBatchId });
}));

router.delete('/:id', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Template not found');
    const auditBatchId = await createAuditBatch(client, {
      action: 'email_template.delete',
      summary: `Delete email template ${beforeRows[0].name}`,
      req,
      metadata: { template_id: req.params.id },
    });
    await auditChange(client, auditBatchId, {
      table: 'email_templates',
      operation: 'delete',
      before: beforeRows[0],
      after: null,
      metadata: { route: 'email_template.delete' },
    });
    const { rowCount } = await client.query('DELETE FROM email_templates WHERE id=$1', [req.params.id]);
    if (!rowCount) throw notFound('Template not found');
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
