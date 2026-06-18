import { Router } from 'express';
import { query } from '../db.js';
import { badRequest, h, requireNonBlank } from '../util.js';

const router = Router();

const EVENT_TYPES = ['submission', 'inbound_response'];

function text(value) {
  return String(value ?? '').trim();
}

function nullableText(value) {
  const cleaned = text(value);
  return cleaned || null;
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

async function resolveCompanyId(body) {
  const explicit = nullableNumber(body.crm_company_id || body.company_record_id);
  if (explicit) return explicit;

  const companyName = nullableText(body.company_name);
  if (!companyName) return null;

  const exact = await query(
    'SELECT id FROM companies WHERE lower(name) = lower($1) AND archived_at IS NULL ORDER BY id LIMIT 1',
    [companyName],
  );
  if (exact.rows[0]?.id) return exact.rows[0].id;

  if (body.create_company_if_missing !== true) return null;

  const created = await query(
    `INSERT INTO companies (name, industry, source, campaign, lifecycle_stage, next_step)
     VALUES ($1, 'HVAC', 'RunWise audit activity', 'Form audit', 'lead', 'Review audit activity and decide whether this account shows real missed-lead pain.')
     RETURNING id`,
    [companyName],
  );
  return created.rows[0].id;
}

function rowFromBody(body, type, key, companyId) {
  const embedded = parseEmbeddedData(body);

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
    match_status: nullableText(firstValue(body.match_status, embedded.match_status)),
    response_kind: nullableText(firstValue(body.response_kind, embedded.response_kind)),
    response_label: nullableText(firstValue(body.response_label, embedded.response_label)),
    response_time_hours: nullableNumber(body.response_time_hours),
    response_bucket: nullableText(firstValue(body.response_bucket, embedded.response_bucket)),
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

router.post('/upsert', h(async (req, res) => {
  const body = req.body || {};
  const type = eventType(body.event_type);
  const key = eventKey(body, type);
  const companyId = await resolveCompanyId(body);
  const row = rowFromBody(body, type, key, companyId);

  const { rows } = await query(
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

  if (companyId) {
    await query(
      `UPDATE companies
          SET last_activity_at = GREATEST(coalesce(last_activity_at, 'epoch'), $2::timestamptz)
        WHERE id = $1`,
      [companyId, row.occurred_at],
    );
  }

  res.status(201).json({ audit_activity: rows[0], matched_company: Boolean(companyId) });
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
