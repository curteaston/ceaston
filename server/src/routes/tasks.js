import { Router } from 'express';
import { pool, query } from '../db.js';
import { auditChange, auditRowDiff, createAuditBatch } from '../audit.js';
import { h, badRequest, notFound, buildUpdate, PRIORITIES, assertEnum, requireNonBlank, rejectBlank } from '../util.js';
import { emit } from '../events.js';

const router = Router();

const TASK_FIELDS = ['company_id', 'contact_id', 'description', 'due_date', 'priority', 'owner'];

async function taskCompanyId(task, client = { query }) {
  if (task.company_id) return task.company_id;
  const { rows } = await client.query('SELECT company_id FROM contacts WHERE id = $1', [task.contact_id]);
  return rows[0]?.company_id ?? null;
}

async function touchCompanyWithClient(client, companyId, when) {
  await client.query(
    `UPDATE companies SET last_activity_at = GREATEST(coalesce(last_activity_at, 'epoch'), $2)
     WHERE id = $1`,
    [companyId, when || new Date()]
  );
}

router.get('/', h(async (req, res) => {
  const q = req.query;
  const where = [];
  const values = [];
  const add = (clause, value) => {
    values.push(value);
    where.push(`${clause} $${values.length}`);
  };
  if (q.company_id) add('t.company_id =', q.company_id);
  if (q.contact_id) add('t.contact_id =', q.contact_id);
  if (q.owner) add('t.owner =', q.owner);
  if (q.priority) add('t.priority =', q.priority);
  if (q.completed === 'true') where.push('t.completed');
  if (q.completed === 'false') where.push('NOT t.completed');
  if (q.overdue === 'true') where.push('NOT t.completed AND t.due_date < CURRENT_DATE');
  if (q.due_before) add('t.due_date <=', q.due_before);
  if (!q.company_id && !q.contact_id) where.push('coalesce(co.archived_at, co2.archived_at) IS NULL');

  const { rows } = await query(
    `SELECT t.*, coalesce(t.company_id, ct.company_id) AS company_id,
            coalesce(co.name, co2.name) AS company_name, ct.name AS contact_name
     FROM tasks t
     LEFT JOIN companies co ON co.id = t.company_id
     LEFT JOIN contacts ct ON ct.id = t.contact_id
     LEFT JOIN companies co2 ON co2.id = ct.company_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY t.completed, t.due_date NULLS LAST,
       CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
     LIMIT 1000`,
    values
  );
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const b = req.body;
  b.description = requireNonBlank('description', b.description);
  assertEnum('priority', b.priority, PRIORITIES);
  if (!b.company_id && !b.contact_id) throw badRequest('company_id or contact_id is required');
  const companyId = await taskCompanyId(b);
  const { rows: companyRows } = await query('SELECT name, archived_at FROM companies WHERE id = $1', [companyId]);
  if (!companyRows[0]) throw notFound('Company not found');
  if (companyRows[0].archived_at) throw badRequest(`Cannot add task to archived account: ${companyRows[0].name}`);
  const client = await pool.connect();
  let task;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    auditBatchId = await createAuditBatch(client, {
      action: 'task.create',
      summary: `Create task for company ${companyId}`,
      req,
      metadata: { company_id: companyId, contact_id: b.contact_id || null },
    });
    const { rows } = await client.query(
      `INSERT INTO tasks (company_id, contact_id, description, due_date, priority, owner)
       VALUES ($1, $2, $3, $4, coalesce($5, 'medium'), $6) RETURNING *`,
      [b.company_id || null, b.contact_id || null, b.description, b.due_date || null, b.priority || null, b.owner || null]
    );
    task = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'tasks',
      operation: 'insert',
      before: null,
      after: task,
      metadata: { route: 'task.create' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ ...task, audit_batch_id: auditBatchId });
}));

router.patch('/:id', h(async (req, res) => {
  const body = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(body, 'description')) body.description = rejectBlank('description', body.description);
  if (Object.prototype.hasOwnProperty.call(body, 'priority')) body.priority = rejectBlank('priority', body.priority);
  assertEnum('priority', body.priority, PRIORITIES);
  const extraSets = [];
  if (body.completed === true) extraSets.push('completed = true', 'completed_at = now()');
  if (body.completed === false) extraSets.push('completed = false', 'completed_at = NULL');
  const upd = buildUpdate('tasks', req.params.id, body, TASK_FIELDS, extraSets);
  if (!upd && extraSets.length === 0) throw badRequest('No updatable fields provided');

  const client = await pool.connect();
  let row;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Task not found');
    const companyId = body.completed === true ? await taskCompanyId(beforeRows[0], client) : null;
    const { rows: beforeCompanyRows } = companyId
      ? await client.query('SELECT * FROM companies WHERE id = $1', [companyId])
      : { rows: [] };
    auditBatchId = await createAuditBatch(client, {
      action: 'task.update',
      summary: `Update task ${req.params.id}`,
      req,
      metadata: { task_id: req.params.id, patch: body },
    });
    if (upd) {
      ({ rows: [row] } = await client.query(upd.text, upd.values));
    } else {
      ({ rows: [row] } = await client.query(
        `UPDATE tasks SET ${extraSets.join(', ')} WHERE id = $1 RETURNING *`,
        [req.params.id]
      ));
    }
    await auditChange(client, auditBatchId, {
      table: 'tasks',
      operation: 'update',
      before: beforeRows[0],
      after: row,
      metadata: { route: 'task.update' },
    });
    if (companyId) {
      await touchCompanyWithClient(client, companyId);
      const { rows: afterCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [companyId]);
      await auditRowDiff(client, auditBatchId, 'companies', beforeCompanyRows, afterCompanyRows, { route: 'task.update.touch_company' });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (body.completed === true) emit('task.completed', { task: row });
  res.json({ ...row, audit_batch_id: auditBatchId });
}));

router.delete('/:id', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Task not found');
    const auditBatchId = await createAuditBatch(client, {
      action: 'task.delete',
      summary: `Delete task ${req.params.id}`,
      req,
      metadata: { task_id: req.params.id },
    });
    await auditChange(client, auditBatchId, {
      table: 'tasks',
      operation: 'delete',
      before: beforeRows[0],
      after: null,
      metadata: { route: 'task.delete' },
    });
    const { rowCount } = await client.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Task not found');
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
