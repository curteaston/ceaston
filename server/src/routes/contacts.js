import { Router } from 'express';
import { pool, query, touchCompany } from '../db.js';
import {
  auditChange,
  auditContactCascadeDelete,
  auditEnrollmentContactNulling,
  createAuditBatch,
} from '../audit.js';
import {
  h, badRequest, notFound, buildUpdate, toInt, LEAD_STATUSES, CONTACT_ROLES,
  normalizeDomain, assertEnum, rejectBlank,
} from '../util.js';
import { emit } from '../events.js';

const router = Router();

const CONTACT_FIELDS = [
  'company_id', 'name', 'first_name', 'last_name', 'title', 'contact_role', 'email', 'email_2',
  'phone', 'phone_cell', 'phone_direct', 'phone_other', 'source', 'last_contacted_at', 'owner',
  'lead_status', 'do_not_contact', 'replied', 'not_interested', 'bad_fit',
];

function validateLeadStatus(status) {
  assertEnum('lead_status', status, LEAD_STATUSES);
}

function validateContactRole(role) {
  assertEnum('contact_role', role, CONTACT_ROLES);
}

async function resolveCompanyId({ company_id, company_domain, company_name }) {
  if (company_id) return company_id;
  const domain = normalizeDomain(company_domain);
  if (domain) {
    const { rows } = await query('SELECT id FROM companies WHERE archived_at IS NULL AND lower(domain) = lower($1)', [domain]);
    if (rows[0]) return rows[0].id;
  }
  if (company_name) {
    const { rows } = await query('SELECT id FROM companies WHERE archived_at IS NULL AND lower(name) = lower($1)', [company_name]);
    if (rows[0]) return rows[0].id;
  }
  return null;
}

async function requireActiveCompany(companyId) {
  const { rows } = await query('SELECT name, archived_at FROM companies WHERE id = $1', [companyId]);
  if (!rows[0]) throw notFound('Company not found');
  if (rows[0].archived_at) throw badRequest(`Cannot add contact to archived account: ${rows[0].name}`);
}

// GET /api/contacts — list with filtering, sorting and pagination
router.get('/', h(async (req, res) => {
  const q = req.query;
  const where = [];
  const values = [];
  const add = (clause, value) => {
    values.push(value);
    where.push(clause.replaceAll('?', `$${values.length}`));
  };

  const archiveMode = String(q.archived || '').toLowerCase();
  if (archiveMode === 'true' || archiveMode === 'archived') where.push('co.archived_at IS NOT NULL');
  else if (!['all', 'include', 'include_archived'].includes(archiveMode) && !q.company_id) where.push('co.archived_at IS NULL');
  if (q.q) add('(ct.name ILIKE ? OR ct.email ILIKE ? OR ct.phone ILIKE ?)', `%${q.q}%`);
  if (q.company_id) add('ct.company_id = ?', q.company_id);
  if (q.owner) add('lower(ct.owner) = lower(?)', q.owner);
  if (q.unassigned === 'true') where.push(`(ct.owner IS NULL OR ct.owner = '')`);
  if (q.lead_status) {
    const statuses = q.lead_status.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      add('ct.lead_status = ?', statuses[0]);
    } else if (statuses.length > 1) {
      values.push(statuses);
      where.push(`ct.lead_status = ANY($${values.length})`);
    }
  }
  if (q.source) add('ct.source ILIKE ?', `%${q.source}%`);
  if (q.title) add('ct.title ILIKE ?', `%${q.title}%`);
  if (q.contact_role) add('ct.contact_role = ?', q.contact_role);
  if (q.has_email === 'true') where.push(`ct.email IS NOT NULL AND ct.email <> ''`);
  if (q.has_phone === 'true') where.push(`ct.phone IS NOT NULL AND ct.phone <> ''`);
  if (q.do_not_contact === 'true') where.push('ct.do_not_contact');
  if (q.suppressed === 'true') where.push('(ct.do_not_contact OR ct.not_interested OR ct.bad_fit)');
  if (q.suppressed === 'false') where.push('NOT (ct.do_not_contact OR ct.not_interested OR ct.bad_fit)');
  if (q.replied === 'true') where.push('ct.replied');
  if (q.not_interested === 'true') where.push('ct.not_interested');
  if (q.bad_fit === 'true') where.push('ct.bad_fit');
  if (q.created_after) add('ct.created_at >= ?', q.created_after);
  if (q.created_before) add('ct.created_at <= ?', q.created_before);
  if (q.last_contact_after) add('ct.last_contacted_at >= ?', q.last_contact_after);
  if (q.last_contact_before) add('ct.last_contacted_at <= ?', q.last_contact_before);
  if (q.never_contacted === 'true') where.push('ct.last_contacted_at IS NULL');
  if (q.tags) {
    const tagNames = q.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagNames.length) {
      values.push(tagNames);
      where.push(`EXISTS (SELECT 1 FROM contact_tags ct2 JOIN tags t2 ON t2.id = ct2.tag_id WHERE ct2.contact_id = ct.id AND t2.name = ANY($${values.length}))`);
    }
  }
  if (q.inactive_days) {
    values.push(toInt(q.inactive_days));
    where.push(`(ct.last_contacted_at IS NULL OR ct.last_contacted_at < now() - ($${values.length} || ' days')::interval)`);
  }
  if (q.email_contains) add('ct.email ILIKE ?', `%${q.email_contains}%`);
  if (q.phone_contains) add('ct.phone ILIKE ?', `%${q.phone_contains}%`);
  if (q.company_name) add('co.name ILIKE ?', `%${q.company_name}%`);
  if (q.company_industry) add('co.industry ILIKE ?', `%${q.company_industry}%`);
  if (q.company_type) add('co.type = ?', q.company_type);
  if (q.company_lifecycle_stage) add('co.lifecycle_stage = ?', q.company_lifecycle_stage);
  if (q.company_lead_status) add('co.lead_status = ?', q.company_lead_status);
  if (q.company_owner) add('lower(co.owner) = lower(?)', q.company_owner);
  if (q.company_city) add('co.city ILIKE ?', `%${q.company_city}%`);
  if (q.company_state) add('co.state ILIKE ?', `%${q.company_state}%`);
  if (q.company_postal_code) add('co.postal_code ILIKE ?', `%${q.company_postal_code}%`);
  if (q.company_timezone) add('co.timezone = ?', q.company_timezone);
  if (q.company_ad_spend) add('co.ad_spend_range = ?', q.company_ad_spend);
  if (q.company_revenue_min) add('co.annual_revenue >= ?', Number(q.company_revenue_min));
  if (q.company_revenue_max) add('co.annual_revenue <= ?', Number(q.company_revenue_max));
  if (q.company_employee_min) add('co.employee_count >= ?', toInt(q.company_employee_min));
  if (q.company_employee_max) add('co.employee_count <= ?', toInt(q.company_employee_max));

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortable = {
    name: 'ct.name', email: 'ct.email', title: 'ct.title', owner: 'ct.owner',
    lead_status: 'ct.lead_status', created_at: 'ct.created_at',
    last_contacted_at: 'ct.last_contacted_at', company_name: 'co.name',
    contact_role: 'ct.contact_role',
  };
  const sort = sortable[q.sort] || 'ct.name';
  const order = q.order === 'desc' ? 'DESC' : 'ASC';
  const limit = Math.min(toInt(q.limit) || 25, 10000);
  const offset = toInt(q.offset) || 0;

  const countQ = await query(
    `SELECT count(*)::int AS total FROM contacts ct JOIN companies co ON co.id = ct.company_id ${whereSql}`,
    values
  );
  const { rows } = await query(
    `SELECT ct.*, co.name AS company_name, co.domain AS company_domain,
       (SELECT coalesce(json_agg(t.name ORDER BY t.name), '[]'::json) FROM tags t JOIN contact_tags ctt ON ctt.tag_id = t.id WHERE ctt.contact_id = ct.id) AS tags
     FROM contacts ct JOIN companies co ON co.id = ct.company_id
     ${whereSql} ORDER BY ${sort} ${order} NULLS LAST
     LIMIT ${limit} OFFSET ${offset}`,
    values
  );
  res.json({ total: countQ.rows[0].total, limit, offset, contacts: rows });
}));

// GET /api/contacts/facets?me=Curt — tab counts and distinct owners for filter dropdowns
router.get('/facets', h(async (req, res) => {
  const me = req.query.me || '';
  const [counts, owners] = await Promise.all([
    query(
      `SELECT count(*)::int AS all,
              count(*) FILTER (WHERE ct.owner IS NULL OR ct.owner = '')::int AS unassigned,
              count(*) FILTER (WHERE lower(ct.owner) = lower($1))::int AS mine
       FROM contacts ct JOIN companies co ON co.id = ct.company_id
       WHERE co.archived_at IS NULL`,
      [me]
    ),
    query(
      `SELECT DISTINCT ct.owner
         FROM contacts ct JOIN companies co ON co.id = ct.company_id
        WHERE co.archived_at IS NULL AND ct.owner IS NOT NULL AND ct.owner <> ''
        ORDER BY ct.owner`
    ),
  ]);
  res.json({ ...counts.rows[0], owners: owners.rows.map((r) => r.owner) });
}));

// POST /api/contacts/bulk — { ids: [..], action: 'update'|'delete', patch: { owner?, lead_status? } }
router.post('/bulk', h(async (req, res) => {
  const { ids, action, patch } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw badRequest('ids must be a non-empty array');
  if (ids.length > 1000) throw badRequest('Max 1000 contacts per bulk call');

  if (action === 'delete') {
    const client = await pool.connect();
    let auditBatchId;
    try {
      await client.query('BEGIN');
      auditBatchId = await createAuditBatch(client, {
        action: 'contacts.bulk.delete',
        summary: `Bulk delete ${ids.length} contacts`,
        req,
        metadata: { ids },
      });
      const { enrollmentBeforeRows } = await auditContactCascadeDelete(client, auditBatchId, ids, { route: 'contacts.bulk.delete' });
      const { rowCount } = await client.query('DELETE FROM contacts WHERE id = ANY($1::int[])', [ids]);
      await auditEnrollmentContactNulling(client, auditBatchId, enrollmentBeforeRows, { route: 'contacts.bulk.delete' });
      await client.query('COMMIT');
      return res.json({ deleted: rowCount, audit_batch_id: auditBatchId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  if (action === 'update') {
    const cleanPatch = { ...(patch || {}) };
    if (Object.prototype.hasOwnProperty.call(cleanPatch, 'lead_status')) {
      cleanPatch.lead_status = rejectBlank('lead_status', cleanPatch.lead_status);
    }
    validateLeadStatus(cleanPatch.lead_status);
    validateContactRole(cleanPatch.contact_role);
    const sets = [];
    const values = [];
    for (const col of ['owner', 'lead_status', 'contact_role', 'do_not_contact', 'replied', 'not_interested', 'bad_fit']) {
      if (Object.prototype.hasOwnProperty.call(cleanPatch, col)) {
        values.push(cleanPatch[col] === '' ? null : cleanPatch[col]);
        sets.push(`${col} = $${values.length}`);
      }
    }
    if (!sets.length) throw badRequest('patch did not include updatable fields');
    values.push(ids);
    const client = await pool.connect();
    let rows;
    let auditBatchId;
    try {
      await client.query('BEGIN');
      auditBatchId = await createAuditBatch(client, {
        action: 'contacts.bulk.update',
        summary: `Bulk update ${ids.length} contacts`,
        req,
        metadata: { ids, patch: cleanPatch },
      });
      const beforeRows = await client.query('SELECT * FROM contacts WHERE id = ANY($1::int[]) ORDER BY id', [ids]);
      ({ rows } = await client.query(
        `UPDATE contacts SET ${sets.join(', ')} WHERE id = ANY($${values.length}::int[]) RETURNING *`,
        values
      ));
      const beforeById = new Map(beforeRows.rows.map((row) => [row.id, row]));
      for (const row of rows) {
        await auditChange(client, auditBatchId, {
          table: 'contacts',
          operation: 'update',
          before: beforeById.get(row.id),
          after: row,
          metadata: { route: 'contacts.bulk.update' },
        });
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return res.json({ updated: rows.length, audit_batch_id: auditBatchId });
  }
  throw badRequest(`action must be 'update' or 'delete'`);
}));

router.get('/:id', h(async (req, res) => {
  const { rows } = await query(
    `SELECT ct.*, co.name AS company_name FROM contacts ct
     JOIN companies co ON co.id = ct.company_id WHERE ct.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw notFound('Contact not found');
  res.json(rows[0]);
}));

// GET /api/contacts/:id/history — individual conversation history (activities + notes)
router.get('/:id/history', h(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'note' AS kind, id, body, source, NULL AS type, NULL AS outcome, created_at AS occurred_at, updated_at, pinned, false AS completed
         FROM notes WHERE contact_id = $1
       UNION ALL
       SELECT 'activity', id, body, NULL, type, outcome, occurred_at, NULL, false, false
         FROM activities WHERE contact_id = $1
       UNION ALL
       SELECT 'task', id,
              concat(description, CASE WHEN due_date IS NOT NULL THEN E'\nDue: ' || due_date::text ELSE '' END),
              NULL, 'task', CASE WHEN completed THEN 'completed' ELSE priority END, created_at, NULL, false, completed
         FROM tasks WHERE contact_id = $1
      ) t ORDER BY pinned DESC, occurred_at DESC`,
    [req.params.id]
  );
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const b = { ...req.body };
  const companyId = await resolveCompanyId(b);
  if (!companyId) throw badRequest('company_id, company_domain, or company_name is required');
  await requireActiveCompany(companyId);
  if (Object.prototype.hasOwnProperty.call(b, 'name')) b.name = String(b.name || '').trim();
  if (Object.prototype.hasOwnProperty.call(b, 'first_name')) b.first_name = String(b.first_name || '').trim();
  if (Object.prototype.hasOwnProperty.call(b, 'last_name')) b.last_name = String(b.last_name || '').trim();
  if (!b.name && !b.first_name && !b.last_name) b.name = '(unnamed)';
  if (!b.name) b.name = [b.first_name, b.last_name].filter(Boolean).join(' ') || '(unnamed)';
  validateLeadStatus(b.lead_status);
  validateContactRole(b.contact_role);
  const client = await pool.connect();
  let contact;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    auditBatchId = await createAuditBatch(client, {
      action: 'contact.create',
      summary: `Create contact ${b.name}`,
      req,
      metadata: { company_id: companyId },
    });
    const { rows } = await client.query(
      `INSERT INTO contacts (
         company_id, name, first_name, last_name, title, contact_role, email, email_2, phone,
         phone_cell, phone_direct, phone_other, source, last_contacted_at, owner, lead_status,
         do_not_contact, replied, not_interested, bad_fit
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, coalesce($16, 'new'),
         coalesce($17, false), coalesce($18, false), coalesce($19, false), coalesce($20, false)
       ) RETURNING *`,
      [companyId, b.name, b.first_name || null, b.last_name || null, b.title || null,
       b.contact_role || null, b.email || null, b.email_2 || null, b.phone || null,
       b.phone_cell || null, b.phone_direct || null, b.phone_other || null, b.source || null,
       b.last_contacted_at || null, b.owner || null, b.lead_status || null,
       b.do_not_contact, b.replied, b.not_interested, b.bad_fit]
    );
    contact = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'contacts',
      operation: 'insert',
      before: null,
      after: contact,
      metadata: { route: 'contact.create' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await touchCompany(companyId);
  emit('contact.created', { contact });
  res.status(201).json({ ...contact, audit_batch_id: auditBatchId });
}));

// POST /api/contacts/upsert — match by email (within company if resolvable), else by company+name
router.post('/upsert', h(async (req, res) => {
  const b = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(b, 'name')) b.name = rejectBlank('name', b.name);
  if (Object.prototype.hasOwnProperty.call(b, 'lead_status')) b.lead_status = rejectBlank('lead_status', b.lead_status);
  validateLeadStatus(b.lead_status);
  validateContactRole(b.contact_role);
  const companyId = await resolveCompanyId(b);
  if (companyId) await requireActiveCompany(companyId);
  let existing = null;

  if (b.email) {
    const { rows } = companyId
      ? await query('SELECT * FROM contacts WHERE lower(email) = lower($1) AND company_id = $2', [b.email, companyId])
      : await query(
        `SELECT ct.* FROM contacts ct
         JOIN companies co ON co.id = ct.company_id
         WHERE co.archived_at IS NULL AND lower(ct.email) = lower($1)`,
        [b.email]
      );
    existing = rows[0] || null;
  }
  if (!existing && companyId && b.name) {
    const { rows } = await query(
      'SELECT * FROM contacts WHERE company_id = $1 AND lower(name) = lower($2)',
      [companyId, b.name]
    );
    existing = rows[0] || null;
  }

  if (existing) {
    const upd = buildUpdate('contacts', existing.id, b, CONTACT_FIELDS.filter((f) => f !== 'company_id'));
    let row = existing;
    let auditBatchId = null;
    if (upd) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        auditBatchId = await createAuditBatch(client, {
          action: 'contact.upsert.update',
          summary: `Upsert update contact ${existing.id}`,
          req,
          metadata: { contact_id: existing.id, patch: b },
        });
        const { rows } = await client.query(upd.text, upd.values);
        row = rows[0];
        await auditChange(client, auditBatchId, {
          table: 'contacts',
          operation: 'update',
          before: existing,
          after: row,
          metadata: { route: 'contact.upsert.update' },
        });
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    await touchCompany(row.company_id);
    return res.json({ ...row, upserted: 'updated', audit_batch_id: auditBatchId });
  }

  if (!companyId) throw badRequest('company_id (or company_domain / company_name) required to create a new contact');
  if (!b.name) throw badRequest('name is required to create a new contact');
  const client = await pool.connect();
  let contact;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    auditBatchId = await createAuditBatch(client, {
      action: 'contact.upsert.create',
      summary: `Upsert create contact ${b.name}`,
      req,
      metadata: { company_id: companyId },
    });
    const { rows } = await client.query(
      `INSERT INTO contacts (
         company_id, name, first_name, last_name, title, contact_role, email, email_2, phone,
         phone_cell, phone_direct, phone_other, source, last_contacted_at, owner, lead_status,
         do_not_contact, replied, not_interested, bad_fit
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, coalesce($16, 'new'),
         coalesce($17, false), coalesce($18, false), coalesce($19, false), coalesce($20, false)
       ) RETURNING *`,
      [companyId, b.name, b.first_name || null, b.last_name || null, b.title || null,
       b.contact_role || null, b.email || null, b.email_2 || null, b.phone || null,
       b.phone_cell || null, b.phone_direct || null, b.phone_other || null, b.source || null,
       b.last_contacted_at || null, b.owner || null, b.lead_status || null,
       b.do_not_contact, b.replied, b.not_interested, b.bad_fit]
    );
    contact = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'contacts',
      operation: 'insert',
      before: null,
      after: contact,
      metadata: { route: 'contact.upsert.create' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await touchCompany(companyId);
  emit('contact.created', { contact });
  res.status(201).json({ ...contact, upserted: 'created', audit_batch_id: auditBatchId });
}));

router.patch('/:id', h(async (req, res) => {
  const body = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(body, 'name')) body.name = rejectBlank('name', body.name);
  if (Object.prototype.hasOwnProperty.call(body, 'lead_status')) body.lead_status = rejectBlank('lead_status', body.lead_status);
  validateLeadStatus(body.lead_status);
  validateContactRole(body.contact_role);
  const upd = buildUpdate('contacts', req.params.id, body, CONTACT_FIELDS);
  if (!upd) throw badRequest('No updatable fields provided');
  const client = await pool.connect();
  let contact;
  let auditBatchId;
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
    if (!beforeRows[0]) throw notFound('Contact not found');
    auditBatchId = await createAuditBatch(client, {
      action: 'contact.update',
      summary: `Update contact ${req.params.id}`,
      req,
      metadata: { contact_id: req.params.id, patch: body },
    });
    const { rows } = await client.query(upd.text, upd.values);
    contact = rows[0];
    await auditChange(client, auditBatchId, {
      table: 'contacts',
      operation: 'update',
      before: beforeRows[0],
      after: contact,
      metadata: { route: 'contact.update' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ ...contact, audit_batch_id: auditBatchId });
}));

router.delete('/:id', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
    if (!existing[0]) throw notFound('Contact not found');
    const auditBatchId = await createAuditBatch(client, {
      action: 'contact.delete',
      summary: `Delete contact ${existing[0].name}`,
      req,
      metadata: { contact_id: req.params.id },
    });
    const { enrollmentBeforeRows } = await auditContactCascadeDelete(client, auditBatchId, [req.params.id], { route: 'contact.delete' });
    const { rowCount } = await client.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Contact not found');
    await auditEnrollmentContactNulling(client, auditBatchId, enrollmentBeforeRows, { route: 'contact.delete' });
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
