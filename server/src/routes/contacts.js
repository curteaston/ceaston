import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import { h, badRequest, notFound, buildUpdate, toInt, LEAD_STATUSES } from '../util.js';
import { emit } from '../events.js';

const router = Router();

const CONTACT_FIELDS = ['company_id', 'name', 'title', 'email', 'phone', 'source', 'last_contacted_at', 'owner', 'lead_status'];

function validateLeadStatus(status) {
  if (status && !LEAD_STATUSES.includes(status)) {
    throw badRequest(`lead_status must be one of: ${LEAD_STATUSES.join(', ')}`);
  }
}

async function resolveCompanyId({ company_id, company_domain, company_name }) {
  if (company_id) return company_id;
  if (company_domain) {
    const { rows } = await query('SELECT id FROM companies WHERE lower(domain) = lower($1)', [company_domain]);
    if (rows[0]) return rows[0].id;
  }
  if (company_name) {
    const { rows } = await query('SELECT id FROM companies WHERE lower(name) = lower($1)', [company_name]);
    if (rows[0]) return rows[0].id;
  }
  return null;
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

  if (q.q) add('(ct.name ILIKE ? OR ct.email ILIKE ? OR ct.phone ILIKE ?)', `%${q.q}%`);
  if (q.company_id) add('ct.company_id = ?', q.company_id);
  if (q.owner) add('lower(ct.owner) = lower(?)', q.owner);
  if (q.unassigned === 'true') where.push(`(ct.owner IS NULL OR ct.owner = '')`);
  if (q.lead_status) {
    const statuses = q.lead_status.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      add('ct.lead_status = ?', statuses[0]);
    } else if (statuses.length > 1) {
      where.push(`ct.lead_status = ANY(?)`);
      args.push(statuses);
    }
  }
  if (q.source) add('ct.source ILIKE ?', `%${q.source}%`);
  if (q.title) add('ct.title ILIKE ?', `%${q.title}%`);
  if (q.has_email === 'true') where.push(`ct.email IS NOT NULL AND ct.email <> ''`);
  if (q.has_phone === 'true') where.push(`ct.phone IS NOT NULL AND ct.phone <> ''`);
  if (q.created_after) add('ct.created_at >= ?', q.created_after);
  if (q.created_before) add('ct.created_at <= ?', q.created_before);
  if (q.last_contact_after) add('ct.last_contacted_at >= ?', q.last_contact_after);
  if (q.last_contact_before) add('ct.last_contacted_at <= ?', q.last_contact_before);
  if (q.never_contacted === 'true') where.push('ct.last_contacted_at IS NULL');
  if (q.inactive_days) {
    values.push(toInt(q.inactive_days));
    where.push(`(ct.last_contacted_at IS NULL OR ct.last_contacted_at < now() - ($${values.length} || ' days')::interval)`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortable = {
    name: 'ct.name', email: 'ct.email', title: 'ct.title', owner: 'ct.owner',
    lead_status: 'ct.lead_status', created_at: 'ct.created_at',
    last_contacted_at: 'ct.last_contacted_at', company_name: 'co.name',
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
    `SELECT ct.*, co.name AS company_name, co.domain AS company_domain
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
              count(*) FILTER (WHERE owner IS NULL OR owner = '')::int AS unassigned,
              count(*) FILTER (WHERE lower(owner) = lower($1))::int AS mine
       FROM contacts`,
      [me]
    ),
    query(`SELECT DISTINCT owner FROM contacts WHERE owner IS NOT NULL AND owner <> '' ORDER BY owner`),
  ]);
  res.json({ ...counts.rows[0], owners: owners.rows.map((r) => r.owner) });
}));

// POST /api/contacts/bulk — { ids: [..], action: 'update'|'delete', patch: { owner?, lead_status? } }
router.post('/bulk', h(async (req, res) => {
  const { ids, action, patch } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw badRequest('ids must be a non-empty array');
  if (ids.length > 1000) throw badRequest('Max 1000 contacts per bulk call');

  if (action === 'delete') {
    const { rowCount } = await query('DELETE FROM contacts WHERE id = ANY($1::int[])', [ids]);
    return res.json({ deleted: rowCount });
  }
  if (action === 'update') {
    validateLeadStatus(patch?.lead_status);
    const sets = [];
    const values = [];
    for (const col of ['owner', 'lead_status']) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, col)) {
        values.push(patch[col] === '' ? null : patch[col]);
        sets.push(`${col} = $${values.length}`);
      }
    }
    if (!sets.length) throw badRequest('patch must include owner and/or lead_status');
    values.push(ids);
    const { rowCount } = await query(
      `UPDATE contacts SET ${sets.join(', ')} WHERE id = ANY($${values.length}::int[])`,
      values
    );
    return res.json({ updated: rowCount });
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
       SELECT 'note' AS kind, id, body, source, NULL AS type, NULL AS outcome, created_at AS occurred_at, updated_at
         FROM notes WHERE contact_id = $1
       UNION ALL
       SELECT 'activity', id, body, NULL, type, outcome, occurred_at, NULL
         FROM activities WHERE contact_id = $1
     ) t ORDER BY occurred_at DESC`,
    [req.params.id]
  );
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const b = req.body;
  const companyId = await resolveCompanyId(b);
  if (!companyId) throw badRequest('company_id (or company_domain / company_name of an existing company) is required');
  if (!b.name) throw badRequest('name is required');
  validateLeadStatus(b.lead_status);
  const { rows } = await query(
    `INSERT INTO contacts (company_id, name, title, email, phone, source, last_contacted_at, owner, lead_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'new')) RETURNING *`,
    [companyId, b.name, b.title || null, b.email || null, b.phone || null, b.source || null,
     b.last_contacted_at || null, b.owner || null, b.lead_status || null]
  );
  await touchCompany(companyId);
  emit('contact.created', { contact: rows[0] });
  res.status(201).json(rows[0]);
}));

// POST /api/contacts/upsert — match by email (within company if resolvable), else by company+name
router.post('/upsert', h(async (req, res) => {
  const b = req.body;
  validateLeadStatus(b.lead_status);
  const companyId = await resolveCompanyId(b);
  let existing = null;

  if (b.email) {
    const { rows } = companyId
      ? await query('SELECT * FROM contacts WHERE lower(email) = lower($1) AND company_id = $2', [b.email, companyId])
      : await query('SELECT * FROM contacts WHERE lower(email) = lower($1)', [b.email]);
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
    const row = upd ? (await query(upd.text, upd.values)).rows[0] : existing;
    await touchCompany(row.company_id);
    return res.json({ ...row, upserted: 'updated' });
  }

  if (!companyId) throw badRequest('company_id (or company_domain / company_name) required to create a new contact');
  if (!b.name) throw badRequest('name is required to create a new contact');
  const { rows } = await query(
    `INSERT INTO contacts (company_id, name, title, email, phone, source, last_contacted_at, owner, lead_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'new')) RETURNING *`,
    [companyId, b.name, b.title || null, b.email || null, b.phone || null, b.source || null,
     b.last_contacted_at || null, b.owner || null, b.lead_status || null]
  );
  await touchCompany(companyId);
  emit('contact.created', { contact: rows[0] });
  res.status(201).json({ ...rows[0], upserted: 'created' });
}));

router.patch('/:id', h(async (req, res) => {
  validateLeadStatus(req.body.lead_status);
  const upd = buildUpdate('contacts', req.params.id, req.body, CONTACT_FIELDS);
  if (!upd) throw badRequest('No updatable fields provided');
  const { rows } = await query(upd.text, upd.values);
  if (!rows[0]) throw notFound('Contact not found');
  res.json(rows[0]);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Contact not found');
  res.status(204).end();
}));

export default router;
