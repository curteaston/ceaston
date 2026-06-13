import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { fmtPhone, relTime } from '../format.js';
import Timeline from '../components/Timeline.jsx';
import Modal from '../components/Modal.jsx';
import { Field, PhoneLink } from '../components/widgets.jsx';

const ACTIVITY_TABS = [
  { key: 'all', label: 'All activities' },
  { key: 'note', label: 'Notes' },
  { key: 'email', label: 'Emails' },
  { key: 'call', label: 'Calls' },
  { key: 'task', label: 'Tasks' },
  { key: 'meeting', label: 'Meetings' },
];

function ContactForm({ initial = {}, onSubmit, submitLabel = 'Save' }) {
  const { meta } = useStore();
  const [form, setForm] = useState({
    name: '', title: '', email: '', phone: '', source: '', owner: '', lead_status: 'new', ...initial,
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <Field label="First name"><input value={form.first_name || ''} onChange={upd('first_name')} /></Field>
      <Field label="Last name"><input value={form.last_name || ''} onChange={upd('last_name')} /></Field>
      <Field label="Title"><input value={form.title || ''} onChange={upd('title')} /></Field>
      <Field label="Email"><input type="email" value={form.email || ''} onChange={upd('email')} /></Field>
      <Field label="Phone"><input value={form.phone || ''} onChange={upd('phone')} /></Field>
      <Field label="Source"><input value={form.source || ''} onChange={upd('source')} placeholder="cold list, referral, LinkedIn…" /></Field>
      <Field label="Owner"><input value={form.owner || ''} onChange={upd('owner')} /></Field>
      <Field label="Lead status">
        <select value={form.lead_status || 'new'} onChange={upd('lead_status')}>
          {meta.lead_statuses.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </Field>
      <div className="form-actions"><button className="btn primary" type="submit">{submitLabel}</button></div>
    </form>
  );
}

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { run, notify } = useStore();
  const [contact, setContact] = useState(null);
  const [history, setHistory] = useState(null);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const loadContact = async () => {
    const c = await api.get(`/contacts/${id}`);
    setContact(c);
  };
  const loadHistory = async () => {
    const h = await api.get(`/contacts/${id}/history`);
    setHistory(h);
  };
  const loadAll = () => Promise.all([loadContact(), loadHistory()]).catch(() => {});

  useEffect(() => { loadAll(); }, [id]);

  const saveNote = (body, source) =>
    run(async () => {
      await api.post('/notes', { contact_id: Number(id), body, source });
      await loadAll();
    }, source === 'voice' ? 'Voice note saved' : 'Note saved');

  const editNote = (noteId, body) =>
    run(async () => { await api.patch(`/notes/${noteId}`, { body }); await loadHistory(); }, 'Note updated');

  const deleteNote = (noteId) =>
    run(async () => { await api.del(`/notes/${noteId}`); await loadHistory(); }, 'Note deleted');

  const pinNote = (noteId, pinned) =>
    run(async () => { await api.patch(`/notes/${noteId}`, { pinned }); await loadHistory(); }, pinned ? 'Note pinned' : 'Note unpinned');

  const updateContact = (form) =>
    run(async () => {
      await api.patch(`/contacts/${id}`, form);
      setModal(null);
      await loadContact();
    }, 'Contact updated');

  const deleteContact = () => {
    if (!confirm(`Delete ${contact.name}? Their notes and history will be removed.`)) return;
    run(async () => {
      await api.del(`/contacts/${id}`);
      navigate('/contacts');
    }, 'Contact deleted');
  };

  if (!contact) return <p className="muted">Loading…</p>;

  const initials = contact.name?.slice(0, 2).toUpperCase() || '?';

  const filtered = (history || []).filter((item) => {
    const kind = item.kind === 'note' ? 'note' : item.type;
    if (tab !== 'all' && kind !== tab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (item.body || '').toLowerCase().includes(q) ||
        (item.type || '').toLowerCase().includes(q) ||
        (item.outcome || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div>
      <div className="page-head">
        <button className="btn small" onClick={() => navigate('/contacts')}>← Contacts</button>
      </div>

      <div className="detail-grid">
        {/* LEFT — contact info + key information */}
        <div className="stack">
          {/* Header card */}
          <div className="card company-header-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div className="company-avatar">{initials}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{contact.name}</div>
                <div className="muted small">{contact.title || '—'}</div>
                {contact.company_name && (
                  <Link to={`/companies/${contact.company_id}`} style={{ fontSize: 13, color: 'var(--primary)' }}>
                    🏢 {contact.company_name}
                  </Link>
                )}
              </div>
            </div>
            <div className="company-action-buttons">
              <button className="action-btn" onClick={() => setModal('note')}><span>📝</span><span>Note</span></button>
              <button className="action-btn" onClick={() => setModal('email')}><span>✉️</span><span>Email</span></button>
              <button className="action-btn" onClick={() => setModal('call')}><span>📞</span><span>Call</span></button>
              <button className="action-btn" onClick={() => setModal('task')}><span>☑️</span><span>Task</span></button>
              <button className="action-btn" onClick={() => setModal('meeting')}><span>📅</span><span>Meeting</span></button>
              <button className="action-btn" onClick={() => setModal('edit')}><span>⋯</span><span>More</span></button>
            </div>
          </div>

          {/* Key information */}
          <div className="card">
            <div className="card-head">
              <h3>Key information</h3>
              <button className="btn small" onClick={() => setModal('edit')}>Edit</button>
            </div>
            <div className="key-info-grid">
              <div className="key-info-row">
                <span className="key-info-label">Email</span>
                <span className="key-info-value">
                  {contact.email
                    ? <button className="link-btn" style={{ fontSize: 'inherit' }} onClick={() => setModal('email')}>✉️ {contact.email}</button>
                    : <span className="muted">--</span>}
                </span>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Phone</span>
                <span className="key-info-value">
                  {contact.phone
                    ? <PhoneLink phone={fmtPhone(contact.phone) || contact.phone} contactId={contact.id} companyId={contact.company_id} contactName={contact.name} />
                    : <span className="muted">--</span>}
                </span>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Lead Status</span>
                <span className="key-info-value">{contact.lead_status || <span className="muted">--</span>}</span>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Owner</span>
                <span className="key-info-value">{contact.owner || <span className="muted">--</span>}</span>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Source</span>
                <span className="key-info-value">{contact.source || <span className="muted">--</span>}</span>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Last Contacted</span>
                <span className="key-info-value muted">{relTime(contact.last_contacted_at)}</span>
              </div>
            </div>
            <button className="btn small danger" style={{ marginTop: 16 }} onClick={deleteContact}>Delete contact</button>
          </div>
        </div>

        {/* CENTER — activity timeline */}
        <div className="card timeline-card">
          <div className="tl-filter-bar">
            <div className="contact-tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
              {ACTIVITY_TABS.map(({ key, label }) => {
                const count = key === 'all' ? (history || []).length
                  : (history || []).filter((i) => (i.kind === 'note' ? 'note' : i.type) === key).length;
                return (
                  <button key={key} className={`tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)}>
                    {label}{count > 0 && <span className="tab-count">{count}</span>}
                  </button>
                );
              })}
            </div>
            <input
              className="tl-search"
              placeholder="🔍 Search activities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Timeline
            items={filtered}
            onEditNote={editNote}
            onDeleteNote={deleteNote}
            onPinNote={pinNote}
            emptyText="No activities match."
          />
        </div>

        {/* RIGHT — placeholder for future panels */}
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Company</h3>
            </div>
            {contact.company_id ? (
              <Link to={`/companies/${contact.company_id}`} className="contact-card" style={{ display: 'block', textDecoration: 'none' }}>
                <div className="contact-name">{contact.company_name}</div>
                <div className="muted small">View company record ↗</div>
              </Link>
            ) : (
              <p className="muted">No company linked.</p>
            )}
          </div>
        </div>
      </div>

      {modal === 'edit' && (
        <Modal title={`Edit ${contact.name}`} onClose={() => setModal(null)}>
          <ContactForm initial={contact} onSubmit={updateContact} submitLabel="Save changes" />
        </Modal>
      )}
      {modal === 'note' && (
        <Modal title="Add note" onClose={() => setModal(null)}>
          <NoteQuickForm onSave={async (body) => { await saveNote(body, 'typed'); setModal(null); }} />
        </Modal>
      )}
    </div>
  );
}

function NoteQuickForm({ onSave }) {
  const [body, setBody] = useState('');
  return (
    <div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ width: '100%' }} placeholder="Write a note…" autoFocus />
      <div className="form-actions pad-top">
        <button className="btn primary" disabled={!body.trim()} onClick={() => onSave(body.trim())}>Save note</button>
      </div>
    </div>
  );
}
