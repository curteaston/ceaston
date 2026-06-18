import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { createConnection } from 'net';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { loadLocalEnv, missingConfiguredEnv } from './local-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localEnv = loadLocalEnv({ root });
const isWindows = process.platform === 'win32';

const pgPort = process.env.LOCAL_CRM_PGPORT || '55432';
const dbName = process.env.LOCAL_CRM_DB || 'hvac_crm';
const dbUser = process.env.LOCAL_CRM_DBUSER || 'crm';
const pgData = process.env.LOCAL_CRM_PGDATA || join(root, '.local', 'pgdata');
const pgBin = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const apiPort = process.env.LOCAL_CRM_API_PORT || '3001';
const uiPort = process.env.LOCAL_CRM_UI_PORT || '5173';
const apiBase = normalizeHttpBase(process.env.CRM_API_URL || `http://localhost:${apiPort}`);
const uiBase = normalizeHttpBase(process.env.CRM_UI_URL || `http://localhost:${uiPort}`);
const databaseUrl = process.env.DATABASE_URL || `postgres://${dbUser}@127.0.0.1:${pgPort}/${dbName}`;
const exitAfterReady = process.env.LOCAL_CRM_EXIT_AFTER_READY === '1';

let psql;
let pgCtl;
let initdb;
let startedPostgres = false;
let shuttingDown = false;
const children = [];

mkdirSync(join(root, '.local', 'logs'), { recursive: true });

function normalizeHttpBase(value) {
  const url = new URL(value);
  return url.origin;
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

function printLocalEnvStatus() {
  if (localEnv.files.length) {
    const files = localEnv.files.map((file) => relative(root, file)).join(', ');
    console.log(`Loaded local env: ${files}`);
  }
  for (const warning of localEnv.warnings) console.warn(warning);

  const missingMicrosoft = missingConfiguredEnv(['MS_CLIENT_ID', 'MS_CLIENT_SECRET']);
  if (missingMicrosoft.length === 0) {
    console.log('Office 365 env: configured.');
  } else if (missingMicrosoft.length === 2) {
    console.log('Office 365 env: not configured. Add MS_CLIENT_ID and MS_CLIENT_SECRET to .local/local.env to enable email/calendar.');
  } else {
    console.warn(`Office 365 env: incomplete; missing ${missingMicrosoft.join(', ')}.`);
  }
}

function portFromHttpBase(value) {
  const url = new URL(value);
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsupported database identifier "${value}". Use letters, numbers, and underscores only.`);
  }
  return `"${value.replaceAll('"', '""')}"`;
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
  const fromPgBin = join(pgBin, exe);
  if (existsSync(fromPgBin)) return fromPgBin;
  return findOnPath(name);
}

function setEnvValue(env, key, value) {
  if (value === undefined) return;
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
      if (!Object.keys(env).some((item) => item.toLowerCase() === 'path')) {
        env.Path = value;
      }
    } else if (!isWindows || !Object.keys(env).some((item) => item.toLowerCase() === key.toLowerCase())) {
      env[key] = value;
    }
  }
  if (process.env.LOCAL_CRM_PGPASSWORD) setEnvValue(env, 'PGPASSWORD', process.env.LOCAL_CRM_PGPASSWORD);
  for (const [key, value] of Object.entries(extra)) setEnvValue(env, key, value);
  return env;
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    timeout: options.timeoutMs || 15000,
    env: makeEnv(options.env),
  });
}

function requireOk(result, label) {
  if (result.status === 0) return;
  const detail = (result.stderr || result.stdout || result.error?.message || 'command failed').trim();
  throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
}

function databaseReady(database = dbName) {
  const result = run(psql, ['-h', '127.0.0.1', '-p', pgPort, '-U', dbUser, '-d', database, '-tAc', 'SELECT 1']);
  return result.status === 0 && result.stdout.includes('1');
}

function ensurePostgresTools() {
  psql = findPgTool('psql');
  pgCtl = findPgTool('pg_ctl');
  initdb = findPgTool('initdb');

  if (!psql) {
    throw new Error('Could not find psql. Install PostgreSQL, add it to PATH, set PG_BIN, or set DATABASE_URL.');
  }
}

function startPrivatePostgres() {
  if (!pgCtl || !initdb) {
    throw new Error('Could not connect to Postgres, and pg_ctl/initdb were not both found. Set PG_BIN or DATABASE_URL.');
  }

  if (!existsSync(join(pgData, 'PG_VERSION'))) {
    console.log(`Initializing local Postgres data directory: ${pgData}`);
    const init = run(initdb, ['-D', pgData, '-A', 'trust', '-U', dbUser], { timeoutMs: 60000 });
    requireOk(init, 'initdb');
  }

  const status = run(pgCtl, ['-D', pgData, 'status'], { timeoutMs: 10000 });
  if (status.status === 0) {
    console.log('Workspace Postgres is already running.');
    return;
  }

  console.log(`Starting local Postgres on port ${pgPort}...`);
  const started = run(pgCtl, [
    '-D', pgData,
    '-o', `-p ${pgPort}`,
    '-l', join(root, '.local', 'logs', 'postgres.log'),
    'start',
  ], { timeoutMs: 60000 });
  requireOk(started, 'pg_ctl start');
  startedPostgres = true;
}

function ensureDatabase() {
  if (process.env.DATABASE_URL) {
    console.log('Using DATABASE_URL from environment; skipping local Postgres management.');
    return;
  }

  ensurePostgresTools();
  if (databaseReady(dbName)) {
    console.log(`Using existing Postgres database ${dbName} on 127.0.0.1:${pgPort}.`);
    return;
  }

  if (!databaseReady('postgres')) startPrivatePostgres();

  if (!databaseReady('postgres')) {
    throw new Error(`Could not connect to Postgres on 127.0.0.1:${pgPort}.`);
  }

  const exists = run(psql, [
    '-h', '127.0.0.1',
    '-p', pgPort,
    '-U', dbUser,
    '-d', 'postgres',
    '-tAc', `SELECT 1 FROM pg_database WHERE datname='${dbName.replaceAll("'", "''")}'`,
  ]);
  requireOk(exists, 'database lookup');
  if (!exists.stdout.includes('1')) {
    console.log(`Creating database ${dbName}...`);
    const create = run(psql, [
      '-h', '127.0.0.1',
      '-p', pgPort,
      '-U', dbUser,
      '-d', 'postgres',
      '-c', `CREATE DATABASE ${quoteIdentifier(dbName)}`,
    ], { timeoutMs: 30000 });
    requireOk(create, 'database creation');
  }

  if (!databaseReady(dbName)) {
    throw new Error(`Could not connect to database ${dbName} after setup.`);
  }
}

async function canConnect(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(port), timeout: 1000 });
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

async function ensurePortFree(label, base) {
  const port = portFromHttpBase(base);
  if (!(await canConnect(port))) return;
  throw new Error(
    `${label} port ${port} is already in use. Run npm run dev:local:stop first, ` +
    `or set LOCAL_CRM_API_PORT / LOCAL_CRM_UI_PORT to use alternate ports.`,
  );
}

async function waitForUrl(url, timeoutMs) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    throwIfChildExited();
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (res.ok) return text;
      lastError = new Error(`${url} returned ${res.status}: ${text.slice(0, 200)}`);
    } catch (err) {
      lastError = err;
    }
    await delay(750);
  }
  throw lastError || new Error(`${url} was not ready within ${timeoutMs}ms.`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfChildExited() {
  const exited = children.find((child) => child.exitCode !== null || child.signalCode);
  if (exited) {
    throw new Error(`${exited.localName} exited before local dev became ready.`);
  }
}

function prefixStream(stream, name, writer) {
  let pending = '';
  stream.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) writer(`[${name}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (pending.trim()) writer(`[${name}] ${pending}`);
  });
}

function spawnService(name, cwd, args, env) {
  // Node 24 on Windows can throw EINVAL when spawning .cmd launchers directly.
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const commandArgs = isWindows ? ['/d', '/s', '/c', 'npm.cmd', ...args] : args;
  const child = spawn(command, commandArgs, {
    cwd,
    env: makeEnv(env),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.localName = name;
  children.push(child);

  prefixStream(child.stdout, name, console.log);
  prefixStream(child.stderr, name, console.error);

  child.once('error', (err) => {
    if (shuttingDown) return;
    console.error(`${name} failed to start: ${err.message}`);
    shutdown(1);
  });

  child.once('exit', (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`${name} exited unexpectedly with ${reason}.`);
    shutdown(1);
  });

  return child;
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  if (isWindows) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      encoding: 'utf8',
      stdio: 'ignore',
    });
  } else {
    child.kill('SIGTERM');
  }
}

function stopPostgres() {
  if (!startedPostgres || !pgCtl) return;
  console.log('Stopping workspace Postgres started by this run...');
  run(pgCtl, ['-D', pgData, 'stop', '-m', 'fast'], { timeoutMs: 30000 });
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [...children].reverse()) stopProcessTree(child);
  stopPostgres();
  process.exit(code);
}

async function seedIfNeeded() {
  if (process.env.LOCAL_CRM_SEED === '0') return;
  console.log('Checking local demo data...');
  const seed = run(process.execPath, [join(root, 'scripts', 'seed-local-if-empty.mjs')], {
    env: {
      DATABASE_URL: databaseUrl,
      CRM_URL: apiBase,
    },
    timeoutMs: 60000,
  });
  if (seed.stdout.trim()) console.log(seed.stdout.trim());
  if (seed.stderr.trim()) console.error(seed.stderr.trim());
  requireOk(seed, 'local seed check');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (err) => {
  console.error(err.message || err);
  shutdown(1);
});
process.on('unhandledRejection', (err) => {
  console.error(err?.message || err);
  shutdown(1);
});

try {
  ensureDatabase();
  await ensurePortFree('API', apiBase);
  await ensurePortFree('Client', uiBase);

  const sharedEnv = {
    DATABASE_URL: databaseUrl,
    CRM_API_URL: apiBase,
    CRM_UI_URL: uiBase,
    LOCAL_CRM_API_PORT: portFromHttpBase(apiBase),
    LOCAL_CRM_UI_PORT: portFromHttpBase(uiBase),
  };

  console.log('Starting local dev stack in this foreground process.');
  console.log(`DATABASE_URL=${redactDatabaseUrl(databaseUrl)}`);
  console.log(`API=${apiBase}`);
  console.log(`UI=${uiBase}`);
  printLocalEnvStatus();
  console.log('');

  spawnService('api', join(root, 'server'), ['run', 'dev'], {
    ...sharedEnv,
    PORT: portFromHttpBase(apiBase),
  });
  await waitForUrl(`${apiBase}/api/health`, 30000);

  await seedIfNeeded();

  spawnService('client', join(root, 'client'), ['run', 'dev', '--', '--host', '127.0.0.1', '--port', portFromHttpBase(uiBase)], sharedEnv);
  await waitForUrl(uiBase, 30000);

  console.log('');
  console.log('Local dev is ready.');
  console.log(`Open: ${uiBase}`);
  console.log('Press Ctrl+C to stop API, client, and any workspace Postgres started by this run.');

  if (exitAfterReady) {
    console.log('LOCAL_CRM_EXIT_AFTER_READY=1 set; shutting down after readiness check.');
    await shutdown(0);
  }
} catch (err) {
  console.error('');
  console.error(`Local dev startup failed: ${err.message}`);
  console.error('Run npm run doctor for diagnostics.');
  await shutdown(1);
}
