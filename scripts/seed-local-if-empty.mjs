import { seedDemoData } from '../server/scripts/seed.js';

const base = process.env.CRM_URL || 'http://localhost:3001';
const headers = {
  'Content-Type': 'application/json',
  ...(process.env.API_KEY ? { 'X-Api-Key': process.env.API_KEY } : {}),
};

async function getJson(path) {
  const res = await fetch(`${base}/api${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function waitForApi() {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 30000) {
    try {
      const health = await getJson('/health');
      if (health.ok) return health;
      lastError = new Error('API health did not return ok=true');
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw lastError || new Error('API did not become ready');
}

const health = await waitForApi();
if (health.schema_version !== 'prospecting-v1') {
  throw new Error(`Expected prospecting-v1 API schema, got ${health.schema_version || 'missing'}`);
}

const meta = await getJson('/meta');
if (meta.schema_version !== 'prospecting-v1') {
  throw new Error(`Expected prospecting-v1 metadata, got ${meta.schema_version || 'missing'}`);
}

const companies = await getJson('/companies?limit=1');
if ((companies.total || 0) > 0 || (companies.companies || []).length > 0) {
  console.log(`Local demo data already present (${companies.total || companies.companies.length} companies).`);
} else {
  console.log('Local database is empty; seeding demo HVAC prospects.');
  await seedDemoData({ base, headers });
}
