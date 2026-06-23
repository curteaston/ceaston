import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { Field } from '../components/widgets.jsx';
import { downloadBackupSnapshot } from '../dataSafety.js';

const TEMPLATE_CATEGORIES = ['General', 'Intro', 'Follow-up', 'Proposal', 'Re-engagement', 'Other'];

function TemplateForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    category: initial?.category || 'General',
    subject: initial?.subject || '',
    body: initial?.body || '',
  });
  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="outline-card" style={{ marginTop: 8 }}>
      <div className="form-grid">
        <Field label="Name *">
          <input value={form.name} onChange={upd('name')} placeholder="e.g. Initial outreach" />
        </Field>
        <Field label="Category">
          <input
            value={form.category}
            onChange={upd('category')}
            placeholder="General"
            list="template-categories"
          />
          <datalist id="template-categories">
            {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label="Subject" style={{ gridColumn: '1 / -1' }}>
          <input value={form.subject} onChange={upd('subject')} placeholder="Email subject line" style={{ width: '100%' }} />
        </Field>
        <Field label="Body" style={{ gridColumn: '1 / -1' }}>
          <textarea
            value={form.body}
            onChange={upd('body')}
            rows={8}
            placeholder="Write your template…"
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div className="muted small" style={{ marginTop: 4 }}>
            Use <code>{'{{contact_name}}'}</code>, <code>{'{{company_name}}'}</code>, <code>{'{{sender_name}}'}</code> for personalization
          </div>
        </Field>
      </div>
      <div className="row gap pad-top">
        <button className="btn primary" onClick={() => onSave(form)} disabled={!form.name.trim()}>Save</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EmailTemplates() {
  const { run } = useStore();
  const [templates, setTemplates] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // template id

  const load = () => api.get('/email-templates').then(setTemplates).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = (form) =>
    run(async () => {
      await api.post('/email-templates', form);
      setAdding(false);
      load();
    }, 'Template created');

  const update = (id, form) =>
    run(async () => {
      await api.patch(`/email-templates/${id}`, form);
      setEditing(null);
      load();
    }, 'Template updated');

  const del = (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    run(async () => { await api.del(`/email-templates/${t.id}`); load(); }, 'Template deleted');
  };

  // Group by category
  const grouped = templates.reduce((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="card">
      <div className="card-head">
        <h3>Email templates</h3>
        <button className="btn small" onClick={() => { setAdding(!adding); setEditing(null); }}>
          {adding ? 'Cancel' : '+ New template'}
        </button>
      </div>
      <p className="small">
        Reusable email templates for faster outreach. Use variables like <code>{'{{contact_name}}'}</code> that are
        substituted when you insert a template in the email composer.
      </p>

      {adding && <TemplateForm onSave={create} onCancel={() => setAdding(false)} />}

      {templates.length === 0 && !adding && <p className="muted small">No templates yet — click "+ New template" to get started.</p>}

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} style={{ marginTop: 16 }}>
          <div className="muted small" style={{ fontWeight: 600, marginBottom: 4 }}>{category}</div>
          {items.map((t) => (
            <div key={t.id}>
              {editing === t.id ? (
                <TemplateForm
                  initial={t}
                  onSave={(form) => update(t.id, form)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="webhook-row">
                  <div className="grow">
                    <div className="row gap">
                      <b>{t.name}</b>
                      <span className="chip">{t.category}</span>
                    </div>
                    {t.subject && <div className="muted small">Subject: {t.subject}</div>}
                  </div>
                  <div className="row gap">
                    <button className="btn small" onClick={() => { setEditing(t.id); setAdding(false); }}>Edit</button>
                    <button className="btn small danger" onClick={() => del(t)}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

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

function TwilioDialer() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get('/dialer/status')
      .then(setStatus)
      .catch(() => setStatus({ error: true, configured: false }));
  }, []);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Twilio click-to-dial</h3>
        {status?.configured ? <span className="chip stage stage-won">Configured</span> : <span className="chip">Not configured</span>}
      </div>
      <p className="small">
        Click-to-dial uses Twilio Voice in the browser: the CRM asks for microphone permission and places the call
        from this tab using your Twilio number as caller ID. Suppressed, do-not-contact, not-interested, bad-fit,
        and archived records are blocked before dialing.
      </p>
      {!status && <p className="muted small">Checking Twilio status...</p>}
      {status?.configured && (
        <p className="muted small">
          From {status.from_number}. Browser calling requires HTTPS, or localhost during local development.
        </p>
      )}
      {status && !status.configured && (
        <>
          <p className="small">
            Add these server values to <code>.local/local.env</code> for local development or to the hosting
            environment for production, then restart the CRM. Your TwiML App voice request URL should be
            <code> https://your-crm-host/api/dialer/twiml</code>.
          </p>
          <pre>{`TWILIO_ACCOUNT_SID=AC...
TWILIO_API_KEY_SID=SK...
TWILIO_API_KEY_SECRET=...
TWILIO_TWIML_APP_SID=AP...
TWILIO_FROM_NUMBER=+15551234567
`}</pre>
          {status.missing_env?.length > 0 && (
            <p className="muted small">Missing: <code>{status.missing_env.join(', ')}</code></p>
          )}
        </>
      )}
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

function DataSafety() {
  const { notify } = useStore();
  const [exporting, setExporting] = useState(false);

  const downloadBackup = async () => {
    setExporting(true);
    try {
      const snapshot = await downloadBackupSnapshot();
      notify(`Backup exported: ${snapshot.counts.companies} companies, ${snapshot.counts.contacts} contacts`);
    } catch (e) {
      notify('Backup failed: ' + (e.message || 'unknown error'), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>Data safety</h3>
        <button className="btn small" onClick={downloadBackup} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Download backup'}
        </button>
      </div>
      <p className="small">
        Exports companies, contacts, deals, tasks, notes, activities, sequences, tags, saved views, and templates.
        Integration credentials and webhook secrets are excluded.
      </p>
    </div>
  );
}

function MicrosoftStatusBadge({ ms }) {
  if (!ms) return null;
  if (ms.error) return null;
  if (ms.connected) return <span className="chip stage stage-won">Connected</span>;
  if (!ms.configured && ms.token_stored) return <span className="chip">Server config missing</span>;
  if (!ms.configured) return <span className="chip">Not configured</span>;
  return <span className="chip">Reconnect needed</span>;
}

function MicrosoftConfigHelp({ ms }) {
  const missing = ms?.missing_env || ['MS_CLIENT_ID', 'MS_CLIENT_SECRET'];

  return (
    <>
      <p>
        Connect Office 365 to send one-off emails from the CRM, log them to the timeline,
        and show calendar events on Home.
      </p>
      {ms?.token_stored && (
        <div className="outline-card">
          <b>Saved Microsoft token found.</b>
          <p className="small">
            The CRM still has a Microsoft sign-in token in this database, but the server restarted without
            the Microsoft app credentials. Put the missing values back, restart, and the connection may recover
            without a fresh sign-in.
          </p>
        </div>
      )}
      <p><b>Missing server values:</b> <code>{missing.join(', ')}</code></p>
      <p className="small">
        For local development, copy <code>local.env.example</code> to <code>{ms?.local_env_hint || '.local/local.env'}</code>,
        fill in the real values, then restart with <code>npm.cmd run dev:local</code>.
      </p>
      <pre>{'MS_CLIENT_ID=...\nMS_CLIENT_SECRET=...\nAPP_BASE_URL=http://localhost:3001'}</pre>
      <p><b>One-time Microsoft setup</b> - register an app in Microsoft Entra:</p>
      <ol className="small">
        <li>Go to <a href="https://entra.microsoft.com" target="_blank" rel="noreferrer">entra.microsoft.com</a> - App registrations - New registration.</li>
        <li>Supported account types: <i>Accounts in any organizational directory and personal Microsoft accounts</i>.</li>
        <li>Redirect URI (type "Web"): <code>{ms?.redirect_uri}</code></li>
        <li>Under <i>Certificates &amp; secrets</i>, create a client secret.</li>
        <li>Under <i>API permissions</i>, add delegated Microsoft Graph permissions: <code>Mail.ReadWrite</code>, <code>Mail.Send</code>, <code>Calendars.ReadWrite</code>, <code>User.Read</code>, <code>offline_access</code>.</li>
      </ol>
    </>
  );
}

export default function Settings() {
  const { run, notify } = useStore();
  const [ms, setMs] = useState(null);
  const [msError, setMsError] = useState(null);
  const [name, setName] = useState(() => localStorage.getItem('crm_display_name') || 'Curt');

  const loadStatus = () => api.get('/integrations/microsoft/status')
    .then((data) => {
      setMs(data);
      setMsError(null);
    })
    .catch((e) => {
      setMs({ error: true });
      setMsError(e.message || 'Could not reach the CRM API');
    });
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

      <DataSafety />

      <div className="card">
        <div className="card-head">
          <h3>Office 365 (email & calendar)</h3>
          <MicrosoftStatusBadge ms={ms} />
        </div>

        {!ms && <p className="muted">Checking status…</p>}

        {msError && (
          <div className="outline-card">
            <b>Status unavailable.</b>
            <p className="small">
              The CRM API did not answer the Office 365 status check: {msError}. Start or restart the local stack,
              then reload Settings.
            </p>
          </div>
        )}

        {ms && !ms.error && !ms.configured && <MicrosoftConfigHelp ms={ms} />}

        {false && ms && !ms.configured && (
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

        {ms?.configured && !ms.error && !ms.connected && (
          <>
            <p>
              Microsoft app credentials are loaded, but this database does not have a usable Office 365 sign-in token.
              Reconnect once here; normal local restarts should keep working after that.
            </p>
            <a className="btn primary" href="/api/integrations/microsoft/connect">Connect Office 365</a>
          </>
        )}

        {ms?.connected && !ms.error && (
          <>
            <p>Connected as <b>{ms.account}</b>. Emails sent from the CRM use this mailbox and are logged to the company timeline. Meetings created in the CRM sync to your Outlook calendar.</p>
            {ms.expires_at && (
              <p className="muted small">
                Token stored in this local database. Current access token expires {new Date(ms.expires_at).toLocaleString()};
                the CRM will refresh it automatically when needed.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <SyncEmailsButton />
              <button className="btn danger" onClick={disconnect}>Disconnect</button>
            </div>
          </>
        )}
      </div>

      <SequenceSending />

      <TwilioDialer />

      <EmailTemplates />

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
