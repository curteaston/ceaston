import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { Field } from '../components/widgets.jsx';

function SyncEmailsButton() {
  const { notify } = useStore();
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/email/sync', { days: 7 });
      notify(`Synced ${result.synced} email${result.synced !== 1 ? 's' : ''} from last 7 days`);
    } catch (e) {
      notify('Sync failed: ' + (e.message || 'unknown error'), 'error');
    } finally { setSyncing(false); }
  };
  return (
    <button className="btn" onClick={sync} disabled={syncing}>
      {syncing ? 'Syncing…' : '🔄 Sync emails (last 7 days)'}
    </button>
  );
}

function SequenceSending() {
  const { run, notify } = useStore();
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ host: '', port: 587, secure: false, user: '', pass: '', from_name: '', from_email: '' });
  const [testTo, setTestTo] = useState('');

  const load = () => api.get('/sequences/smtp').then((d) => {
    setCfg(d);
    setForm((f) => ({ ...f, host: d.host, port: d.port, secure: d.secure, user: d.user, from_name: d.from_name, from_email: d.from_email, pass: '' }));
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = () =>
    run(async () => { await api.put('/sequences/smtp', form); load(); }, 'Sending domain saved');

  const test = () =>
    run(async () => {
      const r = await api.post('/sequences/smtp/test', testTo ? { to: testTo } : {});
      notify(r.sent ? `Test email sent to ${testTo}` : 'Connection verified ✓');
    }, null);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="card">
      <div className="card-head">
        <h3>Sequence sending domain</h3>
        {cfg?.configured && <span className="chip stage stage-won">Configured</span>}
      </div>
      <p className="small">
        Auto-email steps in sequences send through <b>this separate mailbox</b> — never your primary Office 365 account.
        Use a dedicated cold-outreach domain (its own Google Workspace / Microsoft 365 mailbox, or an SMTP relay like
        Amazon SES, SMTP2GO, Postmark, or Mailgun) so your primary domain's reputation stays clean.
      </p>
      <div className="form-grid">
        <Field label="SMTP host *"><input value={form.host} onChange={upd('host')} placeholder="smtp.youroutreachdomain.com" /></Field>
        <Field label="Port"><input type="number" value={form.port} onChange={upd('port')} placeholder="587" /></Field>
        <Field label="Username"><input value={form.user} onChange={upd('user')} placeholder="outreach@youroutreachdomain.com" /></Field>
        <Field label={cfg?.has_password ? 'Password (leave blank to keep)' : 'Password'}>
          <input type="password" value={form.pass} onChange={upd('pass')} placeholder={cfg?.has_password ? '••••••••' : ''} />
        </Field>
        <Field label="From name"><input value={form.from_name} onChange={upd('from_name')} placeholder="Curt @ Outreach" /></Field>
        <Field label="From email *"><input value={form.from_email} onChange={upd('from_email')} placeholder="outreach@youroutreachdomain.com" /></Field>
        <label className="checkbox-inline" style={{ gridColumn: '1 / -1' }}>
          <input type="checkbox" checked={form.secure} onChange={upd('secure')} /> Use TLS/SSL on connect (port 465)
        </label>
      </div>
      <div className="row gap pad-top">
        <button className="btn primary" onClick={save} disabled={!form.host || !form.from_email}>Save</button>
        <input placeholder="you@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} style={{ width: 200 }} />
        <button className="btn" onClick={test} disabled={!cfg?.configured}>Test connection / send</button>
      </div>
    </div>
  );
}

function Webhooks() {
  const { run, notify } = useStore();
  const [hooks, setHooks] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ url: '', secret: '', events: [] });

  const load = () => api.get('/webhooks').then(setHooks).catch(() => {});
  useEffect(() => {
    load();
    api.get('/webhooks/events').then(setEventTypes).catch(() => {});
  }, []);

  const toggleEvent = (ev) =>
    setForm((f) => ({ ...f, events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev] }));

  const create = () =>
    run(async () => {
      await api.post('/webhooks', form);
      setForm({ url: '', secret: '', events: [] });
      setAdding(false);
      load();
    }, 'Webhook added');

  const del = (w) =>
    run(async () => { await api.del(`/webhooks/${w.id}`); load(); }, 'Webhook removed');
  const toggle = (w) =>
    run(async () => { await api.put(`/webhooks/${w.id}`, { active: !w.active }); load(); }, null);
  const test = (w) =>
    run(async () => {
      const r = await api.post(`/webhooks/${w.id}/test`);
      notify(r.ok ? `Test delivered (HTTP ${r.status})` : `Test failed: ${r.error || r.status}`, !r.ok);
      load();
    }, null);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Outbound webhooks (n8n)</h3>
        <button className="btn small" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Add webhook'}</button>
      </div>
      <p className="small">
        Fire a JSON payload to an n8n (or any) URL when things happen in the CRM — automate follow-on actions like
        Slack pings, invoices, or handoffs. If you set a secret, each delivery is signed with an
        <code> X-CRM-Signature: sha256=…</code> HMAC header so n8n can verify authenticity.
      </p>

      {adding && (
        <div className="outline-card">
          <Field label="Endpoint URL"><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://your-n8n/webhook/abc123" /></Field>
          <Field label="Signing secret (optional)"><input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="shared secret for HMAC" /></Field>
          <div className="field-label pad-top">Events</div>
          <div className="webhook-events">
            {eventTypes.map((ev) => (
              <label key={ev} className="checkbox-inline">
                <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} /> {ev}
              </label>
            ))}
          </div>
          <div className="form-actions pad-top">
            <button className="btn primary" disabled={!form.url || form.events.length === 0} onClick={create}>Add webhook</button>
          </div>
        </div>
      )}

      {hooks.length === 0 && !adding && <p className="muted small">No webhooks yet.</p>}
      {hooks.map((w) => (
        <div key={w.id} className="webhook-row">
          <div className="grow">
            <div className="row gap">
              <b className="webhook-url">{w.url}</b>
              {!w.active && <span className="chip">paused</span>}
            </div>
            <div className="muted small">{w.events.join(', ')}</div>
            {w.last_status && <div className="muted small">Last: {w.last_status}</div>}
          </div>
          <div className="row gap">
            <button className="btn small" onClick={() => test(w)}>Test</button>
            <button className="btn small" onClick={() => toggle(w)}>{w.active ? 'Pause' : 'Resume'}</button>
            <button className="btn small danger" onClick={() => del(w)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Settings() {
  const { run, notify } = useStore();
  const [ms, setMs] = useState(null);
  const [name, setName] = useState(() => localStorage.getItem('crm_display_name') || 'Curt');

  const loadStatus = () => api.get('/integrations/microsoft/status').then(setMs).catch(() => {});
  useEffect(() => {
    loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get('ms_connected')) notify('Office 365 connected 🎉');
    if (params.get('ms_error')) notify(`Office 365: ${params.get('ms_error')}`, true);
    if (params.get('ms_connected') || params.get('ms_error')) {
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const saveName = () => {
    localStorage.setItem('crm_display_name', name.trim() || 'Curt');
    notify('Display name saved — used for greetings and "My companies/contacts" tabs');
  };

  const disconnect = () =>
    run(async () => {
      await api.post('/integrations/microsoft/disconnect');
      loadStatus();
    }, 'Office 365 disconnected');

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-head"><h1>Settings</h1></div>

      <div className="card">
        <h3>Profile</h3>
        <div className="row gap">
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220 }} />
          <button className="btn primary" onClick={saveName}>Save</button>
        </div>
        <p className="muted small">Used in the Home greeting and to match the "My companies" / "My contacts" tabs against record owners.</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Office 365 (email & calendar)</h3>
          {ms?.connected && <span className="chip stage stage-won">Connected</span>}
        </div>

        {!ms && <p className="muted">Checking status…</p>}

        {ms && !ms.configured && (
          <>
            <p>
              Connect Office 365 to send emails directly from the CRM (logged to the timeline automatically)
              and see today's calendar events on your Home screen.
            </p>
            <p><b>One-time server setup</b> — register an app in Microsoft Entra (Azure AD):</p>
            <ol className="small">
              <li>Go to <a href="https://entra.microsoft.com" target="_blank" rel="noreferrer">entra.microsoft.com</a> → App registrations → New registration.</li>
              <li>Supported account types: <i>Accounts in any organizational directory and personal Microsoft accounts</i>.</li>
              <li>Redirect URI (type "Web"): <code>{ms.redirect_uri}</code></li>
              <li>Under <i>Certificates &amp; secrets</i>, create a client secret.</li>
              <li>Under <i>API permissions</i>, add delegated Microsoft Graph permissions: <code>Mail.ReadWrite</code>, <code>Mail.Send</code>, <code>Calendars.ReadWrite</code>, <code>User.Read</code>, <code>offline_access</code>.</li>
              <li>Set these environment variables on the CRM server and restart it:
                <pre>MS_CLIENT_ID=…{'\n'}MS_CLIENT_SECRET=…{'\n'}APP_BASE_URL=https://your-crm-host</pre>
              </li>
            </ol>
            <p className="muted small">Once configured, a Connect button appears here.</p>
          </>
        )}

        {ms?.configured && !ms.connected && (
          <>
            <p>Sign in with your Microsoft account to send email from the CRM and show your calendar on Home.</p>
            <a className="btn primary" href="/api/integrations/microsoft/connect">Connect Office 365</a>
          </>
        )}

        {ms?.connected && (
          <>
            <p>Connected as <b>{ms.account}</b>. Emails sent from the CRM use this mailbox and are logged to the company timeline. Meetings created in the CRM sync to your Outlook calendar.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <SyncEmailsButton />
              <button className="btn danger" onClick={disconnect}>Disconnect</button>
            </div>
          </>
        )}
      </div>

      <SequenceSending />

      <Webhooks />

      <div className="card">
        <h3>Access &amp; security</h3>
        <p className="small">
          Sign-in is controlled by server environment variables (no passwords are stored in the app):
        </p>
        <ul className="small">
          <li><b>Web login</b> — set <code>APP_PASSWORD</code> on the server to require a password to open the CRM. Leave unset for an open instance (fine on a private/local URL).</li>
          <li><b>Automation key</b> — set <code>API_KEY</code> so n8n can call the API with an <code>X-Api-Key</code> header. API-key calls skip the web login.</li>
        </ul>
        <p className="muted small">Set both before hosting the CRM publicly. The mic and remote login also require HTTPS.</p>
      </div>

      <div className="card">
        <h3>AI summaries</h3>
        <p className="small">
          The ✨ Summary action on company records is powered by Claude when the server has an
          <code> ANTHROPIC_API_KEY</code> environment variable set (get one at{' '}
          <a href="https://platform.claude.com" target="_blank" rel="noreferrer">platform.claude.com</a>).
          Without a key, a built-in rule-based summary is used instead.
        </p>
      </div>
    </div>
  );
}
