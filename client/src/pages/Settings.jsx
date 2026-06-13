import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { Field } from '../components/widgets.jsx';

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
              <li>Under <i>API permissions</i>, add delegated Microsoft Graph permissions: <code>Mail.Send</code>, <code>Calendars.Read</code>, <code>User.Read</code>, <code>offline_access</code>.</li>
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
            <p>Connected as <b>{ms.account}</b>. Emails sent from the CRM use this mailbox and are logged to the company timeline; today's calendar shows on Home.</p>
            <button className="btn danger" onClick={disconnect}>Disconnect</button>
          </>
        )}
      </div>

      <SequenceSending />

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
