import { Router } from 'express';
import { query, touchCompany } from '../db.js';
import {
  h, badRequest, notFound, buildUpdate, toInt, LIFECYCLE_STAGES,
  TARGET_TIERS, BUYING_COMMITTEE_STATUSES, normalizeDomain,
} from '../util.js';
import { emit } from '../events.js';

const router = Router();

const COMPANY_FIELDS = [
  'name', 'domain', 'industry', 'employee_count', 'ad_spend_range', 'website', 'phone',
  'owner', 'lifecycle_stage', 'city', 'state', 'lead_status', 'type', 'postal_code',
  'annual_revenue', 'timezone', 'description', 'target_tier', 'source', 'campaign',
  'last_touch_channel', 'next_step', 'buying_committee_status', 'do_not_contact',
  'replied', 'not_interested', 'bad_fit', 'suppression_reason',
];

function validateLifecycle(stage) {
  if (stage && !LIFECYCLE_STAGES.includes(stage)) {
    throw badRequest(`lifecycle_stage must be one of: ${LIFECYCLE_STAGES.join(', ')}`);
  }
}

function validateProspectingFields(b) {
  if (b.target_tier && !TARGET_TIERS.includes(b.target_tier)) {
    throw badRequest(`target_tier must be one of: ${TARGET_TIERS.join(', ')}`);
  }
  if (b.buying_committee_status && !BUYING_COMMITTEE_STATUSES.includes(b.buying_committee_status)) {
    throw badRequest(`buying_committee_status must be one of: ${BUYING_COMMITTEE_STATUSES.join(', ')}`);
  }
}

// Shared timeline query: notes + activities for a company, pinned notes first then newest first.
export async function companyTimeline(companyId) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'note' AS kind, n.id, n.contact_id, c.name AS contact_name, n.body,
              n.source, NULL AS type, NULL AS outcome, n.created_at AS occurred_at, n.updated_at,
              n.pinned
         FROM notes n LEFT JOIN contacts c ON c.id = n.contact_id
        WHERE n.company_id = $1
       UNION ALL
       SELECT 'activity', a.id, a.contact_id, c.name, a.body,
              NULL, a.type, a.outcome, a.occurred_at, NULL,
              false
         FROM activities a LEFT JOIN contacts c ON c.id = a.contact_id
        WHERE a.company_id = $1
     ) t ORDER BY pinned DESC, occurred_at DESC`,
    [companyId]
  );
  return rows;
}

export async function fullCompanyPayload(companyId) {
  const { rows } = await query('SELECT * FROM companies WHERE id = $1', [companyId]);
  if (!rows[0]) return null;
  const [contacts, deals, tasks, timeline, tagsResult] = await Promise.all([
    query('SELECT * FROM contacts WHERE company_id = $1 ORDER BY name', [companyId]),
    query('SELECT * FROM deals WHERE company_id = $1 ORDER BY created_at DESC', [companyId]),
    query(
      `SELECT t.*, c.name AS contact_name FROM tasks t
       LEFT JOIN contacts c ON c.id = t.contact_id
       WHERE t.company_id = $1 OR t.contact_id IN (SELECT id FROM contacts WHERE company_id = $1)
       ORDER BY completed, due_date NULLS LAST, priority`,
      [companyId]
    ),
    companyTimeline(companyId),
    query('SELECT t.* FROM tags t JOIN company_tags ct ON ct.tag_id = t.id WHERE ct.company_id = $1', [companyId]),
  ]);
  return { ...rows[0], contacts: contacts.rows, deals: deals.rows, tasks: tasks.rows, timeline, tags: tagsResult.rows };
}

// GET /api/companies — list with filtering, segmentation, search, pagination
router.get('/', h(async (req, res) => {
  const q = req.query;
  const where = [];
  const values = [];
  const add = (clause, value) => {
    values.push(value);
    where.push(clause.replace('?', `$${values.length}`));
  };

  if (q.q) {
    values.push(`%${q.q}%`);
    where.push(`(co.name ILIKE $${values.length} OR co.domain ILIKE $${values.length})`);
  }
  if (q.industry) add('co.industry = ?', q.industry);
  if (q.ad_spend_range) add('co.ad_spend_range = ?', q.ad_spend_range);
  if (q.owner) add('lower(co.owner) = lower(?)', q.owner);
  if (q.unassigned === 'true') where.push(`(co.owner IS NULL OR co.owner = '')`);
  if (q.lifecycle_stage) add('co.lifecycle_stage = ?', q.lifecycle_stage);
  if (q.created_after) add('co.created_at >= ?', q.created_after);
  if (q.created_before) add('co.created_at <= ?', q.created_before);
  if (q.employee_min) add('co.employee_count >= ?', toInt(q.employee_min));
  if (q.employee_max) add('co.employee_count <= ?', toInt(q.employee_max));
  if (q.last_contact_after) add('co.last_activity_at >= ?', q.last_contact_after);
  if (q.last_contact_before) add('co.last_activity_at <= ?', q.last_contact_before);
  if (q.inactive_days) {
    values.push(toInt(q.inactive_days));
    where.push(`(co.last_activity_at IS NULL OR co.last_activity_at < now() - ($${values.length} || ' days')::interval)`);
  }
  if (q.deal_stage) add('EXISTS (SELECT 1 FROM deals d WHERE d.company_id = co.id AND d.stage = ?)', q.deal_stage);
  if (q.no_deals === 'true') where.push('NOT EXISTS (SELECT 1 FROM deals d WHERE d.company_id = co.id)');
  if (q.city) add('co.city ILIKE ?', `%${q.city}%`);
  if (q.state) add('co.state ILIKE ?', `%${q.state}%`);
  if (q.type) add('co.type = ?', q.type);
  if (q.postal_code) add('co.postal_code ILIKE ?', `%${q.postal_code}%`);
  if (q.timezone) add('co.timezone = ?', q.timezone);
  if (q.revenue_min) add('co.annual_revenue >= ?', Number(q.revenue_min));
  if (q.revenue_max) add('co.annual_revenue <= ?', Number(q.revenue_max));
  if (q.lead_status) add('co.lead_status = ?', q.lead_status);
  if (q.target_tier) add('co.target_tier = ?', q.target_tier);
  if (q.source) add('co.source ILIKE ?', `%${q.source}%`);
  if (q.campaign) add('co.campaign ILIKE ?', `%${q.campaign}%`);
  if (q.last_touch_channel) add('co.last_touch_channel = ?', q.last_touch_channel);
  if (q.buying_committee_status) add('co.buying_committee_status = ?', q.buying_committee_status);
  if (q.do_not_contact === 'true') where.push('co.do_not_contact');
  if (q.suppressed === 'true') where.push('(co.do_not_contact OR co.not_interested OR co.bad_fit)');
  if (q.suppressed === 'false') where.push('NOT (co.do_not_contact OR co.not_interested OR co.bad_fit)');
  if (q.replied === 'true') where.push('co.replied');
  if (q.not_interested === 'true') where.push('co.not_interested');
  if (q.bad_fit === 'true') where.push('co.bad_fit');
  if (q.next_step) add('co.next_step ILIKE ?', `%${q.next_step}%`);
  if (q.needs_next_action === 'true') where.push(`NOT (co.do_not_contact OR co.not_interested OR co.bad_fit) AND (co.next_step IS NULL OR co.next_step = '')`);
  if (q.has_phone === 'true') where.push(`(co.phone IS NOT NULL AND co.phone <> '')`);
  if (q.description) add('co.description ILIKE ?', `%${q.description}%`);
  if (q.domain) add('co.domain ILIKE ?', `%${q.domain}%`);
  if (q.contact_min) {
    values.push(toInt(q.contact_min));
    where.push(`(SELECT count(*) FROM contacts WHERE company_id = co.id) >= $${values.length}`);
  }
  if (q.contact_max) {
    values.push(toInt(q.contact_max));
    where.push(`(SELECT count(*) FROM contacts WHERE company_id = co.id) <= $${values.length}`);
  }
  if (q.pipeline_min) {
    values.push(Number(q.pipeline_min));
    where.push(`(SELECT coalesce(sum(value),0) FROM deals WHERE company_id = co.id AND stage NOT IN ('won','lost')) >= $${values.length}`);
  }
  if (q.pipeline_max) {
    values.push(Number(q.pipeline_max));
    where.push(`(SELECT coalesce(sum(value),0) FROM deals WHERE company_id = co.id AND stage NOT IN ('won','lost')) <= $${values.length}`);
  }
  if (q.task_min) {
    values.push(toInt(q.task_min));
    where.push(`(SELECT count(*) FROM tasks WHERE company_id = co.id AND NOT completed) >= $${values.length}`);
  }
  if (q.task_max) {
    values.push(toInt(q.task_max));
    where.push(`(SELECT count(*) FROM tasks WHERE company_id = co.id AND NOT completed) <= $${values.length}`);
  }
  if (q.tags) {
    const tagNames = q.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagNames.length) {
      values.push(tagNames);
      where.push(`EXISTS (SELECT 1 FROM company_tags ct2 JOIN tags t2 ON t2.id = ct2.tag_id WHERE ct2.company_id = co.id AND t2.name = ANY($${values.length}))`);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortable = {
    name: 'co.name',
    created_at: 'co.created_at',
    last_activity_at: 'co.last_activity_at',
    employee_count: 'co.employee_count',
    owner: 'co.owner',
    lifecycle_stage: 'co.lifecycle_stage',
    target_tier: 'co.target_tier',
    buying_committee_status: 'co.buying_committee_status',
  };
  const sort = sortable[q.sort] || 'co.last_activity_at';
  const order = q.order === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(toInt(q.limit) || 100, 500);
  const offset = toInt(q.offset) || 0;

  const countQ = await query(`SELECT count(*)::int AS total FROM companies co ${whereSql}`, values);
  const { rows } = await query(
    `SELECT co.*,
       (SELECT count(*) FROM contacts ct WHERE ct.company_id = co.id)::int AS contact_count,
       (SELECT count(*) FROM tasks t WHERE t.company_id = co.id AND NOT t.completed)::int AS open_task_count,
       (SELECT coalesce(sum(d.value), 0) FROM deals d WHERE d.company_id = co.id AND d.stage NOT IN ('won','lost')) AS open_deal_value,
       (SELECT d.stage FROM deals d WHERE d.company_id = co.id ORDER BY d.updated_at DESC LIMIT 1) AS latest_deal_stage,
       (SELECT a.type FROM activities a WHERE a.company_id = co.id ORDER BY a.occurred_at DESC LIMIT 1) AS latest_activity_type,
       (SELECT coalesce(json_agg(t.name ORDER BY t.name), '[]'::json) FROM tags t JOIN company_tags ct ON ct.tag_id = t.id WHERE ct.company_id = co.id) AS tags
     FROM companies co ${whereSql}
     ORDER BY ${sort} ${order} NULLS LAST
     LIMIT ${limit} OFFSET ${offset}`,
    values
  );
  res.json({ total: countQ.rows[0].total, limit, offset, companies: rows });
}));

// POST /api/companies/bulk — { ids, action: 'update'|'delete', patch: { owner?, lifecycle_stage? } }
router.post('/bulk', h(async (req, res) => {
  const { ids, action, patch } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw badRequest('ids must be a non-empty array');
  if (ids.length > 1000) throw badRequest('Max 1000 companies per bulk call');

  if (action === 'delete') {
    const { rowCount } = await query('DELETE FROM companies WHERE id = ANY($1::int[])', [ids]);
    return res.json({ deleted: rowCount });
  }
  if (action === 'update') {
    if (patch?.lifecycle_stage && !LIFECYCLE_STAGES.includes(patch.lifecycle_stage)) {
      throw badRequest('Invalid lifecycle_stage');
    }
    validateProspectingFields(patch || {});
    const sets = [];
    const values = [];
    for (const col of [
      'owner', 'lifecycle_stage', 'target_tier', 'source', 'campaign', 'last_touch_channel',
      'next_step', 'buying_committee_status', 'do_not_contact', 'replied', 'not_interested',
      'bad_fit', 'suppression_reason',
    ]) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, col)) {
        values.push(patch[col] === '' ? null : patch[col]);
        sets.push(`${col} = $${values.length}`);
      }
    }
    if (!sets.length) throw badRequest('patch did not include updatable fields');
    values.push(ids);
    const { rowCount } = await query(
      `UPDATE companies SET ${sets.join(', ')} WHERE id = ANY($${values.length}::int[])`,
      values
    );
    return res.json({ updated: rowCount });
  }
  throw badRequest(`action must be 'update' or 'delete'`);
}));

// GET /api/companies/facets?me=Curt — tab counts and distinct owners
router.get('/facets', h(async (req, res) => {
  const me = req.query.me || '';
  const [counts, owners] = await Promise.all([
    query(
      `SELECT count(*)::int AS all,
              count(*) FILTER (WHERE owner IS NULL OR owner = '')::int AS unassigned,
              count(*) FILTER (WHERE lower(owner) = lower($1))::int AS mine
       FROM companies`,
      [me]
    ),
    query(`SELECT DISTINCT owner FROM companies WHERE owner IS NOT NULL AND owner <> '' ORDER BY owner`),
  ]);
  res.json({ ...counts.rows[0], owners: owners.rows.map((r) => r.owner) });
}));

// GET /api/companies/lookup?domain=acme.com (or ?name=) — full payload for n8n
router.get('/lookup', h(async (req, res) => {
  const { domain, name } = req.query;
  if (!domain && !name) throw badRequest('Provide ?domain= or ?name=');
  const normalizedDomain = normalizeDomain(domain);
  const { rows } = domain
    ? await query('SELECT id FROM companies WHERE lower(domain) = lower($1)', [normalizedDomain])
    : await query('SELECT id FROM companies WHERE lower(name) = lower($1)', [name]);
  if (!rows[0]) throw notFound('Company not found');
  res.json(await fullCompanyPayload(rows[0].id));
}));

router.get('/:id', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Company not found');
  res.json(rows[0]);
}));

// GET /api/companies/:id/full — company + contacts + deals + tasks + timeline in one payload
router.get('/:id/full', h(async (req, res) => {
  const payload = await fullCompanyPayload(req.params.id);
  if (!payload) throw notFound('Company not found');
  res.json(payload);
}));

router.get('/:id/timeline', h(async (req, res) => {
  res.json(await companyTimeline(req.params.id));
}));

router.post('/', h(async (req, res) => {
  const b = req.body;
  if (!b.name) throw badRequest('name is required');
  validateLifecycle(b.lifecycle_stage);
  validateProspectingFields(b);
  const domain = normalizeDomain(b.domain || b.website);
  const { rows } = await query(
    `INSERT INTO companies (
       name, domain, industry, employee_count, ad_spend_range, website, phone, owner, lifecycle_stage,
       city, state, lead_status, type, postal_code, annual_revenue, timezone, description,
       target_tier, source, campaign, last_touch_channel, next_step, buying_committee_status,
       do_not_contact, replied, not_interested, bad_fit, suppression_reason
     )
     VALUES (
       $1, $2, coalesce($3, 'HVAC'), $4, $5, $6, $7, $8, coalesce($9, 'lead'),
       $10, $11, $12, $13, $14, $15, $16, $17,
       $18, $19, $20, $21, $22, coalesce($23, 'unknown'),
       coalesce($24, false), coalesce($25, false), coalesce($26, false), coalesce($27, false), $28
     ) RETURNING *`,
    [b.name, domain, b.industry || null, b.employee_count ?? null, b.ad_spend_range || null,
     b.website || null, b.phone || null, b.owner || null, b.lifecycle_stage || null,
     b.city || null, b.state || null, b.lead_status || null, b.type || null, b.postal_code || null,
     b.annual_revenue ?? null, b.timezone || null, b.description || null,
     b.target_tier || null, b.source || null, b.campaign || null, b.last_touch_channel || null,
     b.next_step || null, b.buying_committee_status || null,
     b.do_not_contact, b.replied, b.not_interested, b.bad_fit, b.suppression_reason || null]
  );
  emit('company.created', { company: rows[0] });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', h(async (req, res) => {
  validateLifecycle(req.body.lifecycle_stage);
  validateProspectingFields(req.body);
  const body = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(body, 'domain') || Object.prototype.hasOwnProperty.call(body, 'website')) {
    body.domain = normalizeDomain(body.domain || body.website);
  }
  const upd = buildUpdate('companies', req.params.id, body, COMPANY_FIELDS);
  if (!upd) throw badRequest('No updatable fields provided');
  const { rows } = await query(upd.text, upd.values);
  if (!rows[0]) throw notFound('Company not found');
  res.json(rows[0]);
}));

router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM companies WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Company not found');
  res.status(204).end();
}));

export default router;
export { touchCompany };
