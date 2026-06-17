import { Router } from 'express';
import { pool } from '../db.js';
import { auditChange, createAuditBatch } from '../audit.js';
import {
  h,
  badRequest,
  normalizeDomain,
  LIFECYCLE_STAGES,
  TARGET_TIERS,
  BUYING_COMMITTEE_STATUSES,
  CONTACT_ROLES,
} from '../util.js';

const router = Router();

function cleanString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanEmail(value) {
  return cleanString(value)?.toLowerCase() || null;
}

function cleanInteger(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanEnum(value, allowed) {
  const text = cleanString(value);
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return allowed.find((item) => item === normalized) || null;
}

function cleanLifecycle(value) {
  return cleanEnum(value, LIFECYCLE_STAGES);
}

// POST /api/import — bulk seed prospect lists.
router.post('/', h(async (req, res) => {
  const companies = req.body.companies;
  if (!Array.isArray(companies) || companies.length === 0) {
    throw badRequest('Body must be { companies: [...] } with at least one company');
  }
  if (companies.length > 2000) throw badRequest('Max 2000 companies per import');

  const summary = { companies_created: 0, companies_updated: 0, contacts_created: 0, contacts_updated: 0, skipped: [] };
  const client = await pool.connect();
  let auditBatchId = null;
  try {
    await client.query('BEGIN');
    auditBatchId = await createAuditBatch(client, {
      action: 'import',
      summary: `Import ${companies.length} submitted companies`,
      req,
      metadata: { submitted_companies: companies.length },
    });
    for (const [i, c] of companies.entries()) {
      const name = cleanString(c?.name);
      if (!c || !name) {
        summary.skipped.push({ index: i, reason: 'missing company name' });
        continue;
      }
      const domain = normalizeDomain(cleanString(c.domain) || cleanString(c.website));
      const employeeCount = cleanInteger(c.employee_count);
      const companyFields = {
        name,
        industry: cleanString(c.industry),
        ad_spend_range: cleanString(c.ad_spend_range),
        website: cleanString(c.website),
        lifecycle_stage: cleanLifecycle(c.lifecycle_stage),
        phone: cleanString(c.phone),
        target_tier: cleanEnum(c.target_tier, TARGET_TIERS),
        source: cleanString(c.source),
        campaign: cleanString(c.campaign),
        buying_committee_status: cleanEnum(c.buying_committee_status, BUYING_COMMITTEE_STATUSES),
        next_step: cleanString(c.next_step),
      };
      let company;
      if (domain) {
        ({ rows: [company] } = await client.query(
          'SELECT * FROM companies WHERE lower(domain) = lower($1)', [domain]));
      }
      if (!company) {
        ({ rows: [company] } = await client.query(
          'SELECT * FROM companies WHERE lower(name) = lower($1)', [name]));
      }
      if (company?.archived_at) {
        summary.skipped.push({
          index: i,
          name,
          reason: 'archived company exists; restore it before importing updates',
        });
        continue;
      }
      if (company) {
        const before = company;
        ({ rows: [company] } = await client.query(
          `UPDATE companies SET
             name = coalesce($2, name), domain = coalesce($3, domain),
             industry = coalesce($4, industry), employee_count = coalesce($5, employee_count),
             ad_spend_range = coalesce($6, ad_spend_range), website = coalesce($7, website),
             lifecycle_stage = coalesce($8, lifecycle_stage),
             phone = coalesce($9, phone),
             target_tier = coalesce($10, target_tier),
             source = coalesce($11, source),
             campaign = coalesce($12, campaign),
             buying_committee_status = coalesce($13, buying_committee_status),
             next_step = coalesce($14, next_step)
           WHERE id = $1 RETURNING *`,
          [company.id, companyFields.name, domain,
           companyFields.industry,
           employeeCount, companyFields.ad_spend_range, companyFields.website,
           companyFields.lifecycle_stage, companyFields.phone, companyFields.target_tier,
           companyFields.source, companyFields.campaign, companyFields.buying_committee_status,
           companyFields.next_step]));
        await auditChange(client, auditBatchId, {
          table: 'companies',
          operation: 'update',
          before,
          after: company,
          metadata: { import_index: i },
        });
        summary.companies_updated++;
      } else {
        ({ rows: [company] } = await client.query(
          `INSERT INTO companies (
             name, domain, industry, employee_count, ad_spend_range, website, lifecycle_stage, phone,
             target_tier, source, campaign, buying_committee_status, next_step
           )
          VALUES ($1, $2, coalesce($3, 'HVAC'), $4, $5, $6, coalesce($7, 'lead'), $8,
                   $9, $10, $11, coalesce($12, 'unknown'), $13) RETURNING *`,
          [companyFields.name, domain, companyFields.industry,
           employeeCount, companyFields.ad_spend_range, companyFields.website,
           companyFields.lifecycle_stage, companyFields.phone, companyFields.target_tier,
           companyFields.source, companyFields.campaign, companyFields.buying_committee_status,
           companyFields.next_step]));
        await auditChange(client, auditBatchId, {
          table: 'companies',
          operation: 'insert',
          before: null,
          after: company,
          metadata: { import_index: i },
        });
        summary.companies_created++;
      }

      for (const ct of Array.isArray(c.contacts) ? c.contacts : []) {
        const contactName = cleanString(ct?.name) || [cleanString(ct?.first_name), cleanString(ct?.last_name)].filter(Boolean).join(' ') || null;
        if (!ct || !contactName) continue;
        const contactFields = {
          name: contactName,
          first_name: cleanString(ct.first_name),
          last_name: cleanString(ct.last_name),
          title: cleanString(ct.title),
          contact_role: cleanEnum(ct.contact_role, CONTACT_ROLES),
          email: cleanEmail(ct.email),
          email_2: cleanEmail(ct.email_2),
          phone_direct: cleanString(ct.phone_direct),
          phone_cell: cleanString(ct.phone_cell),
          phone_other: cleanString(ct.phone_other),
          source: cleanString(ct.source),
        };
        let existing;
        if (contactFields.email) {
          ({ rows: [existing] } = await client.query(
            'SELECT id FROM contacts WHERE company_id = $1 AND lower(email) = lower($2)',
            [company.id, contactFields.email]));
        }
        if (!existing) {
          ({ rows: [existing] } = await client.query(
            'SELECT id FROM contacts WHERE company_id = $1 AND lower(name) = lower($2)',
            [company.id, contactFields.name]));
        }
        if (existing) {
          const { rows: [before] } = await client.query('SELECT * FROM contacts WHERE id = $1', [existing.id]);
          const { rows: [contact] } = await client.query(
            `UPDATE contacts SET
               first_name = coalesce($2, first_name), last_name = coalesce($3, last_name),
               title = coalesce($4, title),
               contact_role = coalesce($5, contact_role),
               email = coalesce($6, email), email_2 = coalesce($7, email_2),
               phone_direct = coalesce($8, phone_direct), phone_cell = coalesce($9, phone_cell),
               phone_other = coalesce($10, phone_other),
               source = coalesce($11, source)
             WHERE id = $1 RETURNING *`,
            [existing.id,
             contactFields.first_name, contactFields.last_name,
             contactFields.title,
             contactFields.contact_role,
             contactFields.email, contactFields.email_2,
             contactFields.phone_direct, contactFields.phone_cell, contactFields.phone_other,
             contactFields.source]);
          await auditChange(client, auditBatchId, {
            table: 'contacts',
            operation: 'update',
            before,
            after: contact,
            metadata: { import_index: i, company_id: company.id },
          });
          summary.contacts_updated++;
        } else {
          const { rows: [contact] } = await client.query(
            `INSERT INTO contacts
               (company_id, name, first_name, last_name, title, contact_role, email, email_2,
                phone_direct, phone_cell, phone_other, source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [company.id, contactFields.name,
             contactFields.first_name, contactFields.last_name,
             contactFields.title,
             contactFields.contact_role,
             contactFields.email, contactFields.email_2,
             contactFields.phone_direct, contactFields.phone_cell, contactFields.phone_other,
             contactFields.source]);
          await auditChange(client, auditBatchId, {
            table: 'contacts',
            operation: 'insert',
            before: null,
            after: contact,
            metadata: { import_index: i, company_id: company.id },
          });
          summary.contacts_created++;
        }
      }
    }
    await client.query(
      `UPDATE data_audit_batches
          SET summary = $2,
              metadata = metadata || $3::jsonb
        WHERE id = $1`,
      [
        auditBatchId,
        `Import: ${summary.companies_created} companies created, ${summary.companies_updated} updated, ${summary.contacts_created} contacts created, ${summary.contacts_updated} updated`,
        JSON.stringify({ summary }),
      ],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ ...summary, audit_batch_id: auditBatchId });
}));

export default router;
