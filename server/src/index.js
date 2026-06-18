import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb, query } from './db.js';
import {
  h, STAGES, AD_SPEND_RANGES, LEAD_STATUSES, LIFECYCLE_STAGES,
  TARGET_TIERS, BUYING_COMMITTEE_STATUSES, CONTACT_ROLES, SCHEMA_VERSION,
} from './util.js';
import companies from './routes/companies.js';
import contacts from './routes/contacts.js';
import deals from './routes/deals.js';
import tasks from './routes/tasks.js';
import notes from './routes/notes.js';
import activities from './routes/activities.js';
import dashboard from './routes/dashboard.js';
import importer from './routes/importer.js';
import home from './routes/home.js';
import ai from './routes/ai.js';
import microsoft from './routes/microsoft.js';
import sequences, { processDueSteps } from './routes/sequences.js';
import views from './routes/views.js';
import webhooks from './routes/webhooks.js';
import reports from './routes/reports.js';
import tags from './routes/tags.js';
import emailTemplates from './routes/email_templates.js';
import dataExport from './routes/data_export.js';
import audit from './routes/audit.js';
import auditActivities from './routes/audit_activities.js';
import prospecting from './routes/prospecting.js';
import { authRouter, requireAuth } from './auth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Liveness and login endpoints are reachable without authentication.
app.get('/api/health', h(async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, schema_version: SCHEMA_VERSION });
}));
app.use('/api/auth', authRouter);

// Everything else under /api requires a session cookie (browser) or API key (n8n),
// unless neither APP_PASSWORD nor API_KEY is configured.
app.use('/api', requireAuth);

// Enum metadata for clients (filter dropdowns, n8n option lists).
app.get('/api/meta', (req, res) => {
  res.json({
    schema_version: SCHEMA_VERSION,
    stages: STAGES,
    ad_spend_ranges: AD_SPEND_RANGES,
    priorities: ['low', 'medium', 'high'],
    lead_statuses: LEAD_STATUSES,
    lifecycle_stages: LIFECYCLE_STAGES,
    target_tiers: TARGET_TIERS,
    buying_committee_statuses: BUYING_COMMITTEE_STATUSES,
    contact_roles: CONTACT_ROLES,
  });
});

// GET /api/search?q= — companies by name/domain, contacts by name/email
app.get('/api/search', h(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ companies: [], contacts: [] });
  const like = `%${q}%`;
  const [cos, cts] = await Promise.all([
    query(
      `SELECT id, name, domain, industry, last_activity_at FROM companies
       WHERE archived_at IS NULL AND (name ILIKE $1 OR domain ILIKE $1) ORDER BY name LIMIT 20`, [like]),
    query(
      `SELECT ct.id, ct.name, ct.title, ct.email, ct.company_id, co.name AS company_name
       FROM contacts ct JOIN companies co ON co.id = ct.company_id
       WHERE co.archived_at IS NULL AND (ct.name ILIKE $1 OR ct.email ILIKE $1) ORDER BY ct.name LIMIT 20`, [like]),
  ]);
  res.json({ companies: cos.rows, contacts: cts.rows });
}));

app.use('/api/companies', companies);
app.use('/api/contacts', contacts);
app.use('/api/deals', deals);
app.use('/api/tasks', tasks);
app.use('/api/notes', notes);
app.use('/api/activities', activities);
app.use('/api/dashboard', dashboard);
app.use('/api/import', importer);
app.use('/api/home', home);
app.use('/api', ai);
app.use('/api', microsoft);
app.use('/api/sequences', sequences);
app.use('/api/views', views);
app.use('/api/webhooks', webhooks);
app.use('/api/reports', reports);
app.use('/api/tags', tags);
app.use('/api/email-templates', emailTemplates);
app.use('/api/export', dataExport);
app.use('/api/audit', audit);
app.use('/api/audit-activities', auditActivities);
app.use('/api/prospecting', prospecting);

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

// Serve the built React client when present (single-port self-hosting).
const clientDist = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
await initDb();

// Sequence scheduler: send due auto-emails and advance enrollments every 5 minutes.
let schedulerRunning = false;
const tick = async () => {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try { await processDueSteps(); }
  catch (e) { console.error('sequence scheduler:', e.message); }
  finally { schedulerRunning = false; }
};
setInterval(tick, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`HVAC CRM API listening on :${PORT}`);
  tick();
});
