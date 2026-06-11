/* Power Dialer — frontend logic
 * Depends on: Twilio Voice JS SDK v2 (twilio.js), Bootstrap 5
 */

// ── State ─────────────────────────────────────────────────────────────────────
let twilioDevice    = null;
let activeCall      = null;
let currentContact  = null;
let activePhone     = null;
let allContacts     = [];
let callSeconds     = 0;
let callTimerHandle = null;
let isMuted         = false;
let speechRec       = null;
let isListening     = false;

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();  // redirect to /login.html if not signed in
  initSpeechRecognition();
  loadContacts();
  initTwilio();
  loadCallHistory();
});

async function checkAuth() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) { location.href = '/login.html'; return; }
  const { user, tenant } = await res.json();
  const emailEl = document.getElementById('nav-email');
  if (emailEl) { emailEl.textContent = user.email; emailEl.classList.remove('d-none'); }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}

// Redirect to login on any 401
function handle401(res) {
  if (res.status === 401) { location.href = '/login.html'; return true; }
  return false;
}

// ── Twilio Device ─────────────────────────────────────────────────────────────
async function initTwilio() {
  try {
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: 'power-dialer' })
    });

    if (!res.ok) {
      setDeviceStatus('Twilio not configured', 'secondary');
      return;
    }

    const { token } = await res.json();

    twilioDevice = new Twilio.Device(token, {
      logLevel: 'error',
      codecPreferences: ['opus', 'pcmu']
    });

    twilioDevice.on('ready',    () => setDeviceStatus('Ready', 'success'));
    twilioDevice.on('error',    (e) => { console.error('[Twilio]', e); setDeviceStatus('Error', 'danger'); });
    twilioDevice.on('incoming', onIncomingCall);

    await twilioDevice.register();

  } catch (err) {
    console.error('[Twilio init]', err);
    setDeviceStatus('Twilio not configured', 'secondary');
  }
}

function setDeviceStatus(label, color) {
  const el = document.getElementById('device-status');
  el.textContent = label;
  el.className = `badge bg-${color}`;
}

// ── Make a call ───────────────────────────────────────────────────────────────
async function initiateCall() {
  if (!twilioDevice) { alert('Twilio is not configured. See .env.example and server setup.'); return; }
  if (activeCall)    { alert('A call is already in progress.'); return; }
  if (!activePhone)  { alert('No phone number selected.'); return; }

  showCallingState();

  try {
    activeCall = await twilioDevice.connect({ params: { To: activePhone } });

    activeCall.on('ringing',    () => setCallBadge('Ringing…',  'warning'));
    activeCall.on('accept',     () => { setCallBadge('Connected', 'success'); startTimer(); });
    activeCall.on('disconnect', onCallEnded);
    activeCall.on('cancel',     onCallEnded);
    activeCall.on('error',      (e) => { console.error('[Call]', e); onCallEnded(); });

  } catch (err) {
    console.error('[initiateCall]', err);
    showReadyState();
  }
}

function hangUp() {
  if (activeCall) activeCall.disconnect();
}

function toggleMute() {
  if (!activeCall) return;
  isMuted = !isMuted;
  activeCall.mute(isMuted);

  const btn = document.getElementById('btn-mute');
  btn.querySelector('i').className = isMuted ? 'bi bi-mic-mute-fill' : 'bi bi-mic-fill';
  btn.classList.toggle('active', isMuted);
}

function sendDTMF(digit) {
  if (activeCall) activeCall.sendDigits(digit);
}

function toggleKeypad() {
  document.getElementById('dtmf-keypad').classList.toggle('d-none');
}

function onIncomingCall(call) {
  const from = call.parameters.From || 'Unknown';
  if (!confirm(`Incoming call from ${from}. Answer?`)) { call.reject(); return; }

  call.accept();
  activeCall = call;
  activePhone = from;
  currentContact = { firstName: from, lastName: '', phone: from, id: null };

  showCallingState(true);
  startTimer();
  setCallBadge('Connected', 'success');
  call.on('disconnect', onCallEnded);
}

async function onCallEnded() {
  stopTimer();

  // Save call to DB
  let savedCallId = null;
  if (currentContact) {
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId:    currentContact.id || null,
          contactName:  contactDisplayName(currentContact),
          phone:        activePhone || '',
          durationSecs: callSeconds,
          outcome:      document.getElementById('call-outcome').value || null,
          notes:        document.getElementById('call-notes').value   || null
        })
      });
      if (handle401(res)) return;
      const data = await res.json();
      savedCallId = data.id;
      lastSavedCallId = savedCallId;
    } catch (err) {
      console.error('[save call]', err);
    }

    pushHistory({
      id:     savedCallId,
      name:   contactDisplayName(currentContact),
      number: activePhone || '',
      secs:   callSeconds,
      at:     new Date()
    });
  }

  activeCall = null;
  isMuted    = false;

  const muteBtn = document.getElementById('btn-mute');
  muteBtn.querySelector('i').className = 'bi bi-mic-fill';
  muteBtn.classList.remove('active');

  currentContact?.id ? showReadyState() : showIdleState();
}

// ── Manual dial ───────────────────────────────────────────────────────────────
async function manualDial() {
  const input  = document.getElementById('manual-number');
  const number = input.value.trim();
  if (!number) return;

  currentContact = { firstName: number, lastName: '', phone: number, id: null };
  activePhone    = number;

  document.getElementById('contact-initials').textContent = '#';
  document.getElementById('contact-name').textContent     = number;
  document.getElementById('contact-company').textContent  = '';
  document.getElementById('phone-numbers').innerHTML      = '';
  showReadyState();
  await initiateCall();
  input.value = '';
}

// ── Contacts ──────────────────────────────────────────────────────────────────
async function loadContacts() {
  const list = document.getElementById('contact-list');
  list.innerHTML = '<div class="loading-msg"><div class="spinner-border spinner-border-sm me-2"></div>Loading…</div>';

  try {
    const res = await fetch('/api/contacts?limit=200');
    if (handle401(res)) return;
    const data = await res.json();
    allContacts = data.contacts || [];
    document.getElementById('contact-count').textContent = allContacts.length;
    renderContactList(allContacts);
  } catch (err) {
    list.innerHTML = '<div class="text-center text-muted py-4 small px-3">Could not load contacts.<br><a href="/setup.html" class="text-accent">Check setup</a></div>';
  }
}

function renderContactList(contacts) {
  const list = document.getElementById('contact-list');

  if (!contacts.length) {
    list.innerHTML = '<div class="text-center text-muted py-4 small">No contacts found</div>';
    return;
  }

  list.innerHTML = contacts.map(c => {
    const name    = contactDisplayName(c);
    const phone   = c.phone || '';
    const initials = getInitials(name);
    return `
      <div class="contact-item" data-id="${c.id}" onclick="selectContact('${c.id}')">
        <div class="mini-avatar">${initials}</div>
        <div style="overflow:hidden">
          <div class="ci-name">${esc(name)}</div>
          <div class="ci-phone">${esc(phone) || '<span style="opacity:.5">No phone</span>'}</div>
        </div>
      </div>`;
  }).join('');
}

function filterContacts(q) {
  const lq = q.toLowerCase();
  renderContactList(
    allContacts.filter(c => {
      const name  = contactDisplayName(c).toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      return name.includes(lq) || phone.includes(lq) || email.includes(lq);
    })
  );
}

function selectContact(id) {
  if (activeCall) return;

  const c = allContacts.find(x => x.id === id);
  if (!c) return;

  currentContact = c;

  document.querySelectorAll('.contact-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id));

  const name = contactDisplayName(c);
  document.getElementById('contact-initials').textContent = getInitials(name);
  document.getElementById('contact-name').textContent     = name;
  document.getElementById('contact-company').textContent  = c.companyName || c.company || '';
  renderPhoneNumbers(c);
  showReadyState();
}

function renderPhoneNumbers(c) {
  const phones = [
    c.phone      && { label: 'Mobile', num: c.phone },
    c.homePhone  && { label: 'Home',   num: c.homePhone },
    c.workPhone  && { label: 'Work',   num: c.workPhone }
  ].filter(Boolean);

  const callBtn = document.getElementById('btn-call');

  if (!phones.length) {
    document.getElementById('phone-numbers').innerHTML =
      '<p class="text-muted small mb-0">No phone number on file</p>';
    callBtn.disabled = true;
    activePhone = null;
    return;
  }

  activePhone = phones[0].num;
  callBtn.disabled = false;

  document.getElementById('phone-numbers').innerHTML = phones.map((p, i) => `
    <div class="phone-item ${i === 0 ? 'selected' : ''}"
         onclick="pickPhone(event, '${esc(p.num)}')">
      <span class="phone-label">${p.label}</span>
      <span class="phone-num">${esc(fmtPhone(p.num))}</span>
      <i class="bi bi-telephone-fill phone-icon"></i>
    </div>`).join('');
}

function pickPhone(evt, num) {
  activePhone = num;
  document.querySelectorAll('.phone-item').forEach(el => el.classList.remove('selected'));
  evt.currentTarget.classList.add('selected');
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  callSeconds = 0;
  const el = document.getElementById('call-timer');
  el.classList.remove('d-none');
  callTimerHandle = setInterval(() => {
    callSeconds++;
    el.textContent = fmtDuration(callSeconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(callTimerHandle);
  callTimerHandle = null;
}

// ── Notes → GoHighLevel ───────────────────────────────────────────────────────
// lastSavedCallId is set in onCallEnded when the call record is saved to DB
let lastSavedCallId = null;

async function logToGHL() {
  if (!currentContact?.id) {
    alert('No GoHighLevel contact is selected. Only GHL contacts can be logged.');
    return;
  }

  const notes   = document.getElementById('call-notes').value.trim();
  const outcome = document.getElementById('call-outcome').value;
  const btn     = document.getElementById('btn-log');

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-border spinner-border-sm me-1"></div>Logging…';

  try {
    const res = await fetch('/api/calls/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId:    lastSavedCallId,
        contactId: currentContact.id,
        notes,
        outcome,
        duration: callSeconds
      })
    });

    if (handle401(res)) return;
    if (!res.ok) throw new Error((await res.json()).error);

    btn.className = 'btn btn-success btn-sm w-100 mb-2';
    btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Logged!';
    setTimeout(resetLogBtn, 2200);

  } catch (err) {
    console.error('[logToGHL]', err);
    alert('Failed to log call to GoHighLevel. Check your setup page.');
    resetLogBtn();
  }
}

function resetLogBtn() {
  const btn = document.getElementById('btn-log');
  btn.className = 'btn btn-primary btn-sm w-100 mb-2';
  btn.innerHTML = '<i class="bi bi-cloud-upload me-1"></i>Log to GoHighLevel';
  btn.disabled  = false;
}

function clearNotes() {
  document.getElementById('call-notes').value   = '';
  document.getElementById('call-outcome').value = '';
}

// ── Speech-to-text ────────────────────────────────────────────────────────────
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    const btn = document.getElementById('btn-stt');
    btn.disabled = true;
    btn.title = 'Speech recognition requires Chrome or Edge';
    return;
  }

  speechRec = new SR();
  speechRec.continuous     = true;
  speechRec.interimResults = false;
  speechRec.lang           = 'en-US';

  speechRec.onresult = (evt) => {
    const ta = document.getElementById('call-notes');
    for (let i = evt.resultIndex; i < evt.results.length; i++) {
      if (evt.results[i].isFinal) {
        const text = evt.results[i][0].transcript.trim();
        ta.value += (ta.value ? ' ' : '') + text;
      }
    }
  };

  speechRec.onerror = (e) => {
    if (e.error !== 'no-speech') { console.warn('[STT]', e.error); stopSpeechToText(); }
  };

  // Auto-restart while still toggled on (browser stops after ~60 s of silence)
  speechRec.onend = () => { if (isListening) speechRec.start(); };
}

function toggleSpeechToText() {
  isListening ? stopSpeechToText() : startSpeechToText();
}

function startSpeechToText() {
  if (!speechRec) return;
  isListening = true;
  speechRec.start();
  document.getElementById('stt-indicator').classList.remove('d-none');
  const btn = document.getElementById('btn-stt');
  btn.innerHTML = '<i class="bi bi-mic-fill"></i>';
  btn.classList.add('active');
}

function stopSpeechToText() {
  if (!speechRec) return;
  isListening = false;
  speechRec.stop();
  document.getElementById('stt-indicator').classList.add('d-none');
  const btn = document.getElementById('btn-stt');
  btn.innerHTML = '<i class="bi bi-mic"></i>';
  btn.classList.remove('active');
}

// ── Call history ──────────────────────────────────────────────────────────────
function pushHistory(entry) {
  const container = document.getElementById('call-history');
  const placeholder = container.querySelector('.text-muted');
  if (placeholder) placeholder.remove();

  const el = document.createElement('div');
  el.className = 'hist-item';
  el.innerHTML = `
    <div class="hist-name">${esc(entry.name || entry.number)}</div>
    <div class="hist-meta">${fmtDuration(entry.secs)} &bull; ${entry.at.toLocaleTimeString()}</div>`;
  container.prepend(el);
}

// Load persistent call history from DB on page start
async function loadCallHistory() {
  try {
    const res = await fetch('/api/calls');
    if (handle401(res)) return;
    const data = await res.json();
    const container = document.getElementById('call-history');
    const calls = data.calls || [];
    if (!calls.length) return;

    container.innerHTML = '';
    calls.forEach(c => {
      const el = document.createElement('div');
      el.className = 'hist-item';
      el.innerHTML = `
        <div class="hist-name">${esc(c.contact_name || c.phone || 'Unknown')}</div>
        <div class="hist-meta">${fmtDuration(c.duration_secs)} &bull; ${new Date(c.created_at + 'Z').toLocaleDateString()} ${c.ghl_logged ? '&bull; <span style="color:#22c55e">GHL</span>' : ''}</div>`;
      container.appendChild(el);
    });
  } catch (err) {
    console.warn('[loadCallHistory]', err);
  }
}

// ── UI state helpers ──────────────────────────────────────────────────────────
function showIdleState() {
  show('state-idle'); hide('state-ready'); hide('state-calling');
}
function showReadyState() {
  hide('state-idle'); show('state-ready'); hide('state-calling');
}
function showCallingState(incoming = false) {
  hide('state-idle'); hide('state-ready'); show('state-calling');

  const name = contactDisplayName(currentContact || {});
  document.getElementById('calling-initials').textContent = getInitials(name) || '?';
  document.getElementById('calling-name').textContent     = name || '—';
  document.getElementById('calling-number').textContent   = fmtPhone(activePhone || '');
  document.getElementById('call-timer').classList.add('d-none');
  setCallBadge(incoming ? 'Incoming' : 'Dialing…', 'warning');
}

function setCallBadge(label, color) {
  const el = document.getElementById('call-status-badge');
  el.textContent = label;
  el.className   = `badge bg-${color} mb-2`;
}

function show(id) { document.getElementById(id).classList.remove('d-none'); }
function hide(id) { document.getElementById(id).classList.add('d-none'); }

// ── Utilities ─────────────────────────────────────────────────────────────────
function contactDisplayName(c) {
  return (`${c.firstName || ''} ${c.lastName || ''}`).trim() || c.email || c.phone || 'Unknown';
}

function getInitials(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function fmtPhone(n) {
  const d = (n || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return n || '';
}

function fmtDuration(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
