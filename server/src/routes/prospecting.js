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
  if (company.replied) return 'reply_review';
  if (!company.next_step) return 'needs_next_step';
  if (missingRoles.length) return 'find_roles';
  return 'ready_now';
}

function reasonFor({ company, contacts, missingRoles, status, primaryContact }) {
  if (status === 'suppressed') return company.suppression_reason || 'Suppressed from active outreach.';
  if (status === 'blocked_no_contacts') return 'No contacts are attached yet.';
  if (status === 'reply_review') return 'Prospect has replied; review before the next touch.';
  if (status === 'needs_next_step') return 'Account has no concrete next step.';
  if (status === 'find_roles') return `Missing ${missingRoles.join(', ')} coverage.`;
  if (primaryContact) return `Ready with ${primaryContact.name} as the primary contact path.`;
  if (contacts.length) return 'Ready with imported contact coverage.';
  return 'Needs review.';
}

function sequenceAngle(company) {
  if (company.campaign) return company.campaign;
  if (company.source) return `Source: ${company.source}`;
  if (company.ad_spend_range && company.ad_spend_range !== 'unknown') return `Paid lead recovery for ${company.ad_spend_range} monthly ad spend`;
  return 'HVAC growth and paid lead recovery';
}

function scoreAccount({ company, contacts, missingRoles, status, primaryContact }) {
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
  return score;
}

function toWorkbenchAccount(company) {
  const contacts = Array.isArray(company.contacts) ? company.contacts : [];
  const roles = [...new Set(contacts.map((contact) => contact.contact_role).filter(Boolean))];
  const missingRoles = REQUIRED_ROLES.filter((role) => !roles.includes(role));
  const suppressed = isSuppressed(company);
  const [primaryContact, secondaryContact] = pickContacts(contacts);
  const status = statusFor({ company, contacts, missingRoles, suppressed });
  const score = scoreAccount({ company, contacts, missingRoles, status, primaryContact });

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
    roles,
    missing_roles: missingRoles,
    primary_contact: primaryContact,
    secondary_contact: secondaryContact,
    open_task_count: Number(company.open_task_count || 0),
    open_deal_value: Number(company.open_deal_value || 0),
    latest_deal_stage: company.latest_deal_stage,
    last_activity_at: company.last_activity_at,
    next_task: company.next_task,
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
      suppressed: visibleAccounts.filter((account) => account.suppressed).length,
      no_contacts: visibleAccounts.filter((account) => !account.suppressed && account.contact_count === 0).length,
    },
    accounts,
  });
}));

export default router;
