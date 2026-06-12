import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';

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
