import { Router } from 'express';
import { pool, query } from '../db.js';
import { h, badRequest, toInt } from '../util.js';
import { undoAuditBatch } from '../audit.js';

const router = Router();

router.get('/', h(async (req, res) => {
  const limit = Math.min(toInt(req.query.limit) || 50, 200);
  const { rows } = await query(
    `SELECT b.*,
            count(e.id)::int AS event_count
       FROM data_audit_batches b
       LEFT JOIN data_audit_events e ON e.batch_id = b.id
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT $1`,
    [limit],
  );
  res.json({ batches: rows });
}));

router.get('/:id', h(async (req, res) => {
  const { rows: batchRows } = await query('SELECT * FROM data_audit_batches WHERE id = $1', [req.params.id]);
  if (!batchRows[0]) throw badRequest('Audit batch not found');
  const { rows: events } = await query(
    'SELECT * FROM data_audit_events WHERE batch_id = $1 ORDER BY id',
    [req.params.id],
  );
  res.json({ ...batchRows[0], events });
}));

router.post('/:id/undo', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await undoAuditBatch(client, req.params.id, { req });
    await client.query('COMMIT');
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
