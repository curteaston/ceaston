import { Router } from 'express';
import { pool, query } from '../db.js';
import { badRequest, h, normalizeDomain, requireNonBlank } from '../util.js';

const router = Router();

const EVENT_TYPES = ['submission', 'inbound_response', 'no_response'];
const NO_RESPONSE_TASK_PREFIX = 'RunWise audit no response';
const MANUAL_REVIEW_TASK_PREFIX = 'RunWise audit manual review';
const MANUAL_REVIEW_STATUSES = new Set(['manual_review_required', 'needs_ai_review']);

function text(value) {
  return String(value ?? '').trim();
}

function nullableText(value) {
  const cleaned = text(value);
  return cleaned || null;
}

function normalizedStatus(value) {
  return text(value).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseEmbeddedData(body) {
  const rawPayload = body.raw_payload;
  const embedded = rawPayload && typeof rawPayload === 'object' ? rawPayload.data : null;
  if (!embedded) return {};
  if (typeof embedded === 'object') return embedded;
  if (typeof embedded !== 'string') return {};
  try {
    const parsed = JSON.parse(embedded);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function responseBucketFor(matchStatus, body, embedded) {
  const normalized = normalizedStatus(matchStatus);
  if (MANUAL_REVIEW_STATUSES.has(normalized)) return 'Review';
  if (normalized === 'response_received_unmatched') return 'Unmatched';
  return nullableText(firstValue(body.response_bucket, embedded.response_bucket));
}

function eventType(value) {
  const cleaned = text(value);
  if (!EVENT_TYPES.includes(cleaned)) throw badRequest(`event_type must be one of: ${EVENT_TYPES.join(', ')}`);
  return cleaned;
}

function eventKey(body, type) {
  const explicit = nullableText(body.event_key);
  if (explicit) return explicit;
  const auditId = nullableText(body.audit_id);
  const eventId = nullableText(body.event_id || body.call_id || body.conversation_id);
  if (auditId && eventId) return `${type}:${auditId}:${eventId}`;
  if (auditId) return `${type}:${auditId}`;
  if (eventId) return `${type}:${eventId}`;
  throw badRequest('event_key or audit_id is required');
}

function compactCompanyName(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function companyIdFromPriorAuditActivity(body) {
  const auditId = nullableText(firstValue(body.audit_id, body.matched_audit_id));
  if (auditId) {
    const { rows } = await query(
      `SELECT company_id
         FROM audit_activities
        WHERE audit_id = $1
          AND company_id IS NOT NULL
        ORDER BY CASE WHEN event_type = 'submission' THEN 0 ELSE 1 END,
                 occurred_at DESC,
                 id DESC
        LIMIT 1`,
      [auditId],
    );
    if (rows[0]?.company_id) return rows[0].company_id;
  }

  const externalCompanyId = nullableText(body.external_company_id || body.company_external_id || body.company_id);
  if (!externalCompanyId) return null;

  const { rows } = await query(
    `SELECT company_id
       FROM audit_activities
      WHERE external_company_id = $1
        AND company_id IS NOT NULL
      ORDER BY CASE WHEN event_type = 'submission' THEN 0 ELSE 1 END,
               occurred_at DESC,
               id DESC
      LIMIT 1`,
    [externalCompanyId],
  );
  return rows[0]?.company_id || null;
}

async function companyIdFromDomain(body) {
  const domain = normalizeDomain(firstValue(
    body.company_domain,
    body.domain,
    body.website,
    body.contact_form_url,
    body.final_url,
  ));
  if (!domain) return null;

  const { rows } = await query(
    'SELECT id FROM companies WHERE lower(domain) = lower($1) AND archived_at IS NULL ORDER BY id LIMIT 1',
    [domain],
  );
  return rows[0]?.id || null;
}

async function companyIdFromName(companyName) {
  const exact = await query(
    'SELECT id FROM companies WHERE lower(name) = lower($1) AND archived_at IS NULL ORDER BY id LIMIT 1',
    [companyName],
  );
  if (exact.rows[0]?.id) return exact.rows[0].id;

  const compactName = compactCompanyName(companyName);
  if (compactName.length < 10) return null;

  const normalized = await query(
    `WITH candidates AS (
       SELECT id,
              regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') AS compact_name
         FROM companies
        WHERE archived_at IS NULL
     )
     SELECT id
       FROM candidates
      WHERE length(compact_name) >= 10
        AND (
          compact_name = $1
          OR compact_name LIKE '%' || $1 || '%'
          OR $1 LIKE '%' || compact_name || '%'
        )
      ORDER BY CASE WHEN compact_name = $1 THEN 0 ELSE 1 END,
               length(compact_name) DESC,
               id
      LIMIT 1`,
    [compactName],
  );
  return normalized.rows[0]?.id || null;
}

async function resolveCompanyId(body) {
  const explicit = nullableNumber(body.crm_company_id || body.company_record_id);
  if (explicit) return explicit;

  const priorAuditCompanyId = await companyIdFromPriorAuditActivity(body);
  if (priorAuditCompanyId) return priorAuditCompanyId;

  const domainCompanyId = await companyIdFromDomain(body);
  if (domainCompanyId) return domainCompanyId;

  const companyName = nullableText(body.company_name);
  if (!companyName) return null;

  const namedCompanyId = await companyIdFromName(companyName);
  if (namedCompanyId) return namedCompanyId;

  if (body.create_company_if_missing !== true) return null;

  const created = await query(
    `INSERT INTO companies (name, industry, source, campaign, lifecycle_stage, next_step)
     VALUES ($1, 'HVAC', 'RunWise audit activity', 'Form audit', 'lead', 'Inspect audit activity and decide whether this account shows real missed-lead pain.')
     RETURNING id`,
    [companyName],
  );
  return created.rows[0].id;
}

function rowFromBody(body, type, key, companyId) {
  const embedded = parseEmbeddedData(body);
  const matchStatus = nullableText(firstValue(body.match_status, embedded.match_status));

  return {
    event_key: key,
    event_type: type,
    audit_id: nullableText(firstValue(body.audit_id, embedded.matched_audit_id)),
    event_id: nullableText(firstValue(body.event_id, body.call_id, body.conversation_id, embedded.event_id, embedded.call_id, embedded.conversation_id)),
    company_id: companyId,
    external_company_id: nullableText(body.external_company_id || body.company_external_id || body.company_id),
    company_name: requireNonBlank('company_name', body.company_name),
    contact_form_url: nullableText(body.contact_form_url),
    submitted_at: nullableDate(body.submitted_at || body.started_at),
    occurred_at: nullableDate(firstValue(body.occurred_at, body.responded_at, body.finished_at, body.received_at, embedded.received_at, body.submitted_at, body.started_at)) || new Date().toISOString(),
    submission_status: nullableText(body.submission_status),
    audit_status: nullableText(body.audit_status),
    match_status: matchStatus,
    response_kind: nullableText(firstValue(body.response_kind, embedded.response_kind)),
    response_label: nullableText(firstValue(body.response_label, embedded.response_label)),
    response_time_hours: nullableNumber(body.response_time_hours),
    response_bucket: responseBucketFor(matchStatus, body, embedded),
    match_reason: nullableText(firstValue(body.match_reason, embedded.match_reason)),
    match_score: nullableNumber(firstValue(body.match_score, embedded.match_score)),
    confidence: nullableText(body.confidence),
    ai_confidence: nullableNumber(body.ai_confidence),
    final_url: nullableText(body.final_url),
    evidence_dir: nullableText(body.evidence_dir),
    result_json: body.result_json || body.result || null,
    transcript: nullableText(firstValue(body.transcript, body.message_body, embedded.transcript, embedded.message_body)),
    recording_url: nullableText(firstValue(body.recording_url, embedded.recording_url)),
    caller_phone: nullableText(firstValue(body.caller_phone, body.caller_number, embedded.caller_phone)),
    called_number: nullableText(firstValue(body.called_number, embedded.called_number)),
    raw_payload: body.raw_payload || body,
  };
}

function noResponseTaskDescription(row) {
  const auditRef = row.audit_id ? ` (${row.audit_id})` : '';
  return `${NO_RESPONSE_TASK_PREFIX}: follow up with ${row.company_name}${auditRef}`;
}

function manualReviewTaskDescription(row) {
  const ref = row.audit_id || row.event_id || row.event_key;
  const refText = ref ? ` (${ref})` : '';
  const label = row.response_label ? ` ${row.response_label.toLowerCase()}` : '';
  return `${MANUAL_REVIEW_TASK_PREFIX}: review inbound${label} match for ${row.company_name}${refText}`;
}

function requestedTaskOwner(body) {
  return nullableText(body.task_owner || body.owner) || 'me';
}

async function ensureNoResponseTask(client, row, body) {
  if (row.event_type !== 'no_response' || !row.company_id) return null;

  const description = noResponseTaskDescription(row);
  const auditId = nullableText(row.audit_id);
  const owner = requestedTaskOwner(body);
  const { rows } = await client.query(
    `WITH existing AS (
       SELECT t.*, false AS created_for_audit
         FROM tasks t
        WHERE t.company_id = $1
          AND NOT t.completed
          AND (
            t.description = $2
            OR ($3::text IS NOT NULL AND t.description ILIKE '%' || $3::text || '%')
          )
        ORDER BY t.id
        LIMIT 1
     ), inserted AS (
       INSERT INTO tasks (company_id, description, due_date, priority, owner)
       SELECT $1, $2, CURRENT_DATE + 1, 'high', $4
        WHERE NOT EXISTS (SELECT 1 FROM existing)
       RETURNING *, true AS created_for_audit
     )
     SELECT * FROM existing
     UNION ALL
     SELECT * FROM inserted
     LIMIT 1`,
    [row.company_id, description, auditId, owner],
  );
  return rows[0] || null;
}

async function ensureManualReviewTask(client, row, body) {
  if (row.event_type !== 'inbound_response' || !row.company_id) return null;
  if (!MANUAL_REVIEW_STATUSES.has(normalizedStatus(row.match_status))) return null;

  const description = manualReviewTaskDescription(row);
  const ref = nullableText(row.audit_id || row.event_id);
  const owner = requestedTaskOwner(body);
  const { rows } = await client.query(
    `WITH existing AS (
       SELECT t.*, false AS created_for_audit
         FROM tasks t
        WHERE t.company_id = $1
          AND NOT t.completed
          AND (
            t.description = $2
            OR (
              $3::text IS NOT NULL
              AND t.description ILIKE $4
              AND t.description ILIKE '%' || $3::text || '%'
            )
          )
        ORDER BY t.id
        LIMIT 1
     ), inserted AS (
       INSERT INTO tasks (company_id, description, due_date, priority, owner)
       SELECT $1, $2, CURRENT_DATE, 'high', $5
        WHERE NOT EXISTS (SELECT 1 FROM existing)
       RETURNING *, true AS created_for_audit
     )
     SELECT * FROM existing
     UNION ALL
     SELECT * FROM inserted
     LIMIT 1`,
    [row.company_id, description, ref, `${MANUAL_REVIEW_TASK_PREFIX}%`, owner],
  );
  return rows[0] || null;
}

router.post('/upsert', h(async (req, res) => {
  const body = req.body || {};
  const type = eventType(body.event_type);
  const key = eventKey(body, type);
  const companyId = await resolveCompanyId(body);
  const row = rowFromBody(body, type, key, companyId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO audit_activities (
         event_key, event_type, audit_id, event_id, company_id, external_company_id, company_name,
         contact_form_url, submitted_at, occurred_at, submission_status, audit_status, match_status,
         response_kind, response_label, response_time_hours, response_bucket, match_reason, match_score,
         confidence, ai_confidence, final_url, evidence_dir, result_json, transcript, recording_url,
         caller_phone, called_number, raw_payload, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23, $24, $25, $26,
         $27, $28, $29, now()
       )
       ON CONFLICT (event_key) DO UPDATE SET
         event_type = EXCLUDED.event_type,
         audit_id = EXCLUDED.audit_id,
         event_id = EXCLUDED.event_id,
         company_id = coalesce(EXCLUDED.company_id, audit_activities.company_id),
         external_company_id = EXCLUDED.external_company_id,
         company_name = EXCLUDED.company_name,
         contact_form_url = EXCLUDED.contact_form_url,
         submitted_at = EXCLUDED.submitted_at,
         occurred_at = EXCLUDED.occurred_at,
         submission_status = EXCLUDED.submission_status,
         audit_status = EXCLUDED.audit_status,
         match_status = EXCLUDED.match_status,
         response_kind = EXCLUDED.response_kind,
         response_label = EXCLUDED.response_label,
         response_time_hours = EXCLUDED.response_time_hours,
         response_bucket = EXCLUDED.response_bucket,
         match_reason = EXCLUDED.match_reason,
         match_score = EXCLUDED.match_score,
         confidence = EXCLUDED.confidence,
         ai_confidence = EXCLUDED.ai_confidence,
         final_url = EXCLUDED.final_url,
         evidence_dir = EXCLUDED.evidence_dir,
         result_json = EXCLUDED.result_json,
         transcript = EXCLUDED.transcript,
         recording_url = EXCLUDED.recording_url,
         caller_phone = EXCLUDED.caller_phone,
         called_number = EXCLUDED.called_number,
         raw_payload = EXCLUDED.raw_payload,
         updated_at = now()
       RETURNING *`,
      [
        row.event_key,
        row.event_type,
        row.audit_id,
        row.event_id,
        row.company_id,
        row.external_company_id,
        row.company_name,
        row.contact_form_url,
        row.submitted_at,
        row.occurred_at,
        row.submission_status,
        row.audit_status,
        row.match_status,
        row.response_kind,
        row.response_label,
        row.response_time_hours,
        row.response_bucket,
        row.match_reason,
        row.match_score,
        row.confidence,
        row.ai_confidence,
        row.final_url,
        row.evidence_dir,
        row.result_json,
        row.transcript,
        row.recording_url,
        row.caller_phone,
        row.called_number,
        row.raw_payload,
      ],
    );

    let crmTask = null;
    if (companyId) {
      await client.query(
        `UPDATE companies
            SET last_activity_at = GREATEST(coalesce(last_activity_at, 'epoch'), $2::timestamptz)
          WHERE id = $1`,
        [companyId, row.occurred_at],
      );
      crmTask = await ensureNoResponseTask(client, row, body);
      if (!crmTask) crmTask = await ensureManualReviewTask(client, row, body);
    }
    await client.query('COMMIT');

    res.status(201).json({
      audit_activity: rows[0],
      matched_company: Boolean(companyId),
      crm_task: crmTask,
      crm_task_created: Boolean(crmTask?.created_for_audit),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.get('/', h(async (req, res) => {
  const companyId = nullableNumber(req.query.company_id);
  const auditId = nullableText(req.query.audit_id);
  const values = [];
  const where = [];

  if (companyId) {
    values.push(companyId);
    where.push(`company_id = $${values.length}`);
  }
  if (auditId) {
    values.push(auditId);
    where.push(`audit_id = $${values.length}`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM audit_activities ${clause} ORDER BY occurred_at DESC LIMIT 100`,
    values,
  );
  res.json({ audit_activities: rows });
}));

export default router;
