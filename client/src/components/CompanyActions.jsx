import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useStore, LIFECYCLE_LABELS } from '../store.js';
import SidePanel from './SidePanel.jsx';
import VoiceNoteInput from './VoiceNoteInput.jsx';
import { PhoneLink, StageChip } from './widgets.jsx';
import { fmtDate, fmtDateTime, fmtMoney, relTime } from '../format.js';

const TL_ICONS = {
  call: '📞', email: '✉️', sms: '💬', meeting: '📅',
  linkedin: '💼', stage_change: '🔀', other: '📌',
};

// ---- Preview side panel ----
export function PreviewPanel({ company, onClose, onChanged, onEmail, onNote, onSummary, onSequence }) {
  const { meta, run } = useStore();
  const [full, setFull] = useState(null);

  useEffect(() => {
    setFull(null);
    api.get(`/companies/${company.id}/full`).then(setFull).catch(() => {});
  }, [company.id]);

  const setLifecycle = (lifecycle_stage) =>
    run(async () => {
      await api.patch(`/companies/${company.id}`, { lifecycle_stage });
      onChanged();
    }, `Moved to ${LIFECYCLE_LABELS[lifecycle_stage]}`);

  const c = full || company;

  return (
    <SidePanel title="Preview" onClose={onClose}>
      <div className="preview-header">
        <div className="preview-logo">🏢</div>
        <div>
          <h2 className="preview-name">{c.name}</h2>
          {c.domain && (
            <a href={c.website || `https://${c.domain}`} target="_blank" rel="noreferrer" className="small">
              {c.domain} ↗
            </a>
          )}
        </div>
      </div>

      <div className="preview-actions">
        <button onClick={onNote}><span>📝</span>Note</button>
        <button onClick={onEmail}><span>✉️</span>Email</button>
        <button onClick={onSummary}><span>✨</span>Summary</button>
        <button onClick={onSequence}><span>🔁</span>Sequence</button>
        <Link to={`/companies/${c.id}`} className="record-link"><span>📂</span>Record</Link>
      </div>

      <h4>Key information</h4>
      <dl className="kv">
        <dt>Company owner</dt><dd>{c.owner || 'No owner'}</dd>
        <dt>Lifecycle stage</dt>
        <dd>
          <select
            className="stage-select"
            value={c.lifecycle_stage || 'lead'}
            onChange={(e) => setLifecycle(e.target.value)}
          >
            {meta.lifecycle_stages.map((s) => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
          </select>
        </dd>
        <dt>Industry</dt><dd>{c.industry || '--'}</dd>
        <dt>Employees</dt><dd>{c.employee_count ?? '--'}</dd>
        <dt>Monthly ad spend</dt><dd>{c.ad_spend_range || '--'}</dd>
        <dt>Last activity</dt><dd>{c.last_activity_at ? fmtDateTime(c.last_activity_at) : '--'}</dd>
        <dt>Create date</dt><dd>{fmtDate(c.created_at)}</dd>
      </dl>

      {full && (
        <>
          <h4>Contacts ({full.contacts.length})</h4>
          {full.contacts.length === 0 && <p className="muted small">No contacts yet.</p>}
          {full.contacts.slice(0, 5).map((ct) => (
            <div key={ct.id} className="preview-row">
              <b>{ct.name}</b> <span className="muted small">{ct.title || ''}</span>
              {ct.phone && <div className="small"><PhoneLink phone={ct.phone} /></div>}
              <div className="muted small">Last contact: {relTime(ct.last_contacted_at)}</div>
            </div>
          ))}

          <h4>Deals</h4>
          {full.deals.length === 0 && <p className="muted small">No deals yet.</p>}
          {full.deals.slice(0, 5).map((d) => (
            <div key={d.id} className="preview-row">
              <div className="row between">
                <b>{d.name}</b><span>{fmtMoney(d.value)}</span>
              </div>
              <StageChip stage={d.stage} />
            </div>
          ))}

          <h4>Recent activities</h4>
          {full.timeline.length === 0 && <p className="muted small">No activity yet.</p>}
          {full.timeline.slice(0, 6).map((t) => (
            <div key={`${t.kind}${t.id}`} className="preview-row">
              <span>{t.kind === 'note' ? '📝' : TL_ICONS[t.type] || '📌'}</span>{' '}
              <span className="small">{(t.body || t.type || 'note').slice(0, 90)}</span>
              <div className="muted small">{fmtDateTime(t.occurred_at)}</div>
            </div>
          ))}
        </>
      )}
    </SidePanel>
  );
}

// ---- AI summary side panel ----
export function SummaryPanel({ company, onClose }) {
  const [state, setState] = useState({ loading: true, summary: null, source: null, error: null });

  const generate = () => {
    setState({ loading: true, summary: null, source: null, error: null });
    api.post(`/companies/${company.id}/summary`)
      .then((d) => setState({ loading: false, summary: d.summary, source: d.source, error: null }))
      .catch((e) => setState({ loading: false, summary: null, source: null, error: e.message }));
  };
  useEffect(generate, [company.id]);

  return (
    <SidePanel
      title={`✨ Summary — ${company.name}`}
      onClose={onClose}
      headerExtra={
        <button className="btn small" onClick={generate} disabled={state.loading}>↻ Regenerate</button>
      }
    >
      {state.loading && (
        <div className="summary-loading">
          <div className="pulse-dot" /> Summarizing lead, deals and activity…
        </div>
      )}
      {state.error && <p className="error-text">{state.error}</p>}
      {state.summary && (
        <>
          <div className="summary-text">{state.summary}</div>
          <p className="muted small pad-top">
            {state.source === 'ai'
              ? '✨ AI-generated from this company\'s contacts, deals, notes and activity. May be inaccurate.'
              : 'Generated from CRM data with built-in rules. Set ANTHROPIC_API_KEY on the server to enable AI-powered summaries.'}
          </p>
        </>
      )}
    </SidePanel>
  );
}

// ---- Email compose window (bottom-right, expandable) ----
export function EmailComposer({ company, onClose, onSent }) {
  const { run, notify } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [ms, setMs] = useState(null); // { configured, connected, account }
  const [form, setForm] = useState({ to: '', contact_id: '', subject: '', body: '', log: true });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get(`/contacts?company_id=${company.id}&limit=100`).then((d) => {
      setContacts(d.contacts);
      const first = d.contacts.find((c) => c.email);
      if (first) setForm((f) => ({ ...f, to: first.email, contact_id: String(first.id) }));
    }).catch(() => {});
    api.get('/integrations/microsoft/status').then(setMs).catch(() => setMs({ configured: false, connected: false }));
  }, [company.id]);

  const pickContact = (id) => {
    const ct = contacts.find((c) => String(c.id) === id);
    setForm({ ...form, contact_id: id, to: ct?.email || form.to });
  };

  const send = () => {
    if (!form.to || !form.subject) return notify('Recipient and subject are required', true);
    setSending(true);
    run(async () => {
      await api.post('/email/send', {
        to: form.to,
        subject: form.subject,
        body: form.body,
        company_id: company.id,
        contact_id: form.contact_id ? Number(form.contact_id) : null,
        log: form.log,
      });
      onSent?.();
      onClose();
    }, 'Email sent').finally(() => setSending(false));
  };

  // Fallback when Office 365 isn't connected: open the user's mail app and log the touch.
  const openMailApp = () => {
    window.location.href =
      `mailto:${encodeURIComponent(form.to)}?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(form.body)}`;
    if (form.log && form.subject) {
      api.post('/activities', {
        company_id: company.id,
        contact_id: form.contact_id ? Number(form.contact_id) : null,
        type: 'email',
        outcome: 'sent',
        body: `To ${form.to} — ${form.subject}`,
      }).then(() => onSent?.()).catch(() => {});
    }
    onClose();
  };

  return (
    <div className={`compose-window ${expanded ? 'expanded' : ''}`}>
      <div className="compose-head">
        <b>✉️ Email — {company.name}</b>
        <div className="row gap">
          <button className="icon-btn" title={expanded ? 'Collapse' : 'Expand'} onClick={() => setExpanded(!expanded)}>
            {expanded ? '⤡' : '⤢'}
          </button>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="compose-body">
        <label className="compose-field">
          <span>To</span>
          <div className="row gap grow">
            <input
              className="grow"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              placeholder="email@company.com"
            />
            {contacts.length > 0 && (
              <select value={form.contact_id} onChange={(e) => pickContact(e.target.value)}>
                <option value="">contact…</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </label>
        <label className="compose-field">
          <span>From</span>
          <div className="small">
            {ms?.connected
              ? <b>{ms.account}</b>
              : <span className="muted">
                  Office 365 not connected — <Link to="/settings" onClick={onClose}>connect in Settings</Link> or use your mail app below.
                </span>}
          </div>
        </label>
        <label className="compose-field">
          <span>Subject</span>
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </label>
        <textarea
          className="compose-text"
          rows={expanded ? 16 : 7}
          placeholder="Write your email…"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
      </div>
      <div className="compose-foot">
        {ms?.connected ? (
          <button className="btn primary" onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        ) : (
          <button className="btn primary" onClick={openMailApp}>Open in mail app</button>
        )}
        <label className="checkbox-inline">
          <input type="checkbox" checked={form.log} onChange={(e) => setForm({ ...form, log: e.target.checked })} />
          Log to timeline
        </label>
      </div>
    </div>
  );
}

// ---- Note compose window (bottom-right, expandable, with voice) ----
export function NoteComposer({ company, onClose, onSaved }) {
  const { run } = useStore();
  const [expanded, setExpanded] = useState(false);

  const saveNote = (body, source) =>
    run(async () => {
      await api.post('/notes', { company_id: company.id, body, source });
      onSaved?.();
      onClose();
    }, source === 'voice' ? 'Voice note saved' : 'Note saved');

  return (
    <div className={`compose-window note ${expanded ? 'expanded' : ''}`}>
      <div className="compose-head">
        <b>📝 Note — {company.name}</b>
        <div className="row gap">
          <button className="icon-btn" title={expanded ? 'Collapse' : 'Expand'} onClick={() => setExpanded(!expanded)}>
            {expanded ? '⤡' : '⤢'}
          </button>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="compose-body">
        <VoiceNoteInput placeholder={`Note about ${company.name}… (type or 🎤 dictate)`} onSave={saveNote} />
      </div>
    </div>
  );
}
