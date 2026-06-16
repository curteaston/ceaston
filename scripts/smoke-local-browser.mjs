import { execFile } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const uiBase = process.env.CRM_UI_URL || 'http://localhost:5173';
const targetUrl = process.env.CRM_BROWSER_SMOKE_URL || `${uiBase}/companies/1`;
const timeoutMs = Number(process.env.CRM_BROWSER_SMOKE_TIMEOUT_MS || 30000);

function findOnPath(names) {
  const pathDirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findBrowser() {
  const explicit = process.env.CRM_BROWSER_BIN;
  if (explicit && existsSync(explicit)) return explicit;

  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return findOnPath([
    'msedge.exe',
    'chrome.exe',
    'microsoft-edge',
    'microsoft-edge-stable',
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ]);
}

async function dumpDom(browserBin, args) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hvac-crm-browser-smoke-'));
  try {
    const { stdout } = await execFileAsync(browserBin, [
      ...args,
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1280,900',
      '--virtual-time-budget=10000',
      '--dump-dom',
      targetUrl,
    ], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

function assertText(dom, text, failures) {
  if (!dom.includes(text)) failures.push(`Rendered DOM missing "${text}"`);
}

const browserBin = findBrowser();
if (!browserBin) {
  console.error('Local browser smoke failed: could not find Edge, Chrome, or Chromium.');
  console.error('Set CRM_BROWSER_BIN to a Chromium-family browser executable and rerun.');
  process.exit(1);
}

const legacyWindowsAttempt = [
  '--headless=old',
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-accelerated-2d-canvas',
  '--disable-accelerated-video-decode',
  '--disable-extensions',
  '--no-sandbox',
];
const modernAttempts = [
  ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-dev-shm-usage'],
  ['--headless', '--disable-gpu', '--disable-extensions', '--disable-dev-shm-usage'],
];
const attempts = process.platform === 'win32'
  ? [legacyWindowsAttempt, ...modernAttempts]
  : [...modernAttempts, legacyWindowsAttempt];

let dom;
let lastError;
try {
  for (const args of attempts) {
    try {
      dom = await dumpDom(browserBin, args);
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!dom) {
    throw lastError || new Error('No browser attempt produced DOM output');
  }
} catch (err) {
  console.error('Local browser smoke failed: browser could not render the app.');
  console.error(err.message);
  process.exit(1);
}

const failures = [];
assertText(dom, 'Arctic Air Solutions', failures);
assertText(dom, 'Mike Reynolds', failures);
assertText(dom, 'Dana Ortiz', failures);
assertText(dom, 'Buying committee', failures);
assertText(dom, 'Arctic Air - PPC management', failures);
assertText(dom, 'Follow up call with Mike re: case studies', failures);

if (dom.includes('Company not found')) failures.push('Rendered DOM still shows "Company not found"');
if (dom.includes('API/client mismatch')) failures.push('Rendered DOM shows API/client mismatch warning');
if (dom.includes('Enter your password to continue')) {
  failures.push('Rendered DOM shows login screen. Set APP_PASSWORD off for local smoke, or add an authenticated smoke path.');
}

if (failures.length) {
  console.error('Local browser smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(`URL: ${targetUrl}`);
  console.error(`Browser: ${browserBin}`);
  process.exit(1);
}

console.log('Local browser smoke passed.');
console.log(`URL: ${targetUrl}`);
console.log(`Browser: ${browserBin}`);
