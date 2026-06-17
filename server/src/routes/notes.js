import { Router } from 'express';
import { pool, query } from '../db.js';
import { auditChange, auditRowDiff, createAuditBatch } from '../audit.js';
import { h, badRequest, notFound, NOTE_SOURCES, assertEnum } from '../util.js';

const router = Router();

async function touchCompanyWithClient(client, companyId, when) {
  await client.query(
    `UPDATE companies SET last_activity_at = GREATEST(coalesce(last_activity_at, 'epoch'), $2)
     WHERE id = $1`,
    [companyId, when || new Date()]
  );
}

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

  const client = await pool.connect();
  let note;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    auditBatchId = await createAuditBatch(client, {
      action: 'note.create',
      summary: `Create note for company ${companyId}`,
      req,
      metadata: { company_id: companyId, contact_id: b.contact_id || null, deal_id: b.deal_id || null },
    });
    const { rows } = await client.query(
      `INSERT INTO notes (company_id, contact_id, deal_id, body, source)
       VALUES ($1, $2, $3, $4, coalesce($5, 'typed')) RETURNING *`,
      [companyId, b.contact_id || null, b.deal_id || null, b.body.trim(), source]
    );
    note = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'notes',
      operation: 'insert',
      before: null,
      after: note,
      metadata: { route: 'note.create' },
    });
    await touchCompanyWithClient(client, companyId);
    const { rows: afterCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    await auditRowDiff(client, auditBatchId, 'companies', beforeCompanyRows, afterCompanyRows, { route: 'note.create.touch_company' });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ ...note, audit_batch_id: auditBatchId });
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
  const client = await pool.connect();
  let note;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM notes WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Note not found');
    auditBatchId = await createAuditBatch(client, {
      action: 'note.update',
      summary: `Update note ${req.params.id}`,
      req,
      metadata: { note_id: req.params.id },
    });
    const { rows } = await client.query(
      `UPDATE notes SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    note = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'notes',
      operation: 'update',
      before: beforeRows[0],
      after: note,
      metadata: { route: 'note.update' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ ...note, audit_batch_id: auditBatchId });
}));

router.delete('/:id', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM notes WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Note not found');
    const auditBatchId = await createAuditBatch(client, {
      action: 'note.delete',
      summary: `Delete note ${req.params.id}`,
      req,
      metadata: { note_id: req.params.id, company_id: beforeRows[0].company_id },
    });
    await auditChange(client, auditBatchId, {
      table: 'notes',
      operation: 'delete',
      before: beforeRows[0],
      after: null,
      metadata: { route: 'note.delete' },
    });
    const { rowCount } = await client.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Note not found');
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
