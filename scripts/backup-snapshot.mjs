import { mkdir, writeFile } from 'fs/promises';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiBase = normalizeHttpBase(readOption('--api-url') || process.env.CRM_API_URL || process.env.CRM_URL || 'http://localhost:3001');
const outPath = resolveOutputPath(readOption('--out'));

const headers = {
  ...(process.env.API_KEY ? { 'X-Api-Key': process.env.API_KEY } : {}),
};

function usage() {
  return [
    'Usage: node scripts/backup-snapshot.mjs [--api-url http://localhost:3001] [--out path]',
    '',
    'Exports /api/export/snapshot to a local JSON file.',
  ].join('\n');
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} requires a value.`);
    console.error(usage());
    process.exit(1);
  }
  return value;
}

function normalizeHttpBase(value) {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    console.error(`Invalid API URL: ${value}`);
    process.exit(1);
  }
}

function snapshotFilename() {
  const stamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '')
    .replace('T', '-');
  return `prospecting-snapshot-${stamp}.json`;
}

function resolveOutputPath(value) {
  if (!value) return join(root, '.local', 'backups', snapshotFilename());
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Snapshot response was not a JSON object.');
  if (snapshot.kind !== 'prospecting-data-snapshot') throw new Error(`Unexpected snapshot kind: ${snapshot.kind || 'missing'}`);
  if (snapshot.schema_version !== 'prospecting-v1') throw new Error(`Unsupported schema version: ${snapshot.schema_version || 'missing'}`);
  if (!snapshot.data || typeof snapshot.data !== 'object') throw new Error('Snapshot is missing data.');
  if (!snapshot.counts || typeof snapshot.counts !== 'object') throw new Error('Snapshot is missing counts.');

  for (const [table, rows] of Object.entries(snapshot.data)) {
    if (!Array.isArray(rows)) throw new Error(`Snapshot table ${table} is not an array.`);
    if (snapshot.counts[table] !== rows.length) {
      throw new Error(`Snapshot count mismatch for ${table}: counts says ${snapshot.counts[table]}, data has ${rows.length}.`);
    }
  }
}

try {
  const res = await fetch(`${apiBase}/api/export/snapshot`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET /api/export/snapshot returned ${res.status}: ${text.slice(0, 500)}`);

  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    throw new Error('Snapshot response was not valid JSON.');
  }
  validateSnapshot(snapshot);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const companyCount = snapshot.counts.companies ?? 0;
  const contactCount = snapshot.counts.contacts ?? 0;
  console.log(`Backup exported to ${outPath}`);
  console.log(`Snapshot: ${companyCount} companies, ${contactCount} contacts, schema ${snapshot.schema_version}.`);
  console.log(`Excluded: ${(snapshot.excluded || []).join(', ') || 'none'}`);
} catch (err) {
  console.error(`Backup failed: ${err.message}`);
  process.exit(1);
}
