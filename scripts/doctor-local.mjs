import { existsSync, readdirSync, statSync } from 'fs';
import { createConnection } from 'net';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const pgPort = process.env.LOCAL_CRM_PGPORT || '55432';
const dbName = process.env.LOCAL_CRM_DB || 'hvac_crm';
const dbUser = process.env.LOCAL_CRM_DBUSER || 'crm';
const pgData = process.env.LOCAL_CRM_PGDATA || join(root, '.local', 'pgdata');
const pgBin = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const apiPort = process.env.LOCAL_CRM_API_PORT || '3001';
const uiPort = process.env.LOCAL_CRM_UI_PORT || '5173';
const databaseUrl = process.env.DATABASE_URL || `postgres://${dbUser}@127.0.0.1:${pgPort}/${dbName}`;
const apiBase = process.env.CRM_API_URL || `http://localhost:${apiPort}`;
const uiBase = process.env.CRM_UI_URL || `http://localhost:${uiPort}`;
const explicitDatabaseUrl = Boolean(process.env.DATABASE_URL);

const results = [];

function add(status, label, detail) {
  results.push({ status, label, detail });
}

function findOnPath(command) {
  const names = isWindows && !command.toLowerCase().endsWith('.exe')
    ? [`${command}.exe`, command]
    : [command];
  const dirs = (process.env.PATH || process.env.Path || '').split(isWindows ? ';' : ':').filter(Boolean);
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
  const fromPgBin = join(pgBin, exe);
  if (existsSync(fromPgBin)) return fromPgBin;
  return findOnPath(name);
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs || 10000,
    env: {
      ...process.env,
      ...(process.env.LOCAL_CRM_PGPASSWORD ? { PGPASSWORD: process.env.LOCAL_CRM_PGPASSWORD } : {}),
      ...(options.env || {}),
    },
  });
}

function parsePostgresUrl(value) {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null;
    return {
      host: url.hostname || '127.0.0.1',
      port: url.port || '5432',
      database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'postgres'),
      user: decodeURIComponent(url.username || dbUser),
      password: url.password ? decodeURIComponent(url.password) : '',
    };
  } catch {
    return null;
  }
}

function redactDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return value;
  }
}

function portFromHttpBase(value) {
  const url = new URL(value);
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
}

async function canConnect(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(port), timeout: 1500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function httpJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

async function httpText(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text.slice(0, 160)}`);
  return text;
}

function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const supported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
  if (supported) {
    add('pass', 'Node version', `v${process.versions.node}`);
  } else {
    add('fail', 'Node version', `v${process.versions.node}; Vite 8 requires Node 20.19+ or 22.12+.`);
  }
}

function checkNpm() {
  const npmExecPath = process.env.npm_execpath;
  const result = npmExecPath && existsSync(npmExecPath)
    ? run(process.execPath, [npmExecPath, '--version'], { timeoutMs: 10000 })
    : run(isWindows ? 'npm.cmd' : 'npm', ['--version'], { timeoutMs: 10000 });
  if (result.status === 0) add('pass', 'npm available', result.stdout.trim());
  else add('fail', 'npm available', (result.error?.message || result.stderr || result.stdout || 'npm command failed').trim());
}

function checkInstallState() {
  const missing = [];
  for (const path of ['server/node_modules', 'client/node_modules']) {
    const full = join(root, path);
    if (!existsSync(full)) missing.push(path);
  }
  if (missing.length) add('warn', 'Dependencies installed', `Missing ${missing.join(', ')}. Run npm run ci:install or npm run install:all.`);
  else add('pass', 'Dependencies installed', 'server and client node_modules found');
}

function directoryHasFiles(path) {
  try {
    return statSync(path).isDirectory() && readdirSync(path).length > 0;
  } catch {
    return false;
  }
}

function checkPostgresTools() {
  const psql = findPgTool('psql');
  const pgCtl = findPgTool('pg_ctl');
  const initdb = findPgTool('initdb');
  if (psql) add('pass', 'psql available', psql);
  else if (process.env.DATABASE_URL) add('warn', 'psql available', 'Not found, but DATABASE_URL is set. Startup can still try the API connection.');
  else add('fail', 'psql available', `Not found. Set PG_BIN, add PostgreSQL bin to PATH, or set DATABASE_URL.`);

  if (process.env.DATABASE_URL) {
    add('pass', 'Postgres management mode', 'DATABASE_URL is set; doctor will not require pg_ctl/initdb.');
  } else if (pgCtl && initdb) {
    add('pass', 'Workspace Postgres tools', `${pgCtl}; ${initdb}`);
  } else {
    add('warn', 'Workspace Postgres tools', 'pg_ctl/initdb not both found. Existing Postgres must be reachable, or PG_BIN must be set.');
  }
  return { psql };
}

function checkDatabase(psql) {
  const database = parsePostgresUrl(databaseUrl);
  if (!database) {
    add('fail', 'DATABASE_URL', `Could not parse ${redactDatabaseUrl(databaseUrl)} as a PostgreSQL URL.`);
    return;
  }

  if (!psql) return;
  const pgEnv = database.password ? { PGPASSWORD: database.password } : {};
  const result = run(
    psql,
    ['-h', database.host, '-p', database.port, '-U', database.user, '-d', database.database, '-tAc', 'SELECT 1'],
    { env: pgEnv },
  );
  if (result.status === 0 && result.stdout.includes('1')) {
    add('pass', 'CRM database reachable', `${database.database} as ${database.user} on ${database.host}:${database.port}`);
    return;
  }

  if (explicitDatabaseUrl) {
    add('fail', 'CRM database reachable', `DATABASE_URL target is not reachable: ${redactDatabaseUrl(databaseUrl)}`);
    return;
  }

  const postgres = run(psql, ['-h', '127.0.0.1', '-p', pgPort, '-U', dbUser, '-d', 'postgres', '-tAc', 'SELECT 1']);
  if (postgres.status === 0 && postgres.stdout.includes('1')) {
    add('warn', 'CRM database reachable', `Postgres is reachable, but database ${dbName} is missing or inaccessible. npm run dev:local will try to create it.`);
  } else if (existsSync(join(pgData, 'PG_VERSION'))) {
    add('warn', 'CRM database reachable', `Not reachable now, but workspace pgdata exists at ${pgData}. npm run dev:local will try to start it.`);
  } else if (directoryHasFiles(pgData)) {
    add('warn', 'Workspace pgdata', `${pgData} exists but has no PG_VERSION. It may be a failed init; rename it if initdb keeps failing.`);
  } else {
    add('warn', 'CRM database reachable', `Not reachable now. npm run dev:local will try to initialize ${pgData}.`);
  }
}

async function checkPortsAndServices() {
  const apiUrl = `${apiBase}/api/health`;
  const apiPort = portFromHttpBase(apiBase);
  if (await canConnect(apiPort)) {
    try {
      const health = await httpJson(apiUrl);
      if (health?.ok && health?.schema_version === 'prospecting-v1') {
        add('pass', 'API service', `${apiUrl} returned prospecting-v1`);
      } else {
        add('fail', 'API service', `${apiUrl} responded, but schema/version was unexpected: ${JSON.stringify(health)}`);
      }
    } catch (err) {
      add('fail', 'API service', `Port ${apiPort} is occupied, but ${apiUrl} is not healthy: ${err.message}`);
    }
  } else {
    add('warn', 'API service', `Nothing is listening on ${apiBase}. npm run dev:local should start it.`);
  }

  const uiPort = portFromHttpBase(uiBase);
  if (await canConnect(uiPort)) {
    try {
      const html = await httpText(uiBase);
      if (html.includes('<div id="root"></div>')) add('pass', 'Client service', `${uiBase} returned the app shell`);
      else add('warn', 'Client service', `${uiBase} responded, but did not look like the Vite app shell`);
    } catch (err) {
      add('fail', 'Client service', `Port ${uiPort} is occupied, but ${uiBase} is not healthy: ${err.message}`);
    }
  } else {
    try {
      const html = await httpText(apiBase);
      if (html.includes('<div id="root"></div>')) {
        add('pass', 'Single-port client', `${apiBase} is serving the built React app`);
        add('warn', 'Vite client service', `Nothing is listening on ${uiBase}. This is fine for npm run start:local, but npm run dev:local should start it.`);
      } else {
        add('warn', 'Client service', `Nothing is listening on ${uiBase}. npm run dev:local should start it.`);
      }
    } catch {
      add('warn', 'Client service', `Nothing is listening on ${uiBase}. npm run dev:local should start it.`);
    }
  }
}

checkNode();
checkNpm();
checkInstallState();
const { psql } = checkPostgresTools();
checkDatabase(psql);
await checkPortsAndServices();

const icon = { pass: '[OK]', warn: '[WARN]', fail: '[FAIL]' };
for (const result of results) {
  console.log(`${icon[result.status]} ${result.label}: ${result.detail}`);
}

const failures = results.filter((result) => result.status === 'fail');
const warnings = results.filter((result) => result.status === 'warn');
const hasSinglePortClient = results.some((result) => result.status === 'pass' && result.label === 'Single-port client');

console.log('');
console.log(`DATABASE_URL: ${redactDatabaseUrl(databaseUrl)}`);
console.log(`API: ${apiBase}`);
console.log(`UI: ${uiBase}`);

if (failures.length) {
  console.error('');
  console.error(`Doctor failed with ${failures.length} blocking issue${failures.length === 1 ? '' : 's'}.`);
  process.exit(1);
}

if (warnings.length) {
  console.log('');
  if (hasSinglePortClient) {
    console.log(`Doctor passed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. The single-port app is available for local viewing.`);
  } else {
    console.log(`Doctor passed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. Run npm run dev:local to start missing services.`);
  }
} else {
  console.log('');
  console.log('Doctor passed. Local CRM services look ready.');
}
