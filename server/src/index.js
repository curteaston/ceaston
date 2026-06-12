import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb, query } from './db.js';
import { h, STAGES, AD_SPEND_RANGES, LEAD_STATUSES, LIFECYCLE_STAGES } from './util.js';
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

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Optional API key: set API_KEY env var and send X-Api-Key (or Bearer token) — used by n8n.
const API_KEY = process.env.API_KEY;
app.use('/api', (req, res, next) => {
  if (!API_KEY) return next();
  const provided = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided === API_KEY) return next();
  res.status(401).json({ error: 'Invalid or missing API key' });
});

app.get('/api/health', h(async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
}));

// Enum metadata for clients (filter dropdowns, n8n option lists).
app.get('/api/meta', (req, res) => {
  res.json({
    stages: STAGES,
    ad_spend_ranges: AD_SPEND_RANGES,
    priorities: ['low', 'medium', 'high'],
    lead_statuses: LEAD_STATUSES,
    lifecycle_stages: LIFECYCLE_STAGES,
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
       WHERE name ILIKE $1 OR domain ILIKE $1 ORDER BY name LIMIT 20`, [like]),
    query(
      `SELECT ct.id, ct.name, ct.title, ct.email, ct.company_id, co.name AS company_name
       FROM contacts ct JOIN companies co ON co.id = ct.company_id
       WHERE ct.name ILIKE $1 OR ct.email ILIKE $1 ORDER BY ct.name LIMIT 20`, [like]),
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
app.listen(PORT, () => console.log(`HVAC CRM API listening on :${PORT}`));
