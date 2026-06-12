import { Router } from 'express';
import { pool } from '../db.js';
import { h, badRequest } from '../util.js';

const router = Router();

// POST /api/import — bulk seed prospect lists.
// Body: { companies: [{ name, domain, industry, employee_count, ad_spend_range, website,
//                       contacts: [{ name, title, email, phone, source }] }] }
// Companies are upserted by domain (fallback: exact name match); contacts by email
// (fallback: name within the company). Runs in a single transaction.
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
      let company;
      if (c.domain) {
        ({ rows: [company] } = await client.query(
          'SELECT * FROM companies WHERE lower(domain) = lower($1)', [c.domain]));
      }
      if (!company) {
        ({ rows: [company] } = await client.query(
          'SELECT * FROM companies WHERE lower(name) = lower($1)', [c.name]));
      }
      if (company) {
        ({ rows: [company] } = await client.query(
          `UPDATE companies SET
             name = coalesce($2, name), domain = coalesce($3, domain),
             industry = coalesce($4, industry), employee_count = coalesce($5, employee_count),
             ad_spend_range = coalesce($6, ad_spend_range), website = coalesce($7, website)
           WHERE id = $1 RETURNING *`,
          [company.id, c.name, c.domain || null, c.industry || null,
           c.employee_count ?? null, c.ad_spend_range || null, c.website || null]));
        summary.companies_updated++;
      } else {
        ({ rows: [company] } = await client.query(
          `INSERT INTO companies (name, domain, industry, employee_count, ad_spend_range, website)
           VALUES ($1, $2, coalesce($3, 'HVAC'), $4, $5, $6) RETURNING *`,
          [c.name, c.domain || null, c.industry || null,
           c.employee_count ?? null, c.ad_spend_range || null, c.website || null]));
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
            `UPDATE contacts SET title = coalesce($2, title), email = coalesce($3, email),
               phone = coalesce($4, phone), source = coalesce($5, source)
             WHERE id = $1`,
            [existing.id, ct.title || null, ct.email || null, ct.phone || null, ct.source || null]);
          summary.contacts_updated++;
        } else {
          await client.query(
            `INSERT INTO contacts (company_id, name, title, email, phone, source)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [company.id, ct.name, ct.title || null, ct.email || null, ct.phone || null, ct.source || null]);
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
