import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { createConnection } from 'net';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';

const apiBase = process.env.CRM_API_URL || 'http://localhost:3001';
const uiBase = process.env.CRM_UI_URL || 'http://localhost:5173';
const timeoutMs = Number(process.env.CRM_WORKFLOW_SMOKE_TIMEOUT_MS || 45000);

const headers = {
  'Content-Type': 'application/json',
  ...(process.env.API_KEY ? { 'X-Api-Key': process.env.API_KEY } : {}),
};

const failures = [];
const created = { companyId: null, sequenceId: null };

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(method, path, body, { expectOk = true } = {}) {
  const res = await fetch(`${apiBase}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (expectOk && !res.ok) {
    throw new Error(`${method} ${path} returned ${res.status}: ${text}`);
  }
  return { res, data };
}

async function get(path, options) {
  return request('GET', path, undefined, options);
}

async function post(path, body, options) {
  return request('POST', path, body, options);
}

async function del(path, options) {
  return request('DELETE', path, undefined, options);
}

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

function httpJson(url) {
  return fetch(url).then(async (res) => {
    const text = await res.text();
    if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text}`);
    return JSON.parse(text);
  });
}

async function waitForDevToolsPort(userDataDir, child) {
  const portFile = join(userDataDir, 'DevToolsActivePort');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Browser exited before DevTools became available with code ${child.exitCode}`);
    }
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
      if (port) return Number(port);
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for browser DevTools port');
}

async function waitForPageTarget(port, expectedUrl) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const targets = await httpJson(`http://127.0.0.1:${port}/json/list`);
    const target = targets.find((item) => item.type === 'page' && item.url?.startsWith(expectedUrl));
    if (target?.webSocketDebuggerUrl) return target;
    await delay(100);
  }
  throw new Error(`Timed out waiting for page target ${expectedUrl}`);
}

function encodeFrame(text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const mask = randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    masked[i] = payload[i] ^ mask[i % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

function decodeFrames(state, onText) {
  while (state.buffer.length >= 2) {
    const first = state.buffer[0];
    const second = state.buffer[1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (state.buffer.length < offset + 2) return;
      length = state.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (state.buffer.length < offset + 8) return;
      length = Number(state.buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    let mask;
    if (masked) {
      if (state.buffer.length < offset + 4) return;
      mask = state.buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (state.buffer.length < offset + length) return;
    let payload = state.buffer.subarray(offset, offset + length);
    state.buffer = state.buffer.subarray(offset + length);

    if (masked) {
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i += 1) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }

    if (opcode === 0x1) onText(payload.toString('utf8'));
    if (opcode === 0x8) state.closed = true;
    if (opcode === 0x9) state.socket.write(Buffer.from([0x8a, 0x00]));
  }
}

class CdpClient {
  constructor(socket, initialBuffer) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.state = { socket, buffer: initialBuffer || Buffer.alloc(0), closed: false };
    socket.on('data', (chunk) => {
      this.state.buffer = Buffer.concat([this.state.buffer, chunk]);
      decodeFrames(this.state, (text) => this.handleMessage(text));
    });
    socket.on('error', (err) => {
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
    });
    decodeFrames(this.state, (text) => this.handleMessage(text));
  }

  handleMessage(text) {
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
    }
  }

  call(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(encodeFrame(payload));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close() {
    this.socket.end();
  }
}

async function connectWebSocket(wsUrl) {
  const url = new URL(wsUrl);
  const key = randomBytes(16).toString('base64');
  const socket = createConnection(Number(url.port), url.hostname);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write([
    `GET ${url.pathname}${url.search} HTTP/1.1`,
    `Host: ${url.host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '\r\n',
  ].join('\r\n'));

  let buffer = Buffer.alloc(0);
  while (true) {
    const chunk = await new Promise((resolve, reject) => {
      socket.once('data', resolve);
      socket.once('error', reject);
    });
    buffer = Buffer.concat([buffer, chunk]);
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = buffer.subarray(0, headerEnd).toString('utf8');
    if (!header.includes(' 101 ')) throw new Error(`WebSocket upgrade failed: ${header}`);
    return new CdpClient(socket, buffer.subarray(headerEnd + 4));
  }
}

async function launchBrowser(browserBin, targetUrl) {
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
    ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-dev-shm-usage', '--no-sandbox'],
    ['--headless', '--disable-gpu', '--disable-extensions', '--disable-dev-shm-usage', '--no-sandbox'],
  ];
  const attempts = process.platform === 'win32'
    ? [legacyWindowsAttempt, ...modernAttempts]
    : [...modernAttempts, legacyWindowsAttempt];

  let lastError;
  for (const args of attempts) {
    const userDataDir = mkdtempSync(join(tmpdir(), 'hvac-crm-workflow-smoke-'));
    const child = spawn(browserBin, [
      ...args,
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1280,900',
      targetUrl,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    try {
      const port = await waitForDevToolsPort(userDataDir, child);
      const target = await waitForPageTarget(port, targetUrl);
      return {
        child,
        userDataDir,
        target,
        async cleanup() {
          child.kill();
          await Promise.race([
            new Promise((resolve) => child.once('exit', resolve)),
            delay(2000),
          ]);
          try {
            rmSync(userDataDir, { recursive: true, force: true });
          } catch {
            // Temporary browser profiles are best-effort cleanup on Windows.
          }
        },
      };
    } catch (err) {
      lastError = new Error(`${err.message}${stderr ? `\n${stderr.slice(-1000)}` : ''}`);
      child.kill();
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Try the next launch mode.
      }
    }
  }
  throw lastError || new Error('No browser launch mode worked');
}

async function evaluate(cdp, expression) {
  const result = await cdp.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const message = result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      JSON.stringify(result.exceptionDetails);
    throw new Error(message);
  }
  return result.result?.value;
}

async function waitForPage(cdp, expression, description) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await evaluate(cdp, `(() => { try { return Boolean(${expression}); } catch { return false; } })()`);
    if (ok) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function jsString(value) {
  return JSON.stringify(String(value));
}

async function seedWorkflowRecords() {
  const stamp = Date.now();
  const company = (await post('/companies', {
    name: `Workflow Smoke HVAC ${stamp}`,
    website: `https://workflow-smoke-${stamp}.example`,
    industry: 'HVAC',
    city: 'Lancaster',
    state: 'PA',
    employee_count: 72,
    ad_spend_range: '$10k-$25k',
    target_tier: 'tier_1',
    source: 'Workflow smoke',
    campaign: 'Sequence reply regression',
    buying_committee_status: 'mapped',
    next_step: 'Enroll owner in smoke sequence',
  })).data;
  created.companyId = company.id;

  const contacts = [];
  for (const contact of [
    {
      name: `Workflow Owner ${stamp}`,
      first_name: 'Workflow',
      last_name: 'Owner',
      title: 'Owner',
      email: `owner-${stamp}@workflow-smoke.example`,
      phone_direct: '+1 (484) 555-0601',
      contact_role: 'owner',
    },
    {
      name: `Workflow Marketing ${stamp}`,
      first_name: 'Workflow',
      last_name: 'Marketing',
      title: 'Marketing Manager',
      email: `marketing-${stamp}@workflow-smoke.example`,
      phone_direct: '+1 (484) 555-0602',
      contact_role: 'marketing',
    },
    {
      name: `Workflow Ops ${stamp}`,
      first_name: 'Workflow',
      last_name: 'Ops',
      title: 'Operations Manager',
      email: `ops-${stamp}@workflow-smoke.example`,
      phone_direct: '+1 (484) 555-0603',
      contact_role: 'ops',
    },
  ]) {
    contacts.push((await post('/contacts', {
      ...contact,
      company_id: company.id,
      owner: 'Workflow smoke',
      source: 'Workflow smoke',
    })).data);
  }

  const sequence = (await post('/sequences', {
    name: `Workflow Smoke Sequence ${stamp}`,
    active: true,
    description: 'Regression coverage for enroll/reply panel sync.',
    steps: [
      {
        day_offset: 0,
        kind: 'task',
        task_type: 'call',
        description: 'Workflow smoke call owner',
        priority: 'high',
      },
      {
        day_offset: 2,
        kind: 'task',
        task_type: 'linkedin',
        description: 'Workflow smoke connect with marketing',
        priority: 'medium',
      },
    ],
  })).data;
  created.sequenceId = sequence.id;

  return {
    company,
    owner: contacts.find((contact) => contact.contact_role === 'owner'),
    sequence,
  };
}

async function cleanupRecords() {
  if (created.sequenceId) await del(`/sequences/${created.sequenceId}`, { expectOk: false });
  if (created.companyId) await del(`/companies/${created.companyId}`, { expectOk: false });
}

async function smoke() {
  const browserBin = findBrowser();
  if (!browserBin) throw new Error('Could not find Edge, Chrome, or Chromium for workflow smoke.');

  const { company, owner, sequence } = await seedWorkflowRecords();
  const targetUrl = `${uiBase}/companies/${company.id}`;
  const browser = await launchBrowser(browserBin, targetUrl);
  let cdp;
  try {
    cdp = await connectWebSocket(browser.target.webSocketDebuggerUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');

    await waitForPage(
      cdp,
      `document.readyState === 'complete' && document.body?.innerText.includes(${jsString(company.name)})`,
      'company detail page to render',
    );

    await evaluate(cdp, `(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.textContent.trim() === '+ Enroll');
      if (!button) throw new Error('Enroll button not found');
      button.click();
      return true;
    })()`);

    await waitForPage(
      cdp,
      `document.body?.innerText.includes('Enroll ${company.name} in a sequence')`,
      'enrollment modal to open',
    );
    await waitForPage(
      cdp,
      `Array.from(document.querySelectorAll('select')).some((item) =>
        Array.from(item.options).some((option) => option.textContent.includes(${jsString(owner.email)}))
      )`,
      'enrollment modal contacts to load',
    );

    const defaultContact = await evaluate(cdp, `(() => {
      const select = Array.from(document.querySelectorAll('select'))
        .find((item) => Array.from(item.options).some((option) => option.textContent.includes(${jsString(owner.email)})));
      if (!select) throw new Error('Primary contact select not found');
      return select.options[select.selectedIndex]?.textContent.trim();
    })()`);
    assert(
      defaultContact?.includes(owner.email),
      `Enrollment should default to owner contact ${owner.email}, got ${defaultContact || 'nothing'}`,
    );

    await evaluate(cdp, `(() => {
      const select = Array.from(document.querySelectorAll('select'))
        .find((item) => Array.from(item.options).some((option) => option.value === ${jsString(sequence.id)}));
      if (!select) throw new Error('Sequence select not found');
      select.value = ${jsString(sequence.id)};
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.options[select.selectedIndex]?.textContent.trim();
    })()`);

    await evaluate(cdp, `(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.textContent.trim() === 'Enroll');
      if (!button) throw new Error('Modal Enroll button not found');
      button.click();
      return true;
    })()`);

    await waitForPage(
      cdp,
      `document.body?.innerText.includes('Tasks (2 open)') &&
       document.body?.innerText.includes('Workflow smoke call owner') &&
       document.body?.innerText.includes('Workflow smoke connect with marketing') &&
       document.body?.innerText.includes(${jsString(sequence.name)})`,
      'sequence enrollment tasks to appear without reload',
    );

    await evaluate(cdp, `(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.textContent.trim() === 'Mark replied');
      if (!button) throw new Error('Mark replied button not found');
      button.click();
      return true;
    })()`);

    await waitForPage(
      cdp,
      `document.body?.innerText.includes('Tasks (0 open)') &&
       document.body?.innerText.includes('No tasks yet.') &&
       Array.from(document.querySelectorAll('.enroll-card')).some((card) =>
         card.textContent.includes(${jsString(sequence.name)}) &&
         card.textContent.includes('replied') &&
         card.textContent.includes('2/2 steps')
       ) &&
       Array.from(document.querySelectorAll('.key-info-row')).some((row) =>
         row.querySelector('.key-info-label')?.textContent.trim() === 'Next step' &&
         row.querySelector('textarea')?.value === 'Review reply before next touch'
       )`,
      'reply state to update all visible panels without reload',
    );

    const full = (await get(`/companies/${company.id}/full`)).data;
    const fullOwner = full.contacts.find((contact) => contact.id === owner.id);
    const enrollments = (await get(`/sequences/enrollments/list?company_id=${company.id}`)).data;
    const enrollment = enrollments.find((item) => item.sequence_id === sequence.id);

    assert(full.replied === true, 'Company should be marked replied after Mark replied');
    assert(full.next_step === 'Review reply before next touch', `Company next_step should be reply review, got ${full.next_step}`);
    assert((full.tasks || []).length === 0, `Company should have 0 open tasks after reply, got ${(full.tasks || []).length}`);
    assert(fullOwner?.replied === true, 'Owner contact should be marked replied after Mark replied');
    assert(enrollment?.status === 'replied', `Enrollment status should be replied, got ${enrollment?.status || 'missing'}`);
    assert(enrollment?.completed === 2 && enrollment?.total === 2, 'Enrollment should show 2/2 completed steps after reply');
  } finally {
    cdp?.close();
    await browser.cleanup();
  }
}

try {
  await smoke();
} catch (err) {
  failures.push(err.message);
} finally {
  await cleanupRecords();
}

if (failures.length) {
  console.error('Sequence workflow smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(`API: ${apiBase}`);
  console.error(`UI: ${uiBase}`);
  process.exit(1);
}

console.log('Sequence workflow smoke passed.');
console.log(`API: ${apiBase}`);
console.log(`UI: ${uiBase}`);
