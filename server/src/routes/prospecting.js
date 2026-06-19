import { Router } from 'express';
import { query } from '../db.js';
import { h, TARGET_TIERS, toInt } from '../util.js';

const router = Router();

const REQUIRED_ROLES = ['owner', 'marketing', 'ops'];
const ROLE_PRIORITY = ['owner', 'marketing', 'ops', 'gm', 'office_manager', 'dispatcher', 'other'];
const TEST_RECORD_PATTERN = /\b(qa|smoke|test|fixture)\b|import smoke|workflow smoke|runwise qa/i;

function boolParam(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function isSuppressed(company) {
  return Boolean(company.do_not_contact || company.not_interested || company.bad_fit);
}

function isTestRecord(company) {
  return [company.name, company.domain, company.source, company.campaign]
    .filter(Boolean)
    .some((value) => TEST_RECORD_PATTERN.test(String(value)));
}

function roleRank(contact) {
  const idx = ROLE_PRIORITY.indexOf(contact.contact_role);
  return idx === -1 ? ROLE_PRIORITY.length : idx;
}

function contactReachability(contact) {
  return Number(Boolean(contact.email)) + Number(Boolean(contact.phone || contact.phone_direct || contact.phone_cell));
}

function pickContacts(contacts) {
  const sorted = [...contacts].sort((a, b) => {
    const roleDelta = roleRank(a) - roleRank(b);
    if (roleDelta !== 0) return roleDelta;
    return contactReachability(b) - contactReachability(a);
  });
  return [sorted[0] || null, sorted.find((contact) => contact.id !== sorted[0]?.id) || null];
}

function tierScore(tier) {
  if (tier === 'tier_1') return 40;
  if (tier === 'tier_2') return 25;
  if (tier === 'tier_3') return 5;
  return 0;
}

function statusFor({ company, contacts, missingRoles, suppressed }) {
  if (suppressed) return 'suppressed';
  if (!contacts.length) return 'blocked_no_contacts';
  if (company.replied) return 'responded';
  if (!company.next_step) return 'needs_next_step';
  if (missingRoles.length) return 'find_roles';
  return 'ready_now';
}

function reasonFor({ company, contacts, missingRoles, status, primaryContact }) {
  if (status === 'suppressed') return company.suppression_reason || 'Suppressed from active outreach.';
  if (status === 'blocked_no_contacts') return 'No contacts are attached yet.';
  if (status === 'responded') return 'Prospect has responded; use the response before the next touch.';
  if (status === 'needs_next_step') return 'Account has no concrete next step.';
  if (status === 'find_roles') return `Missing ${missingRoles.join(', ')} coverage.`;
  if (primaryContact) return `Ready with ${primaryContact.name} as the primary contact path.`;
  if (contacts.length) return 'Ready with imported contact coverage.';
  return 'Needs a concrete next step.';
}

function sequenceAngle(company) {
  if (company.campaign) return company.campaign;
  if (company.source) return `Source: ${company.source}`;
  if (company.ad_spend_range && company.ad_spend_range !== 'unknown') return `Paid lead recovery for ${company.ad_spend_range} monthly ad spend`;
  return 'HVAC growth and paid lead recovery';
}

function dateMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function hoursBetween(start, end) {
  const startMs = dateMs(start);
  const endMs = dateMs(end);
  if (startMs === null || endMs === null) return null;
  return Math.max(0, Math.round(((endMs - startMs) / 36e5) * 10) / 10);
}

function latestActivity(activities, type) {
  return activities.find((activity) => activity.event_type === type) || null;
}

function matchingSubmissionForResponse(activities, response) {
  if (!response) return null;
  const responseAuditId = response.audit_id;
  if (responseAuditId) {
    const sameAuditSubmission = activities.find((activity) => (
      activity.event_type === 'submission' && activity.audit_id === responseAuditId
    ));
    if (sameAuditSubmission) return sameAuditSubmission;
  }
  return latestActivity(activities, 'submission');
}

function responseHoursFor(submission, response) {
  const explicit = Number(response?.response_time_hours);
  if (Number.isFinite(explicit)) return explicit;
  return hoursBetween(submission?.submitted_at || submission?.occurred_at, response?.occurred_at);
}

function normalizedStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function isVerifiedSubmission(activity) {
  return ['submitted_verified', 'assisted_submitted_verified'].includes(normalizedStatus(activity?.submission_status));
}

function isBlockedSubmission(activity) {
  const statuses = [
    activity?.submission_status,
    activity?.audit_status,
    activity?.match_status,
  ].map(normalizedStatus);
  return statuses.some((status) => status === 'blocked_captcha');
}

function deriveAuditSignal(company) {
  const activities = Array.isArray(company.audit_activities) ? company.audit_activities : [];
  if (!activities.length) return null;

  const latest = activities[0];
  const latestSubmission = latestActivity(activities, 'submission');
  const latestResponse = latestActivity(activities, 'inbound_response');

  if (latestResponse) {
    const responseSubmission = matchingSubmissionForResponse(activities, latestResponse);
    const responseHours = responseHoursFor(responseSubmission, latestResponse);
    const responseText = responseHours === null ? 'response captured' : `response in ${responseHours}h`;
    const uncertainMatch = latestResponse.match_status === 'manual_review_required';
    const matchText = uncertainMatch ? 'Human match check needed before treating this as proof.' : 'Response is linked to this audit.';

    if (responseHours !== null && responseHours < 1) {
      return {
        label: uncertainMatch ? 'Fast reply - match check' : 'Fast reply',
        severity: 'low',
        score_delta: -20,
        reason: `Fast callback (${responseText}) lowers missed-lead pain. ${matchText}`,
        next_action: uncertainMatch ? 'Confirm the match, then deprioritize unless another pain signal exists.' : 'Deprioritize unless another pain signal exists.',
        response_time_hours: responseHours,
        latest_status: latestResponse.match_status || latestResponse.response_kind || 'inbound_response',
      };
    }

    if (responseHours !== null && responseHours > 24) {
      return {
        label: uncertainMatch ? 'Slow reply - match check' : 'Slow reply',
        severity: 'high',
        score_delta: 25,
        reason: `Response took ${responseHours}h after a verified form submission. ${matchText}`,
        next_action: 'Use the transcript as context, then call if the account otherwise fits.',
        response_time_hours: responseHours,
        latest_status: latestResponse.match_status || latestResponse.response_kind || 'inbound_response',
      };
    }

    return {
      label: uncertainMatch ? 'Response match check' : 'Responded',
      severity: 'medium',
      score_delta: uncertainMatch ? 2 : 0,
      reason: `${responseText}. ${matchText}`,
      next_action: uncertainMatch ? 'Confirm whether this response belongs to the audit.' : 'Use the response as context, not automatic pain proof.',
      response_time_hours: responseHours,
      latest_status: latestResponse.match_status || latestResponse.response_kind || 'inbound_response',
    };
  }

  if (!latestSubmission) {
    return {
      label: 'Audit activity',
      severity: 'neutral',
      score_delta: 0,
      reason: `Latest audit event: ${latest.event_type}.`,
      next_action: 'Inspect audit activity before changing priority.',
      latest_status: latest.submission_status || latest.match_status || latest.event_type,
    };
  }

  if (isBlockedSubmission(latestSubmission)) {
    return {
      label: 'Blocked - CAPTCHA',
      severity: 'neutral',
      score_delta: -10,
      reason: 'CAPTCHA blocked the form attempt, so this is not valid audit evidence.',
      next_action: 'Manually submit in a normal browser or leave the account unscored for audit pain.',
      latest_status: 'Blocked - CAPTCHA',
    };
  }

  if (!isVerifiedSubmission(latestSubmission)) {
    return {
      label: 'Pending',
      severity: 'neutral',
      score_delta: -5,
      reason: `Form attempt status is ${latestSubmission.submission_status || 'unknown'}; do not treat this as outreach proof.`,
      next_action: 'Submit manually or wait for verified evidence before scoring account pain.',
      latest_status: latestSubmission.submission_status || 'submission_unverified',
    };
  }

  const ageHours = hoursBetween(latestSubmission.occurred_at, new Date());
  if (ageHours !== null && ageHours >= 48) {
    return {
      label: 'No Response 48h+',
      severity: 'high',
      score_delta: 35,
      reason: `Verified form submission has no captured response after ${Math.round(ageHours)}h.`,
      next_action: 'Prioritize follow-up; this is missed-response pain evidence.',
      latest_status: 'awaiting_response',
    };
  }

  if (ageHours !== null && ageHours >= 24) {
    return {
      label: 'No Response 24h+',
      severity: 'medium',
      score_delta: 20,
      reason: `Verified form submission has no captured response after ${Math.round(ageHours)}h.`,
      next_action: 'Queue for follow-up if account fit is otherwise strong.',
      latest_status: 'awaiting_response',
    };
  }

  return {
    label: 'Awaiting response',
    severity: 'watch',
    score_delta: 3,
    reason: 'Verified form submission is pending response.',
    next_action: 'Wait before treating this as pain evidence.',
    latest_status: 'awaiting_response',
  };
}

function scoreAccount({ company, contacts, missingRoles, status, primaryContact, auditSignal }) {
  if (status === 'suppressed') return -100;
  let score = tierScore(company.target_tier);
  if (company.replied) score += 35;
  if (company.next_step) score += 20;
  if (primaryContact) score += 15;
  score += REQUIRED_ROLES.length - missingRoles.length;
  if (company.open_task_count > 0) score += 8;
  if (Number(company.open_deal_value) > 0) score += 12;
  if (!contacts.length) score -= 35;
  if (missingRoles.length) score -= missingRoles.length * 6;
  if (auditSignal) score += auditSignal.score_delta;
  return score;
}

function toWorkbenchAccount(company) {
  const contacts = Array.isArray(company.contacts) ? company.contacts : [];
  const roles = [...new Set(contacts.map((contact) => contact.contact_role).filter(Boolean))];
  const missingRoles = REQUIRED_ROLES.filter((role) => !roles.includes(role));
  const suppressed = isSuppressed(company);
  const [primaryContact, secondaryContact] = pickContacts(contacts);
  const status = statusFor({ company, contacts, missingRoles, suppressed });
  const auditSignal = deriveAuditSignal(company);
  const score = scoreAccount({ company, contacts, missingRoles, status, primaryContact, auditSignal });

  return {
    id: company.id,
    name: company.name,
    domain: company.domain,
    website: company.website,
    owner: company.owner,
    target_tier: company.target_tier,
    source: company.source,
    campaign: company.campaign,
    industry: company.industry,
    employee_count: company.employee_count,
    ad_spend_range: company.ad_spend_range,
    buying_committee_status: company.buying_committee_status,
    next_step: company.next_step,
    replied: Boolean(company.replied),
    suppressed,
    suppression_reason: company.suppression_reason,
    contact_count: contacts.length,
    contacts,
    roles,
    missing_roles: missingRoles,
    primary_contact: primaryContact,
    secondary_contact: secondaryContact,
    open_task_count: Number(company.open_task_count || 0),
    open_deal_value: Number(company.open_deal_value || 0),
    latest_deal_stage: company.latest_deal_stage,
    last_activity_at: company.last_activity_at,
    next_task: company.next_task,
    audit_signal: auditSignal,
    audit_activities: company.audit_activities || [],
    status,
    score,
    reason: reasonFor({ company, contacts, missingRoles, status, primaryContact }),
    sequence_angle: sequenceAngle(company),
    is_test_record: isTestRecord(company),
  };
}

function matchesView(account, view) {
  if (view === 'ready') return account.status === 'ready_now';
  if (view === 'role_gaps') return !account.suppressed && account.missing_roles.length > 0;
  if (view === 'needs_next_step') return !account.suppressed && !account.next_step;
  if (view === 'replies') return !account.suppressed && account.replied;
  if (view === 'audit_signals') return !account.suppressed && Boolean(account.audit_signal);
  if (view === 'suppressed') return account.suppressed;
  return !account.suppressed;
}

// GET /api/prospecting/workbench - account-first HVAC prospecting queue.
router.get('/workbench', h(async (req, res) => {
  const view = String(req.query.view || 'work_now');
  const hideTestData = boolParam(req.query.hide_test_data, false);
  const limit = Math.min(toInt(req.query.limit) || 100, 500);
  const q = String(req.query.q || '').trim().toLowerCase();
  const targetTier = TARGET_TIERS.includes(req.query.target_tier) ? req.query.target_tier : '';

  const { rows } = await query(
    `SELECT co.*,
            (SELECT count(*) FROM tasks t WHERE t.company_id = co.id AND NOT t.completed)::int AS open_task_count,
            (SELECT coalesce(sum(d.value), 0) FROM deals d WHERE d.company_id = co.id AND d.stage NOT IN ('won','lost')) AS open_deal_value,
            (SELECT d.stage FROM deals d WHERE d.company_id = co.id ORDER BY d.updated_at DESC LIMIT 1) AS latest_deal_stage,
            (SELECT json_build_object('id', t.id, 'description', t.description, 'due_date', t.due_date, 'priority', t.priority)
               FROM tasks t
              WHERE t.company_id = co.id AND NOT t.completed
              ORDER BY t.due_date NULLS LAST, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
              LIMIT 1) AS next_task,
            (SELECT coalesce(json_agg(json_build_object(
                'id', aa.id,
                'event_key', aa.event_key,
                'event_type', aa.event_type,
                'audit_id', aa.audit_id,
                'event_id', aa.event_id,
                'company_name', aa.company_name,
                'contact_form_url', aa.contact_form_url,
                'submitted_at', aa.submitted_at,
                'occurred_at', aa.occurred_at,
                'submission_status', aa.submission_status,
                'audit_status', aa.audit_status,
                'match_status', aa.match_status,
                'response_kind', aa.response_kind,
                'response_label', aa.response_label,
                'response_time_hours', aa.response_time_hours,
                'response_bucket', aa.response_bucket,
                'match_reason', aa.match_reason,
                'match_score', aa.match_score,
                'confidence', aa.confidence,
                'ai_confidence', aa.ai_confidence,
                'final_url', aa.final_url,
                'evidence_dir', aa.evidence_dir,
                'transcript', aa.transcript,
                'recording_url', aa.recording_url,
                'caller_phone', aa.caller_phone,
                'called_number', aa.called_number
              ) ORDER BY aa.occurred_at DESC), '[]'::json)
               FROM (
                 SELECT *
                   FROM audit_activities aa
                  WHERE aa.company_id = co.id
                  ORDER BY aa.occurred_at DESC
                  LIMIT 5
               ) aa) AS audit_activities,
            coalesce(
              json_agg(
                json_build_object(
                  'id', ct.id,
                  'name', ct.name,
                  'title', ct.title,
                  'contact_role', ct.contact_role,
                  'email', ct.email,
                  'phone', ct.phone,
                  'phone_direct', ct.phone_direct,
                  'phone_cell', ct.phone_cell,
                  'owner', ct.owner,
                  'replied', ct.replied,
                  'do_not_contact', ct.do_not_contact,
                  'not_interested', ct.not_interested,
                  'bad_fit', ct.bad_fit
                )
                ORDER BY ct.name
              ) FILTER (WHERE ct.id IS NOT NULL),
              '[]'::json
            ) AS contacts
      FROM companies co
       LEFT JOIN contacts ct ON ct.company_id = co.id
      WHERE co.archived_at IS NULL
        AND (co.lifecycle_stage IS NULL OR co.lifecycle_stage NOT IN ('customer', 'evangelist'))
      GROUP BY co.id
      ORDER BY co.created_at DESC
      LIMIT 1000`,
  );

  const allAccounts = rows.map(toWorkbenchAccount);
  const visibleAccounts = allAccounts.filter((account) => {
    if (hideTestData && account.is_test_record) return false;
    if (targetTier && account.target_tier !== targetTier) return false;
    if (q) {
      const haystack = [
        account.name,
        account.domain,
        account.source,
        account.campaign,
        account.next_step,
        account.primary_contact?.name,
        account.secondary_contact?.name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  const accounts = visibleAccounts
    .filter((account) => matchesView(account, view))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);

  res.json({
    view,
    hide_test_data: hideTestData,
    hidden_test_records: hideTestData ? allAccounts.filter((account) => account.is_test_record).length : 0,
    summary: {
      total: visibleAccounts.length,
      work_now: visibleAccounts.filter((account) => !account.suppressed).length,
      ready: visibleAccounts.filter((account) => account.status === 'ready_now').length,
      role_gaps: visibleAccounts.filter((account) => !account.suppressed && account.missing_roles.length > 0).length,
      needs_next_step: visibleAccounts.filter((account) => !account.suppressed && !account.next_step).length,
      replies: visibleAccounts.filter((account) => !account.suppressed && account.replied).length,
      audit_signals: visibleAccounts.filter((account) => !account.suppressed && account.audit_signal).length,
      audit_high_pain: visibleAccounts.filter((account) => !account.suppressed && account.audit_signal?.severity === 'high').length,
      audit_low_pain: visibleAccounts.filter((account) => !account.suppressed && account.audit_signal?.severity === 'low').length,
      suppressed: visibleAccounts.filter((account) => account.suppressed).length,
      no_contacts: visibleAccounts.filter((account) => !account.suppressed && account.contact_count === 0).length,
    },
    accounts,
  });
}));

export default router;
