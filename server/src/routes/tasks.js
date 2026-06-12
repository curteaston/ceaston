import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import { h, badRequest, notFound, buildUpdate } from '../util.js';

const router = Router();

const TASK_FIELDS = ['company_id', 'contact_id', 'description', 'due_date', 'priority', 'owner'];

async function taskCompanyId(task) {
  if (task.company_id) return task.company_id;
  const { rows } = await query('SELECT company_id FROM contacts WHERE id = $1', [task.contact_id]);
  return rows[0]?.company_id ?? null;
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
  if (!b.description) throw badRequest('description is required');
  if (!b.company_id && !b.contact_id) throw badRequest('company_id or contact_id is required');
  const { rows } = await query(
    `INSERT INTO tasks (company_id, contact_id, description, due_date, priority, owner)
     VALUES ($1, $2, $3, $4, coalesce($5, 'medium'), $6) RETURNING *`,
    [b.company_id || null, b.contact_id || null, b.description, b.due_date || null, b.priority || null, b.owner || null]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id', h(async (req, res) => {
  const extraSets = [];
  if (req.body.completed === true) extraSets.push('completed = true', 'completed_at = now()');
  if (req.body.completed === false) extraSets.push('completed = false', 'completed_at = NULL');
  const upd = buildUpdate('tasks', req.params.id, req.body, TASK_FIELDS, extraSets);
  if (!upd && extraSets.length === 0) throw badRequest('No updatable fields provided');

  let row;
  if (upd) {
    ({ rows: [row] } = await query(upd.text, upd.values));
  } else {
    ({ rows: [row] } = await query(
      `UPDATE tasks SET ${extraSets.join(', ')} WHERE id = $1 RETURNING *`,
      [req.params.id]
    ));
  }
  if (!row) throw notFound('Task not found');

  if (req.body.completed === true) {
    const companyId = await taskCompanyId(row);
    if (companyId) await touchCompany(companyId);
  }
  res.json(row);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Task not found');
  res.status(204).end();
}));

export default router;
