import { Router } from 'express';
import { pool } from '../db.js';
import { h, badRequest, normalizeDomain } from '../util.js';

const router = Router();

// POST /api/import — bulk seed prospect lists.
router.post('/', h(async (req, res) => {
  const companies = req.body.companies;
  if (!Array.isArray(companies) || companies.length === 0) {
    throw badRequest('Body must be { companies: [...] } with at least one company');
  }
  if (companies.length > 2000) throw badRequest('Max 2000 companies per import');

  const summary = { companies_created: 0, companies_updated: 0, contacts_created: 0, contacts_updated: 0, skipped: [] };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, c] of companies.entries()) {
      if (!c || !c.name) {
        summary.skipped.push({ index: i, reason: 'missing company name' });
        continue;
      }
      const domain = normalizeDomain(c.domain || c.website);
      let company;
      if (domain) {
        ({ rows: [company] } = await client.query(
          'SELECT * FROM companies WHERE lower(domain) = lower($1)', [domain]));
      }
      if (!company) {
        ({ rows: [company] } = await client.query(
          'SELECT * FROM companies WHERE lower(name) = lower($1)', [c.name]));
      }
      if (company?.archived_at) {
        summary.skipped.push({
          index: i,
          name: c.name,
          reason: 'archived company exists; restore it before importing updates',
        });
        continue;
      }
      if (company) {
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
          [company.id, c.name, domain,
           c.industry || null,
           c.employee_count ?? null, c.ad_spend_range || null, c.website || null,
           c.lifecycle_stage || null, c.phone || null, c.target_tier || null,
           c.source || null, c.campaign || null, c.buying_committee_status || null,
           c.next_step || null]));
        summary.companies_updated++;
      } else {
        ({ rows: [company] } = await client.query(
          `INSERT INTO companies (
             name, domain, industry, employee_count, ad_spend_range, website, lifecycle_stage, phone,
             target_tier, source, campaign, buying_committee_status, next_step
           )
          VALUES ($1, $2, coalesce($3, 'HVAC'), $4, $5, $6, coalesce($7, 'lead'), $8,
                   $9, $10, $11, coalesce($12, 'unknown'), $13) RETURNING *`,
          [c.name, domain, c.industry || null,
           c.employee_count ?? null, c.ad_spend_range || null, c.website || null,
           c.lifecycle_stage || null, c.phone || null, c.target_tier || null,
           c.source || null, c.campaign || null, c.buying_committee_status || null,
           c.next_step || null]));
        summary.companies_created++;
      }

      for (const ct of c.contacts || []) {
        if (!ct || !ct.name) continue;
        let existing;
        if (ct.email) {
          ({ rows: [existing] } = await client.query(
            'SELECT id FROM contacts WHERE company_id = $1 AND lower(email) = lower($2)',
            [company.id, ct.email]));
        }
        if (!existing) {
          ({ rows: [existing] } = await client.query(
            'SELECT id FROM contacts WHERE company_id = $1 AND lower(name) = lower($2)',
            [company.id, ct.name]));
        }
        if (existing) {
          await client.query(
            `UPDATE contacts SET
               first_name = coalesce($2, first_name), last_name = coalesce($3, last_name),
               title = coalesce($4, title),
               contact_role = coalesce($5, contact_role),
               email = coalesce($6, email), email_2 = coalesce($7, email_2),
               phone_direct = coalesce($8, phone_direct), phone_cell = coalesce($9, phone_cell),
               phone_other = coalesce($10, phone_other),
               source = coalesce($11, source)
             WHERE id = $1`,
            [existing.id,
             ct.first_name || null, ct.last_name || null,
             ct.title || null,
             ct.contact_role || null,
             ct.email || null, ct.email_2 || null,
             ct.phone_direct || null, ct.phone_cell || null, ct.phone_other || null,
             ct.source || null]);
          summary.contacts_updated++;
        } else {
          await client.query(
            `INSERT INTO contacts
               (company_id, name, first_name, last_name, title, contact_role, email, email_2,
                phone_direct, phone_cell, phone_other, source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [company.id, ct.name,
             ct.first_name || null, ct.last_name || null,
             ct.title || null,
             ct.contact_role || null,
             ct.email || null, ct.email_2 || null,
             ct.phone_direct || null, ct.phone_cell || null, ct.phone_other || null,
             ct.source || null]);
          summary.contacts_created++;
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json(summary);
}));

export default router;
