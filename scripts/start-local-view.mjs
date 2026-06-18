import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { loadLocalEnv } from './local-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localEnv = loadLocalEnv({ root });
const requestedApiBase = process.env.CRM_API_URL || 'http://localhost:3001';
const apiUrl = new URL(requestedApiBase);
const apiBase = apiUrl.origin;

function redactDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return value;
  }
}

async function getHealth() {
  try {
    const res = await fetch(`${apiBase}/api/health`);
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, text };
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const health = await getHealth();
if (health.ok && health.data?.ok && health.data?.schema_version === 'prospecting-v1') {
  console.log(`CRM API is already running at ${apiBase}.`);
  console.log(`Open ${apiBase}/companies/1`);
  process.exit(0);
}

process.env.DATABASE_URL ||= 'postgres://crm@127.0.0.1:55432/hvac_crm';
process.env.PORT ||= apiUrl.port || (apiUrl.protocol === 'https:' ? '443' : '80');

console.log('Starting single-port local CRM view.');
console.log(`DATABASE_URL=${redactDatabaseUrl(process.env.DATABASE_URL)}`);
if (localEnv.files.length) console.log(`Loaded local env: ${localEnv.files.map((file) => relative(root, file)).join(', ')}`);
for (const warning of localEnv.warnings) console.warn(warning);
console.log(`Open ${apiBase}/companies/1 after the server starts.`);
console.log('Press Ctrl+C to stop.');

await import('../server/src/index.js');
