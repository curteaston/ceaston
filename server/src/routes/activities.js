import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import { h, badRequest, notFound } from '../util.js';
import { emit } from '../events.js';
import { handleContactReply } from './sequences.js';

const router = Router();

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

async function applyProspectingOutcome(activity) {
  const flags = classifyOutcome(activity.outcome, activity.body);
  const lastTouch = activity.type || null;
  await query(
    `UPDATE companies
        SET last_touch_channel = coalesce($2, last_touch_channel)
      WHERE id = $1`,
    [activity.company_id, lastTouch]
  );

  if (activity.contact_id) {
    await query(
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
    await query(
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
  let companyId = b.company_id || null;
  if (!companyId && b.contact_id) {
    const { rows } = await query('SELECT company_id FROM contacts WHERE id = $1', [b.contact_id]);
    companyId = rows[0]?.company_id;
  }
  if (!companyId) throw badRequest('company_id or contact_id is required');
  const { rows: companyRows } = await query('SELECT name, archived_at FROM companies WHERE id = $1', [companyId]);
  if (!companyRows[0]) throw notFound('Company not found');
  if (companyRows[0].archived_at) throw badRequest(`Cannot add activity to archived account: ${companyRows[0].name}`);

  const { rows } = await query(
    `INSERT INTO activities (company_id, contact_id, type, outcome, body, occurred_at)
     VALUES ($1, $2, coalesce($3, 'call'), $4, $5, coalesce($6, now())) RETURNING *`,
    [companyId, b.contact_id || null, b.type || null, b.outcome || null, b.body || null, b.occurred_at || null]
  );
  const activity = rows[0];
  emit('activity.logged', { activity });
  await touchCompany(companyId, activity.occurred_at);
  await applyProspectingOutcome(activity);
  if (activity.contact_id) {
    await query(
      `UPDATE contacts SET last_contacted_at = GREATEST(coalesce(last_contacted_at, 'epoch'), $2) WHERE id = $1`,
      [activity.contact_id, activity.occurred_at]
    );
  }
  // A reply pulls the contact out of any active sequence (cadence hygiene).
  let unenrolled = 0;
  if (activity.contact_id && (activity.outcome || '').toLowerCase() === 'replied') {
    unenrolled = await handleContactReply(activity.contact_id);
  }
  res.status(201).json({ ...activity, sequences_stopped: unenrolled });
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM activities WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Activity not found');
  res.status(204).end();
}));

export default router;
