import { normalizeHttpBase, resolveUiBase } from './local-smoke-env.mjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadLocalEnv } from './local-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv({ root });

const apiBase = normalizeHttpBase(process.env.CRM_API_URL || process.env.CRM_URL || `http://localhost:${process.env.LOCAL_CRM_API_PORT || 3001}`);
const uiBase = await resolveUiBase({ apiBase });

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

const requiredMeta = [
  'target_tiers',
  'buying_committee_statuses',
  'contact_roles',
];

const failures = [];

try {
  const health = await getJson(`${apiBase}/api/health`);
  if (!health.ok) failures.push('API health did not return ok=true');
} catch (err) {
  failures.push(`API health failed: ${err.message}`);
}

try {
  const meta = await getJson(`${apiBase}/api/meta`);
  for (const key of requiredMeta) {
    if (!Array.isArray(meta[key]) || meta[key].length === 0) {
      failures.push(`API metadata missing ${key}`);
    }
  }
  if (meta.schema_version !== 'prospecting-v1') {
    failures.push(`API schema_version expected prospecting-v1, got ${meta.schema_version || 'missing'}`);
  }
} catch (err) {
  failures.push(`API metadata failed: ${err.message}`);
}

let microsoftStatus = null;
try {
  microsoftStatus = await getJson(`${apiBase}/api/integrations/microsoft/status`);
} catch (err) {
  failures.push(`Office 365 status failed: ${err.message}`);
}

try {
  const html = await getText(`${uiBase}/companies/1`);
  if (!html.includes('<div id="root"></div>')) {
    failures.push('Client did not return the React app shell');
  }
} catch (err) {
  failures.push(`Client failed: ${err.message}`);
}

if (failures.length) {
  console.error('Local dev check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Local dev check passed.');
console.log(`API: ${apiBase}`);
console.log(`UI:  ${uiBase}${uiBase === apiBase ? ' (single-port API)' : ''}`);
if (microsoftStatus) {
  const state = microsoftStatus.connected
    ? `connected as ${microsoftStatus.account || 'unknown account'}`
    : microsoftStatus.configured
      ? 'configured but not connected'
      : microsoftStatus.token_stored
        ? 'server config missing; saved token still exists'
        : 'not configured';
  console.log(`Office 365: ${state}`);
}
