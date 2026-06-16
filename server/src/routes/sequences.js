import { Router } from 'express';
import nodemailer from 'nodemailer';
import { query, pool, touchCompany } from '../db.js';
import { h, badRequest, notFound } from '../util.js';
import { emit } from '../events.js';

const router = Router();

// ---- merge fields ----
export function renderTemplate(tpl, { contact, company }) {
  const name = contact?.name || '';
  const map = {
    first_name: name.split(' ')[0] || '',
    last_name: name.split(' ').slice(1).join(' '),
    name,
    title: contact?.title || '',
    company: company?.name || '',
    domain: company?.domain || '',
  };
  return (tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (map[k] != null ? map[k] : m));
}

// ---- sequence sending identity (separate domain SMTP) ----
async function getSmtp() {
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = 'sequence_smtp'`);
  return rows[0]?.value || null;
}

function transportFor(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: Boolean(cfg.secure),
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

const fromHeader = (cfg) => (cfg.from_name ? `"${cfg.from_name}" <${cfg.from_email}>` : cfg.from_email);

// ---- step helpers ----
async function loadSteps(sequenceId) {
  const { rows } = await query(
    'SELECT * FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_order, id',
    [sequenceId]
  );
  return rows;
}

function enrollmentSummary(rows) {
  // rows: step_runs joined; compute progress for an enrollment
  const total = rows.length;
  const doneStates = new Set(['done', 'sent', 'skipped', 'failed']);
  const completed = rows.filter((r) => doneStates.has(r.status)).length;
  const next = rows.find((r) => r.status === 'pending');
  return { total, completed, next_due: next?.due_date || null, next_kind: next?.kind || null };
}

// ================= CRUD =================

router.get('/', h(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*,
       (SELECT count(*) FROM sequence_steps st WHERE st.sequence_id = s.id)::int AS step_count,
       (SELECT count(*) FROM sequence_enrollments e WHERE e.sequence_id = s.id AND e.status = 'active')::int AS active_enrollments
     FROM sequences s ORDER BY s.created_at DESC`
  );
  res.json(rows);
}));

router.get('/smtp', h(async (req, res) => {
  const cfg = await getSmtp();
  res.json({
    configured: Boolean(cfg && cfg.host && cfg.from_email),
    host: cfg?.host || '',
    port: cfg?.port || 587,
    secure: cfg?.secure || false,
    user: cfg?.user || '',
    from_name: cfg?.from_name || '',
    from_email: cfg?.from_email || '',
    has_password: Boolean(cfg?.pass),
  });
}));

router.put('/smtp', h(async (req, res) => {
  const b = req.body;
  if (!b.host || !b.from_email) throw badRequest('host and from_email are required');
  const existing = (await getSmtp()) || {};
  const value = {
    host: b.host,
    port: Number(b.port) || 587,
    secure: Boolean(b.secure),
    user: b.user || '',
    pass: b.pass !== undefined && b.pass !== '' ? b.pass : existing.pass || '',
    from_name: b.from_name || '',
    from_email: b.from_email,
  };
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('sequence_smtp', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [value]
  );
  res.json({ ok: true });
}));

router.post('/smtp/test', h(async (req, res) => {
  const cfg = await getSmtp();
  if (!cfg) throw badRequest('Configure the sending domain first');
  const transport = transportFor(cfg);
  await transport.verify();
  if (req.body.to) {
    await transport.sendMail({
      from: fromHeader(cfg),
      to: req.body.to,
      subject: 'HVAC CRM — sequence sending test',
      text: 'This confirms your sequence sending domain works. Sent from your CRM.',
    });
  }
  res.json({ ok: true, sent: Boolean(req.body.to) });
}));

router.get('/:id', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM sequences WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Sequence not found');
  res.json({ ...rows[0], steps: await loadSteps(req.params.id) });
}));

router.post('/', h(async (req, res) => {
  const b = req.body;
  if (!b.name) throw badRequest('name is required');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO sequences (name, description, active) VALUES ($1, $2, coalesce($3, true)) RETURNING *',
      [b.name, b.description || null, b.active]
    );
    const seq = rows[0];
    await insertSteps(client, seq.id, b.steps || []);
    await client.query('COMMIT');
    res.status(201).json({ ...seq, steps: await loadSteps(seq.id) });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

async function insertSteps(client, sequenceId, steps) {
  for (const [i, s] of steps.entries()) {
    await client.query(
      `INSERT INTO sequence_steps (sequence_id, step_order, day_offset, kind, task_type, description, priority, subject, body)
       VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, 'medium'), $8, $9)`,
      [sequenceId, i, Number(s.day_offset) || 0, s.kind === 'auto_email' ? 'auto_email' : 'task',
       s.task_type || null, s.description || null, s.priority || null, s.subject || null, s.body || null]
    );
  }
}

// PUT replaces the whole step list (simplest editing model).
router.put('/:id', h(async (req, res) => {
  const b = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE sequences SET name = coalesce($2, name), description = $3, active = coalesce($4, active)
       WHERE id = $1 RETURNING *`,
      [req.params.id, b.name, b.description ?? null, b.active]
    );
    if (!rows[0]) throw notFound('Sequence not found');
    if (Array.isArray(b.steps)) {
      await client.query('DELETE FROM sequence_steps WHERE sequence_id = $1', [req.params.id]);
      await insertSteps(client, req.params.id, b.steps);
    }
    await client.query('COMMIT');
    res.json({ ...rows[0], steps: await loadSteps(req.params.id) });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM sequences WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Sequence not found');
  res.status(204).end();
}));

// ================= enrollment =================

router.post('/:id/enroll', h(async (req, res) => {
  const b = req.body;
  if (!b.company_id) throw badRequest('company_id is required');
  const { rows: seqRows } = await query('SELECT * FROM sequences WHERE id = $1', [req.params.id]);
  const seq = seqRows[0];
  if (!seq) throw notFound('Sequence not found');
  const steps = await loadSteps(req.params.id);
  if (!steps.length) throw badRequest('This sequence has no steps yet');

  const { rows: companyRows } = await query(
    `SELECT name, do_not_contact, not_interested, bad_fit, suppression_reason
       FROM companies WHERE id = $1`,
    [b.company_id]
  );
  const company = companyRows[0];
  if (!company) throw notFound('Company not found');
  if (company.do_not_contact || company.not_interested || company.bad_fit) {
    throw badRequest(`Cannot enroll suppressed account: ${company.suppression_reason || company.name}`);
  }
  if (b.contact_id) {
    const { rows: contactRows } = await query(
      `SELECT name, do_not_contact, not_interested, bad_fit
         FROM contacts WHERE id = $1 AND company_id = $2`,
      [b.contact_id, b.company_id]
    );
    const contact = contactRows[0];
    if (!contact) throw badRequest('contact_id does not belong to this company');
    if (contact.do_not_contact || contact.not_interested || contact.bad_fit) {
      throw badRequest(`Cannot enroll suppressed contact: ${contact.name}`);
    }
  }

  const dup = await query(
    `SELECT id FROM sequence_enrollments WHERE sequence_id = $1 AND company_id = $2 AND status = 'active'`,
    [req.params.id, b.company_id]
  );
  if (dup.rows[0]) throw badRequest('This company is already actively enrolled in this sequence');

  let owner = b.owner || null;
  if (!owner) {
    const { rows } = await query('SELECT owner FROM companies WHERE id = $1', [b.company_id]);
    owner = rows[0]?.owner || null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: enrollRows } = await client.query(
      `INSERT INTO sequence_enrollments (sequence_id, company_id, contact_id, owner)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, b.company_id, b.contact_id || null, owner]
    );
    const enrollment = enrollRows[0];

    for (const step of steps) {
      const due = `CURRENT_DATE + ${parseInt(step.day_offset, 10) || 0}`;
      if (step.kind === 'task') {
        const { rows: taskRows } = await client.query(
          `INSERT INTO tasks (company_id, contact_id, description, due_date, priority, owner)
           VALUES ($1, $2, $3, ${due}, coalesce($4, 'medium'), $5) RETURNING id`,
          [b.company_id, b.contact_id || null,
           step.description || `${seq.name} — step`, step.priority || null, owner]
        );
        await client.query(
          `INSERT INTO sequence_step_runs (enrollment_id, step_id, kind, due_date, status, task_id)
           VALUES ($1, $2, 'task', ${due}, 'pending', $3)`,
          [enrollment.id, step.id, taskRows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO sequence_step_runs (enrollment_id, step_id, kind, due_date, status)
           VALUES ($1, $2, 'auto_email', ${due}, 'pending')`,
          [enrollment.id, step.id]
        );
      }
    }
    await client.query('COMMIT');
    await touchCompany(b.company_id);
    res.status(201).json(enrollment);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// GET /api/sequences/enrollments?company_id= — enrollments with progress
router.get('/enrollments/list', h(async (req, res) => {
  await reconcileTasks();
  const { company_id } = req.query;
  const where = [];
  const values = [];
  if (company_id) { values.push(company_id); where.push(`e.company_id = $${values.length}`); }
  const { rows: enrollments } = await query(
    `SELECT e.*, s.name AS sequence_name, ct.name AS contact_name, co.name AS company_name
     FROM sequence_enrollments e
     JOIN sequences s ON s.id = e.sequence_id
     JOIN companies co ON co.id = e.company_id
     LEFT JOIN contacts ct ON ct.id = e.contact_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY e.enrolled_at DESC LIMIT 200`,
    values
  );
  for (const e of enrollments) {
    const { rows: runs } = await query(
      `SELECT r.*, st.day_offset, st.kind AS step_kind, st.description, st.subject
       FROM sequence_step_runs r JOIN sequence_steps st ON st.id = r.step_id
       WHERE r.enrollment_id = $1 ORDER BY r.due_date, r.id`,
      [e.id]
    );
    e.runs = runs;
    Object.assign(e, enrollmentSummary(runs));
  }
  res.json(enrollments);
}));

// Cancel an enrollment's remaining steps (delete open tasks, skip pending runs).
async function cancelPendingSteps(enrollmentId) {
  const { rows: pending } = await query(
    `SELECT * FROM sequence_step_runs WHERE enrollment_id = $1 AND status = 'pending'`,
    [enrollmentId]
  );
  for (const run of pending) {
    if (run.task_id) await query('DELETE FROM tasks WHERE id = $1 AND NOT completed', [run.task_id]);
  }
  await query(
    `UPDATE sequence_step_runs SET status = 'skipped' WHERE enrollment_id = $1 AND status = 'pending'`,
    [enrollmentId]
  );
}

async function stopEnrollmentForSuppression(enrollmentId) {
  await cancelPendingSteps(enrollmentId);
  await query(
    `UPDATE sequence_enrollments SET status = 'unenrolled', finished_at = now()
     WHERE id = $1 AND status = 'active'`,
    [enrollmentId]
  );
}

// When a contact replies, pull them out of every active sequence (cadence hygiene).
// Called from the activities route when an interaction is logged with outcome 'replied',
// and from the manual "mark replied" button. Returns how many enrollments were stopped.
export async function handleContactReply(contactId) {
  if (!contactId) return 0;
  const { rows: contactRows } = await query(
    'SELECT company_id FROM contacts WHERE id = $1',
    [contactId]
  );
  const companyId = contactRows[0]?.company_id;
  await query('UPDATE contacts SET replied = true WHERE id = $1', [contactId]);
  if (companyId) {
    await query(
      `UPDATE companies
          SET replied = true,
              next_step = 'Review reply before next touch'
        WHERE id = $1`,
      [companyId]
    );
    await touchCompany(companyId);
  }
  const { rows } = await query(
    `SELECT id FROM sequence_enrollments WHERE contact_id = $1 AND status = 'active'`,
    [contactId]
  );
  for (const e of rows) {
    await cancelPendingSteps(e.id);
    await query(`UPDATE sequence_enrollments SET status = 'replied', finished_at = now() WHERE id = $1`, [e.id]);
  }
  return rows.length;
}

router.post('/enrollments/:id/replied', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM sequence_enrollments WHERE id = $1', [req.params.id]);
  const enrollment = rows[0];
  if (!enrollment) throw notFound('Enrollment not found');
  if (enrollment.contact_id) {
    await handleContactReply(enrollment.contact_id);
  } else {
    await cancelPendingSteps(req.params.id);
    await query(`UPDATE sequence_enrollments SET status = 'replied', finished_at = now() WHERE id = $1`, [req.params.id]);
    await query(
      `UPDATE companies
          SET replied = true,
              next_step = 'Review reply before next touch'
        WHERE id = $1`,
      [enrollment.company_id]
    );
    await touchCompany(enrollment.company_id);
  }
  res.json({ ok: true });
}));

router.post('/enrollments/:id/unenroll', h(async (req, res) => {
  const { rows } = await query('SELECT id FROM sequence_enrollments WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Enrollment not found');
  await cancelPendingSteps(req.params.id);
  await query(
    `UPDATE sequence_enrollments SET status = 'unenrolled', finished_at = now() WHERE id = $1`,
    [req.params.id]
  );
  res.json({ ok: true });
}));

// ================= scheduler =================

async function reconcileTasks() {
  // Manual task steps complete when their generated task is checked off.
  await query(
    `UPDATE sequence_step_runs r SET status = 'done'
     FROM tasks t WHERE r.task_id = t.id AND r.status = 'pending' AND r.kind = 'task' AND t.completed`
  );
}

async function finishEnrollments() {
  // Finish only when nothing is pending AND nothing failed — a failed step keeps the
  // enrollment active and visible so the operator can fix config and retry.
  await query(
    `UPDATE sequence_enrollments e SET status = 'finished', finished_at = now()
     WHERE status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM sequence_step_runs r
         WHERE r.enrollment_id = e.id AND r.status IN ('pending', 'failed'))`
  );
}

async function sendAutoEmail(run, cfg) {
  const { rows } = await query(
    `SELECT e.company_id, e.contact_id, co.name AS company_name, co.domain,
            co.do_not_contact AS company_dnc, co.not_interested AS company_not_interested,
            co.bad_fit AS company_bad_fit,
            ct.name AS contact_name, ct.title, ct.email,
            ct.do_not_contact AS contact_dnc, ct.not_interested AS contact_not_interested,
            ct.bad_fit AS contact_bad_fit
     FROM sequence_enrollments e
     JOIN companies co ON co.id = e.company_id
     LEFT JOIN contacts ct ON ct.id = e.contact_id
     WHERE e.id = $1`,
    [run.enrollment_id]
  );
  const ctx = rows[0];
  const fail = async (msg) => {
    await query(`UPDATE sequence_step_runs SET status = 'failed', error = $2 WHERE id = $1`, [run.id, msg]);
  };

  if (
    ctx?.company_dnc || ctx?.company_not_interested || ctx?.company_bad_fit ||
    ctx?.contact_dnc || ctx?.contact_not_interested || ctx?.contact_bad_fit
  ) {
    await stopEnrollmentForSuppression(run.enrollment_id);
    return;
  }
  if (!ctx?.email) return fail('No contact email to send to — enroll with a contact that has an email.');
  if (!cfg) return fail('Sequence sending domain is not configured (Settings → Sequence sending).');

  const company = { name: ctx.company_name, domain: ctx.domain };
  const contact = { name: ctx.contact_name, title: ctx.title };
  const subject = renderTemplate(run.subject, { contact, company });
  const body = renderTemplate(run.body, { contact, company });

  try {
    await transportFor(cfg).sendMail({ from: fromHeader(cfg), to: ctx.email, subject, text: body });
  } catch (e) {
    return fail(`Send failed: ${e.message}`);
  }

  await query(`UPDATE sequence_step_runs SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1`, [run.id]);
  await query(
    `INSERT INTO activities (company_id, contact_id, type, outcome, body)
     VALUES ($1, $2, 'email', 'sent', $3)`,
    [ctx.company_id, ctx.contact_id || null, `[Sequence] To ${ctx.email} — ${subject}\n\n${(body || '').slice(0, 2000)}`]
  );
  await touchCompany(ctx.company_id);
  if (ctx.contact_id) {
    await query('UPDATE contacts SET last_contacted_at = now() WHERE id = $1', [ctx.contact_id]);
  }
  emit('sequence.email_sent', {
    company_id: ctx.company_id, contact_id: ctx.contact_id, to: ctx.email, subject,
  });
}

// Process all due auto-email steps. Called by the scheduler and the manual run endpoint.
export async function processDueSteps() {
  await reconcileTasks();
  const cfg = await getSmtp();
  const { rows: due } = await query(
    `SELECT r.id, r.enrollment_id, st.subject, st.body
     FROM sequence_step_runs r
     JOIN sequence_enrollments e ON e.id = r.enrollment_id AND e.status = 'active'
     JOIN sequence_steps st ON st.id = r.step_id
     WHERE r.kind = 'auto_email' AND r.status = 'pending' AND r.due_date <= CURRENT_DATE
     ORDER BY r.due_date, r.id LIMIT 100`
  );
  for (const run of due) await sendAutoEmail(run, cfg);
  await finishEnrollments();
  return { processed: due.length };
}

// POST /api/sequences/run — manually trigger the scheduler (also handy for n8n)
router.post('/run', h(async (req, res) => {
  res.json(await processDueSteps());
}));

// POST /api/sequences/enrollments/:id/retry — reset failed auto-email steps and re-send
router.post('/enrollments/:id/retry', h(async (req, res) => {
  await query(
    `UPDATE sequence_step_runs SET status = 'pending', error = NULL
     WHERE enrollment_id = $1 AND kind = 'auto_email' AND status = 'failed'`,
    [req.params.id]
  );
  res.json(await processDueSteps());
}));

export default router;
