import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { createConnection, createServer } from 'net';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { normalizeHttpBase, resolveUiBase, servesAppShell } from './local-smoke-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

const defaultDatabaseUrl = `postgres://${process.env.LOCAL_CRM_DBUSER || 'crm'}@127.0.0.1:${process.env.LOCAL_CRM_PGPORT || '55432'}/${process.env.LOCAL_CRM_DB || 'hvac_crm'}`;
const baseDatabaseUrl = process.env.LOCAL_CRM_TEST_DATABASE_URL || process.env.DATABASE_URL || defaultDatabaseUrl;
const requestedApiBase = normalizeHttpBase(process.env.CRM_API_URL || process.env.CRM_URL || `http://localhost:${process.env.LOCAL_CRM_API_PORT || 3001}`);
const apiBaseExplicit = Boolean(process.env.CRM_API_URL || process.env.CRM_URL || process.env.LOCAL_CRM_API_PORT);
const buildClient = process.env.LOCAL_CRM_TEST_BUILD !== '0';
const isolatedMode = process.env.LOCAL_CRM_TEST_ISOLATION !== '0';
const keepTestDb = process.env.LOCAL_CRM_TEST_KEEP_DB === '1';
const pgBin = process.env.PG_BIN || (isWindows ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');

let apiBase = requestedApiBase;
let apiPort = portFromHttpBase(apiBase);
let databaseUrl = baseDatabaseUrl;
let testDatabaseName = null;
let startedApi = null;
let shuttingDown = false;

mkdirSync(join(root, '.local', 'logs'), { recursive: true });

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
      if (!Object.keys(env).some((item) => item.toLowerCase() === 'path')) env.Path = value;
    } else if (!isWindows || !Object.keys(env).some((item) => item.toLowerCase() === key.toLowerCase())) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extra)) setEnvValue(env, key, value);
  return env;
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: makeEnv(options.env),
    encoding: 'utf8',
    stdio: options.stdio || 'inherit',
    timeout: options.timeoutMs || 120000,
  });
  if (result.status === 0 || options.allowFailure) return result;
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error?.message || ''}`.trim();
  const detail = output || `exit code ${result.status}`;
  throw new Error(`${options.label || command} failed: ${detail}`);
}

function runNpm(args, options = {}) {
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const commandArgs = isWindows ? ['/d', '/s', '/c', 'npm.cmd', ...args] : args;
  runSync(command, commandArgs, options);
}

function runNodeScript(script, args = [], env = {}) {
  runSync(process.execPath, [join(root, script), ...args], {
    env,
    timeoutMs: 180000,
    label: script,
  });
}

function portFromHttpBase(value) {
  const url = new URL(value);
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
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

function runPsql(database, sql, options = {}) {
  const psql = findPgTool('psql');
  if (!psql) throw new Error('Could not find psql. Set PG_BIN or add PostgreSQL bin to PATH for isolated local tests.');

  const spec = parseDatabaseUrl(baseDatabaseUrl);
  const args = [
    '-v', 'ON_ERROR_STOP=1',
    '-h', spec.host,
    '-p', spec.port,
    '-d', database,
    '-tAc', sql,
  ];
  if (spec.user) args.splice(6, 0, '-U', spec.user);
  return runSync(psql, args, {
    ...options,
    stdio: options.stdio || 'pipe',
    env: {
      ...(spec.password ? { PGPASSWORD: spec.password } : {}),
      ...(options.env || {}),
    },
  });
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
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

async function configureIsolatedTarget() {
  testDatabaseName = `hvac_crm_test_${Date.now()}_${process.pid}`;
  databaseUrl = databaseUrlForName(baseDatabaseUrl, testDatabaseName);

  if (apiBaseExplicit) {
    apiPort = portFromHttpBase(apiBase);
    if (await canConnect(apiPort)) {
      throw new Error(
        `Isolated local tests cannot use ${apiBase} because that port is already occupied. ` +
        'Unset CRM_API_URL/LOCAL_CRM_API_PORT or set LOCAL_CRM_TEST_ISOLATION=0 to test the running app deliberately.',
      );
    }
  } else {
    apiPort = String(await findFreePort());
    apiBase = `http://127.0.0.1:${apiPort}`;
  }
}

function createTestDatabase() {
  if (!testDatabaseName) return;
  console.log(`Creating isolated test database ${testDatabaseName}...`);
  runPsql('postgres', `CREATE DATABASE ${quoteIdentifier(testDatabaseName)}`, {
    label: 'create isolated test database',
  });
}

function dropTestDatabase() {
  if (!testDatabaseName) return;
  if (!testDatabaseName.startsWith('hvac_crm_test_')) {
    throw new Error(`Refusing to drop unexpected database name ${testDatabaseName}`);
  }
  if (keepTestDb) {
    console.log(`Keeping isolated test database ${testDatabaseName} because LOCAL_CRM_TEST_KEEP_DB=1.`);
    return;
  }

  console.log(`Dropping isolated test database ${testDatabaseName}...`);
  runPsql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${sqlLiteral(testDatabaseName)} AND pid <> pg_backend_pid()`, {
    allowFailure: true,
    label: 'terminate isolated test database connections',
    timeoutMs: 15000,
  });
  runPsql('postgres', `DROP DATABASE IF EXISTS ${quoteIdentifier(testDatabaseName)} WITH (FORCE)`, {
    allowFailure: true,
    label: 'drop isolated test database',
    timeoutMs: 30000,
  });
  console.log(`Dropped isolated test database ${testDatabaseName}.`);
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

function startApi() {
  const mode = isolatedMode ? 'isolated single-port API' : 'single-port local API';
  console.log(`Starting ${mode} for tests at ${apiBase}.`);
  const child = spawn(process.execPath, [join(root, 'scripts', 'start-local-view.mjs')], {
    cwd: root,
    env: makeEnv({
      CRM_API_URL: apiBase,
      DATABASE_URL: databaseUrl,
      PORT: apiPort,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.localName = 'api';
  prefixStream(child.stdout, 'api', console.log);
  prefixStream(child.stderr, 'api', console.error);
  child.once('exit', (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`API exited unexpectedly with ${reason}.`);
  });
  startedApi = child;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopStartedServices() {
  shuttingDown = true;
  if (!startedApi || startedApi.exitCode !== null || startedApi.signalCode) return;
  const child = startedApi;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  if (isWindows) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  } else {
    child.kill('SIGTERM');
  }
  await Promise.race([exited, delay(5000)]);
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.removeAllListeners();
  startedApi = null;
}

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function apiHealthy() {
  try {
    const health = await getJson(`${apiBase}/api/health`);
    return health.ok && health.schema_version === 'prospecting-v1';
  } catch {
    return false;
  }
}

async function waitForApi(timeoutMs = 30000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (startedApi && (startedApi.exitCode !== null || startedApi.signalCode)) {
      throw new Error('Started API process exited before becoming healthy.');
    }
    try {
      const health = await getJson(`${apiBase}/api/health`);
      if (health.ok && health.schema_version === 'prospecting-v1') return health;
      lastError = new Error(`API health returned ${JSON.stringify(health)}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw lastError || new Error(`API was not healthy within ${timeoutMs}ms.`);
}

async function ensureApi() {
  if (!isolatedMode && await apiHealthy()) {
    console.log(`Using running API at ${apiBase}.`);
    return;
  }
  startApi();
  await waitForApi();
}

async function ensureUi() {
  const uiBase = isolatedMode ? apiBase : await resolveUiBase({ apiBase });
  if (!(await servesAppShell(uiBase))) {
    throw new Error(`Client shell was not reachable at ${uiBase}. Check the API logs.`);
  }
  return uiBase;
}

async function cleanup() {
  await stopStartedServices();
  if (isolatedMode) dropTestDatabase();
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(130);
});
process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(143);
});

try {
  if (buildClient) {
    console.log('Building client before local smoke tests...');
    runNpm(['--prefix', 'client', 'run', 'build'], { timeoutMs: 180000, label: 'client build' });
  }

  if (isolatedMode) {
    await configureIsolatedTarget();
    createTestDatabase();
  }

  await ensureApi();

  console.log('Ensuring demo prospecting data exists...');
  runNodeScript('scripts/seed-local-if-empty.mjs', [], {
    CRM_URL: apiBase,
    CRM_API_URL: apiBase,
    DATABASE_URL: databaseUrl,
  });

  const uiBase = await ensureUi();
  const smokeEnv = {
    CRM_API_URL: apiBase,
    CRM_URL: apiBase,
    CRM_UI_URL: uiBase,
    DATABASE_URL: databaseUrl,
  };

  console.log('');
  console.log('Running local smoke suite.');
  console.log(`Mode: ${isolatedMode ? 'isolated disposable database' : 'existing configured database'}`);
  console.log(`API:  ${apiBase}`);
  console.log(`UI:   ${uiBase}`);
  console.log(`DB:   ${redactDatabaseUrl(databaseUrl)}`);
  console.log('');

  runNodeScript('scripts/smoke-local-api.mjs', [], smokeEnv);
  runNodeScript('scripts/smoke-local-browser.mjs', [], smokeEnv);
  runNodeScript('scripts/smoke-sequence-workflow.mjs', [], smokeEnv);
  runNodeScript('scripts/smoke-audit-undo.mjs', [], smokeEnv);
  runNodeScript('scripts/smoke-backup-restore.mjs', [], smokeEnv);

  console.log('');
  console.log('Local smoke suite passed.');
} catch (err) {
  console.error('');
  console.error(`Local smoke suite failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
  process.exit(process.exitCode || 0);
}
