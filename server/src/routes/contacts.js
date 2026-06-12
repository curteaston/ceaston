import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import { h, badRequest, notFound, buildUpdate } from '../util.js';

const router = Router();

const CONTACT_FIELDS = ['company_id', 'name', 'title', 'email', 'phone', 'source', 'last_contacted_at'];

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

router.get('/', h(async (req, res) => {
  const { company_id, q } = req.query;
  const where = [];
  const values = [];
  if (company_id) {
    values.push(company_id);
    where.push(`ct.company_id = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    where.push(`(ct.name ILIKE $${values.length} OR ct.email ILIKE $${values.length})`);
  }
  const { rows } = await query(
    `SELECT ct.*, co.name AS company_name FROM contacts ct
     JOIN companies co ON co.id = ct.company_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ct.name LIMIT 500`,
    values
  );
  res.json(rows);
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
  const { rows } = await query(
    `INSERT INTO contacts (company_id, name, title, email, phone, source, last_contacted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [companyId, b.name, b.title || null, b.email || null, b.phone || null, b.source || null, b.last_contacted_at || null]
  );
  await touchCompany(companyId);
  res.status(201).json(rows[0]);
}));

// POST /api/contacts/upsert — match by email (within company if resolvable), else by company+name
router.post('/upsert', h(async (req, res) => {
  const b = req.body;
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
    `INSERT INTO contacts (company_id, name, title, email, phone, source, last_contacted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [companyId, b.name, b.title || null, b.email || null, b.phone || null, b.source || null, b.last_contacted_at || null]
  );
  await touchCompany(companyId);
  res.status(201).json({ ...rows[0], upserted: 'created' });
}));

router.patch('/:id', h(async (req, res) => {
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
