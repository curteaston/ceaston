const apiBase = process.env.CRM_API_URL || `http://localhost:${process.env.LOCAL_CRM_API_PORT || 3001}`;
const uiBase = process.env.CRM_UI_URL || `http://localhost:${process.env.LOCAL_CRM_UI_PORT || 5173}`;

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

try {
  const html = await getText(uiBase);
  if (!html.includes('<div id="root"></div>')) {
    failures.push('Client did not return the Vite app shell');
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
console.log(`UI:  ${uiBase}`);
