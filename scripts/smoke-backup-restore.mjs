import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const isWindows = process.platform === 'win32';

const LOCAL_DATABASE_URL = `postgres://${process.env.LOCAL_CRM_DBUSER || 'crm'}@127.0.0.1:${process.env.LOCAL_CRM_PGPORT || '55432'}/${process.env.LOCAL_CRM_DB || 'hvac_crm'}`;
const baseDatabaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
const apiBase = normalizeHttpBase(process.env.CRM_API_URL || process.env.CRM_URL || `http://localhost:${process.env.LOCAL_CRM_API_PORT || 3001}`);
const pgBin = process.env.PG_BIN || (isWindows ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
const keepArtifacts = process.argv.includes('--keep-artifacts');

const RESTORE_TABLES = [
  'companies',
  'contacts',
  'deals',
  'tasks',
  'notes',
  'activities',
  'sequences',
  'sequence_steps',
  'sequence_enrollments',
  'sequence_step_runs',
  'tags',
  'company_tags',
  'contact_tags',
  'saved_views',
  'email_templates',
  'webhooks',
  'data_audit_batches',
  'data_audit_events',
];

const psql = findPgTool('psql');
if (!psql) {
  console.error('Recovery smoke failed: could not find psql. Set PG_BIN or add PostgreSQL bin to PATH.');
  process.exit(1);
}

const baseSpec = parseDatabaseUrl(baseDatabaseUrl);
const drillDb = `hvac_crm_restore_smoke_${Date.now()}_${process.pid}`;
const drillDatabaseUrl = databaseUrlForName(baseDatabaseUrl, drillDb);
const workParent = join(root, '.local', 'recovery-drills');
await mkdir(workParent, { recursive: true });
const workDir = await mkdtemp(join(workParent, 'run-'));
const snapshotPath = join(workDir, 'snapshot.json');

function normalizeHttpBase(value) {
  const url = new URL(value);
  return url.origin;
}

function findOnPath(command) {
  const names = isWindows && !command.toLowerCase().endsWith('.exe')
    ? [`${command}.exe`, command]
    : [command];
  const pathValue = process.env.PATH || process.env.Path || '';
  const dirs = pathValue.split(isWindows ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findPgTool(name) {
  const exe = isWindows && !name.endsWith('.exe') ? `${name}.exe` : name;
  if (pgBin) {
    const fromPgBin = join(pgBin, exe);
    if (existsSync(fromPgBin)) return fromPgBin;
  }
  return findOnPath(name);
}

function setEnvValue(env, key, value) {
  if (value === undefined || value === null || value === '') return;
  if (isWindows) {
    const existing = Object.keys(env).find((item) => item.toLowerCase() === key.toLowerCase());
    if (existing && existing !== key) delete env[existing];
  }
  env[key] = String(value);
}

function makeEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (isWindows && key.toLowerCase() === 'path') {
      if (!Object.keys(env).some((item) => item.toLowerCase() === 'path')) env.Path = value;
    } else if (!isWindows || !Object.keys(env).some((item) => item.toLowerCase() === key.toLowerCase())) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extra)) setEnvValue(env, key, value);
  return env;
}

function parseDatabaseUrl(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}`);
  }
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '5432',
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'postgres'),
  };
}

function databaseUrlForName(value, databaseName) {
  const url = new URL(value);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.toString();
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: options.timeoutMs || 30000,
    env: makeEnv(options.env),
  });
  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout || ''}${result.stderr || ''}${result.error?.message || ''}`.trim();
    throw new Error(`${options.label || command} failed${output ? `: ${output}` : ''}`);
  }
  return result;
}

function runNode(script, args, options = {}) {
  return run(process.execPath, [join(root, script), ...args], options);
}

function runPsql(database, sql, options = {}) {
  const args = [
    '-v', 'ON_ERROR_STOP=1',
    '-h', baseSpec.host,
    '-p', baseSpec.port,
    '-d', database,
    '-tAc', sql,
  ];
  if (baseSpec.user) args.splice(6, 0, '-U', baseSpec.user);
  return run(psql, args, {
    ...options,
    env: {
      ...(baseSpec.password ? { PGPASSWORD: baseSpec.password } : {}),
      ...(options.env || {}),
    },
  });
}

function queryScalar(database, sql) {
  return runPsql(database, sql).stdout.trim();
}

function createDatabase() {
  console.log(`Creating recovery drill database ${drillDb}...`);
  runPsql('postgres', `CREATE DATABASE ${quoteIdentifier(drillDb)}`, { label: 'create recovery drill database' });
}

function dropDatabase() {
  runPsql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${sqlLiteral(drillDb)} AND pid <> pg_backend_pid()`, {
    allowFailure: true,
  });
  runPsql('postgres', `DROP DATABASE IF EXISTS ${quoteIdentifier(drillDb)}`, {
    allowFailure: true,
  });
}

async function readSnapshot() {
  return JSON.parse(await readFile(snapshotPath, 'utf8'));
}

function assertSnapshot(snapshot) {
  if (snapshot.kind !== 'prospecting-data-snapshot') throw new Error(`Unexpected snapshot kind ${snapshot.kind}`);
  if (snapshot.schema_version !== 'prospecting-v1') throw new Error(`Unexpected schema version ${snapshot.schema_version}`);
  if (!snapshot.data?.companies?.length) {
    throw new Error('Recovery smoke requires at least one company in the source database.');
  }
}

function compareRestoredCounts(snapshot) {
  const mismatches = [];
  for (const table of RESTORE_TABLES) {
    const restored = Number(queryScalar(drillDb, `SELECT count(*) FROM ${quoteIdentifier(table)}`));
    if (restored !== snapshot.counts[table]) {
      mismatches.push(`${table}: expected ${snapshot.counts[table]}, got ${restored}`);
    }
  }
  if (mismatches.length) throw new Error(`Restored table counts did not match snapshot: ${mismatches.join('; ')}`);
}

function verifySensitiveTablesStayExcluded() {
  const appSettings = Number(queryScalar(drillDb, 'SELECT count(*) FROM app_settings'));
  if (appSettings !== 0) throw new Error(`app_settings should not be restored, found ${appSettings} row(s).`);

  const webhookSecrets = Number(queryScalar(drillDb, "SELECT count(*) FROM webhooks WHERE secret IS NOT NULL AND secret <> ''"));
  if (webhookSecrets !== 0) throw new Error(`webhook secrets should not be restored, found ${webhookSecrets} row(s).`);
}

function verifyFirstCompany(snapshot) {
  const first = snapshot.data.companies[0];
  const restored = queryScalar(drillDb, "SELECT id::text || E'\\t' || name FROM companies ORDER BY id LIMIT 1");
  const expected = `${first.id}\t${first.name}`;
  if (restored !== expected) throw new Error(`First company mismatch. Expected ${expected}, got ${restored}.`);
}

try {
  console.log(`Exporting source snapshot from ${apiBase}...`);
  runNode('scripts/backup-snapshot.mjs', ['--api-url', apiBase, '--out', snapshotPath], {
    label: 'backup snapshot export',
    env: {
      CRM_API_URL: apiBase,
      ...(process.env.API_KEY ? { API_KEY: process.env.API_KEY } : {}),
    },
  });

  const snapshot = await readSnapshot();
  assertSnapshot(snapshot);

  createDatabase();
  console.log('Restoring snapshot into disposable database...');
  runNode('scripts/restore-snapshot.mjs', ['--file', snapshotPath, '--database-url', drillDatabaseUrl], {
    label: 'snapshot restore',
    env: {
      DATABASE_URL: drillDatabaseUrl,
    },
    timeoutMs: 120000,
  });

  compareRestoredCounts(snapshot);
  verifyFirstCompany(snapshot);
  verifySensitiveTablesStayExcluded();

  console.log(`Recovery smoke passed: restored ${snapshot.counts.companies} companies and ${snapshot.counts.contacts} contacts into ${drillDb}.`);
} catch (err) {
  console.error(`Recovery smoke failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  dropDatabase();
  if (!keepArtifacts) {
    await rm(workDir, { recursive: true, force: true });
  } else {
    console.log(`Kept recovery drill artifacts at ${workDir}`);
  }
}
