import { Router } from 'express';
import { pool, query } from '../db.js';
import { auditChange, auditRowDiff, createAuditBatch } from '../audit.js';
import { h, badRequest, notFound, ACTIVITY_TYPES, assertEnum } from '../util.js';
import { emit } from '../events.js';
import { handleContactReply } from './sequences.js';

const router = Router();

async function touchCompanyWithClient(client, companyId, when) {
  await client.query(
    `UPDATE companies SET last_activity_at = GREATEST(coalesce(last_activity_at, 'epoch'), $2)
     WHERE id = $1`,
    [companyId, when || new Date()]
  );
}

function classifyOutcome(outcome, body) {
  const text = `${outcome || ''} ${body || ''}`.toLowerCase();
  return {
    replied: text.includes('replied') || text.includes('reply'),
    accountStop:
      text.includes('not interested') ||
      text.includes('do not contact') ||
      text.includes('dnc') ||
      text.includes('unsubscribe') ||
      text.includes('remove me') ||
      text.includes('stop contacting'),
    badFit:
      text.includes('bad fit') ||
      text.includes('unqualified') ||
      text.includes('wrong company'),
    wrongNumber: text.includes('wrong number'),
  };
}

async function applyProspectingOutcome(activity, client) {
  const flags = classifyOutcome(activity.outcome, activity.body);
  const lastTouch = activity.type || null;
  await client.query(
    `UPDATE companies
        SET last_touch_channel = coalesce($2, last_touch_channel)
      WHERE id = $1`,
    [activity.company_id, lastTouch]
  );

  if (activity.contact_id) {
    await client.query(
      `UPDATE contacts
          SET replied = replied OR $2,
              do_not_contact = do_not_contact OR $3,
              not_interested = not_interested OR $4,
              bad_fit = bad_fit OR $5
        WHERE id = $1`,
      [
        activity.contact_id,
        flags.replied,
        flags.accountStop || flags.wrongNumber,
        flags.accountStop,
        flags.badFit || flags.wrongNumber,
      ]
    );
  }

  if (flags.replied || flags.accountStop || flags.badFit) {
    const suppressionReason = flags.accountStop
      ? `Suppressed after ${activity.outcome || activity.type || 'interaction'}`
      : flags.badFit
        ? `Marked bad fit after ${activity.outcome || activity.type || 'interaction'}`
        : null;
    await client.query(
      `UPDATE companies
          SET replied = replied OR $2,
              do_not_contact = do_not_contact OR $3,
              not_interested = not_interested OR $4,
              bad_fit = bad_fit OR $5,
              suppression_reason = coalesce($6, suppression_reason),
              next_step = CASE
                WHEN $3 OR $5 THEN null
                WHEN $2 THEN 'Review reply before next touch'
                ELSE next_step
              END
        WHERE id = $1`,
      [
        activity.company_id,
        flags.replied,
        flags.accountStop,
        flags.accountStop,
        flags.badFit,
        suppressionReason,
      ]
    );
  }
}

async function snapshotEnrollments(client, enrollmentIds) {
  const ids = enrollmentIds.map(Number).filter(Number.isFinite);
  if (!ids.length) return { enrollments: [], runs: [], tasks: [] };
  const { rows: enrollments } = await client.query(
    'SELECT * FROM sequence_enrollments WHERE id = ANY($1::int[]) ORDER BY id',
    [ids]
  );
  const { rows: runs } = await client.query(
    'SELECT * FROM sequence_step_runs WHERE enrollment_id = ANY($1::int[]) ORDER BY id',
    [ids]
  );
  const taskIds = runs.map((row) => row.task_id).filter(Boolean);
  const { rows: tasks } = taskIds.length
    ? await client.query('SELECT * FROM tasks WHERE id = ANY($1::int[]) ORDER BY id', [taskIds])
    : { rows: [] };
  return { enrollments, runs, tasks };
}

async function activeContactEnrollmentSnapshot(client, contactId) {
  if (!contactId) return { enrollmentIds: [], enrollments: [], runs: [], tasks: [] };
  const { rows } = await client.query(
    'SELECT id FROM sequence_enrollments WHERE contact_id = $1 AND status = $2 ORDER BY id',
    [contactId, 'active']
  );
  const enrollmentIds = rows.map((row) => row.id);
  return { enrollmentIds, ...(await snapshotEnrollments(client, enrollmentIds)) };
}

router.get('/', h(async (req, res) => {
  const { company_id, contact_id, type } = req.query;
  const where = [];
  const values = [];
  const add = (col, value) => {
    values.push(value);
    where.push(`a.${col} = $${values.length}`);
  };
  if (company_id) add('company_id', company_id);
  if (contact_id) add('contact_id', contact_id);
  if (type) add('type', type);
  if (!company_id && !contact_id) where.push('co.archived_at IS NULL');
  const { rows } = await query(
    `SELECT a.*, ct.name AS contact_name, co.name AS company_name FROM activities a
     LEFT JOIN contacts ct ON ct.id = a.contact_id
     JOIN companies co ON co.id = a.company_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.occurred_at DESC LIMIT 500`,
    values
  );
  res.json(rows);
}));

// POST /api/activities — log a call/email/meeting outcome (n8n: log call outcomes)
router.post('/', h(async (req, res) => {
  const b = req.body;
  const type = b.type === '' ? null : b.type;
  assertEnum('type', type, ACTIVITY_TYPES);
  let companyId = b.company_id || null;
  if (!companyId && b.contact_id) {
    const { rows } = await query('SELECT company_id FROM contacts WHERE id = $1', [b.contact_id]);
    companyId = rows[0]?.company_id;
  }
  if (!companyId) throw badRequest('company_id or contact_id is required');
  const { rows: companyRows } = await query('SELECT name, archived_at FROM companies WHERE id = $1', [companyId]);
  if (!companyRows[0]) throw notFound('Company not found');
  if (companyRows[0].archived_at) throw badRequest(`Cannot add activity to archived account: ${companyRows[0].name}`);

  const client = await pool.connect();
  let activity;
  let unenrolled = 0;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    const { rows: beforeContactRows } = b.contact_id
      ? await client.query('SELECT * FROM contacts WHERE id = $1', [b.contact_id])
      : { rows: [] };
    const replyBefore = b.contact_id && (b.outcome || '').toLowerCase() === 'replied'
      ? await activeContactEnrollmentSnapshot(client, b.contact_id)
      : { enrollmentIds: [], enrollments: [], runs: [], tasks: [] };

    auditBatchId = await createAuditBatch(client, {
      action: 'activity.create',
      summary: `Log activity for company ${companyId}`,
      req,
      metadata: { company_id: companyId, contact_id: b.contact_id || null, type: type || 'call' },
    });
    const { rows } = await client.query(
      `INSERT INTO activities (company_id, contact_id, type, outcome, body, occurred_at)
       VALUES ($1, $2, coalesce($3, 'call'), $4, $5, coalesce($6, now())) RETURNING *`,
      [companyId, b.contact_id || null, type, b.outcome || null, b.body || null, b.occurred_at || null]
    );
    activity = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'activities',
      operation: 'insert',
      before: null,
      after: activity,
      metadata: { route: 'activity.create' },
    });
    await touchCompanyWithClient(client, companyId, activity.occurred_at);
    await applyProspectingOutcome(activity, client);
    if (activity.contact_id) {
      await client.query(
        `UPDATE contacts SET last_contacted_at = GREATEST(coalesce(last_contacted_at, 'epoch'), $2) WHERE id = $1`,
        [activity.contact_id, activity.occurred_at]
      );
    }
    // A reply pulls the contact out of any active sequence (cadence hygiene).
    if (activity.contact_id && (activity.outcome || '').toLowerCase() === 'replied') {
      unenrolled = await handleContactReply(activity.contact_id, client);
    }

    const { rows: afterCompanyRows } = await client.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    const { rows: afterContactRows } = activity.contact_id
      ? await client.query('SELECT * FROM contacts WHERE id = $1', [activity.contact_id])
      : { rows: [] };
    const replyAfter = await snapshotEnrollments(client, replyBefore.enrollmentIds);
    await auditRowDiff(client, auditBatchId, 'companies', beforeCompanyRows, afterCompanyRows, { route: 'activity.create.company_effects' });
    await auditRowDiff(client, auditBatchId, 'contacts', beforeContactRows, afterContactRows, { route: 'activity.create.contact_effects' });
    await auditRowDiff(client, auditBatchId, 'tasks', replyBefore.tasks, replyAfter.tasks, { route: 'activity.create.reply_tasks' });
    await auditRowDiff(client, auditBatchId, 'sequence_step_runs', replyBefore.runs, replyAfter.runs, { route: 'activity.create.reply_runs' });
    await auditRowDiff(client, auditBatchId, 'sequence_enrollments', replyBefore.enrollments, replyAfter.enrollments, { route: 'activity.create.reply_enrollments' });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  emit('activity.logged', { activity });
  res.status(201).json({ ...activity, sequences_stopped: unenrolled, audit_batch_id: auditBatchId });
}));

router.delete('/:id', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM activities WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Activity not found');
    const auditBatchId = await createAuditBatch(client, {
      action: 'activity.delete',
      summary: `Delete activity ${req.params.id}`,
      req,
      metadata: { activity_id: req.params.id, company_id: beforeRows[0].company_id },
    });
    await auditChange(client, auditBatchId, {
      table: 'activities',
      operation: 'delete',
      before: beforeRows[0],
      after: null,
      metadata: { route: 'activity.delete' },
    });
    const { rowCount } = await client.query('DELETE FROM activities WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Activity not found');
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
