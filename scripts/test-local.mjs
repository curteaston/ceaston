import { spawn, spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { normalizeHttpBase, resolveUiBase, servesAppShell } from './local-smoke-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

const apiBase = normalizeHttpBase(process.env.CRM_API_URL || process.env.CRM_URL || `http://localhost:${process.env.LOCAL_CRM_API_PORT || 3001}`);
const apiPort = new URL(apiBase).port || (apiBase.startsWith('https:') ? '443' : '80');
const databaseUrl = process.env.DATABASE_URL || `postgres://${process.env.LOCAL_CRM_DBUSER || 'crm'}@127.0.0.1:${process.env.LOCAL_CRM_PGPORT || '55432'}/${process.env.LOCAL_CRM_DB || 'hvac_crm'}`;
const buildClient = process.env.LOCAL_CRM_TEST_BUILD !== '0';

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
  if (result.status === 0) return;
  const detail = result.error?.message || `exit code ${result.status}`;
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
  console.log(`API is not running at ${apiBase}; starting single-port local API for tests.`);
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

function stopStartedServices() {
  shuttingDown = true;
  if (!startedApi || startedApi.exitCode !== null || startedApi.signalCode) return;
  if (isWindows) {
    spawnSync('taskkill', ['/PID', String(startedApi.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  } else {
    startedApi.kill('SIGTERM');
  }
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
  if (await apiHealthy()) {
    console.log(`Using running API at ${apiBase}.`);
    return;
  }
  startApi();
  await waitForApi();
}

async function ensureUi() {
  const uiBase = await resolveUiBase({ apiBase });
  if (!(await servesAppShell(uiBase))) {
    throw new Error(`Client shell was not reachable at ${uiBase}. Run npm run dev:local, npm run start:local, or check the API logs.`);
  }
  return uiBase;
}

process.on('SIGINT', () => {
  stopStartedServices();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopStartedServices();
  process.exit(143);
});

try {
  if (buildClient) {
    console.log('Building client before local smoke tests...');
    runNpm(['--prefix', 'client', 'run', 'build'], { timeoutMs: 180000, label: 'client build' });
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
  console.log(`API: ${apiBase}`);
  console.log(`UI:  ${uiBase}`);
  console.log('');

  runNodeScript('scripts/smoke-local-api.mjs', [], smokeEnv);
  runNodeScript('scripts/smoke-local-browser.mjs', [], smokeEnv);
  runNodeScript('scripts/smoke-sequence-workflow.mjs', [], smokeEnv);
  runNodeScript('scripts/smoke-backup-restore.mjs', [], smokeEnv);

  console.log('');
  console.log('Local smoke suite passed.');
} catch (err) {
  console.error('');
  console.error(`Local smoke suite failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  stopStartedServices();
}
