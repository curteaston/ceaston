import { existsSync } from 'fs';
import { delimiter, join } from 'path';

const isWindows = process.platform === 'win32';

export function normalizeHttpBase(value) {
  const url = new URL(value);
  return url.origin;
}

export async function servesAppShell(base) {
  try {
    const res = await fetch(`${normalizeHttpBase(base)}/companies/1`);
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('<div id="root"></div>');
  } catch {
    return false;
  }
}

export async function resolveUiBase({ apiBase, defaultUiBase } = {}) {
  if (process.env.CRM_UI_URL) return normalizeHttpBase(process.env.CRM_UI_URL);

  const preferred = normalizeHttpBase(defaultUiBase || `http://localhost:${process.env.LOCAL_CRM_UI_PORT || 5173}`);
  if (await servesAppShell(preferred)) return preferred;

  const apiOrigin = normalizeHttpBase(apiBase || process.env.CRM_API_URL || process.env.CRM_URL || 'http://localhost:3001');
  if (await servesAppShell(apiOrigin)) return apiOrigin;

  return preferred;
}

function findOnPath(names) {
  const pathValue = process.env.PATH || process.env.Path || '';
  const dirs = pathValue.split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function findChromiumBrowser() {
  const explicit = process.env.CRM_BROWSER_BIN;
  if (explicit && existsSync(explicit)) return explicit;

  const windowsCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const unixCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
  ];

  const candidates = isWindows ? windowsCandidates : unixCandidates;
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return findOnPath([
    'chrome.exe',
    'msedge.exe',
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
    'microsoft-edge-stable',
  ]);
}
