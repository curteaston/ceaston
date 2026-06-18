import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { fmtPhone, relTime, absUrl } from '../format.js';
import Timeline from '../components/Timeline.jsx';
import Modal from '../components/Modal.jsx';
import { Field, PhoneLink } from '../components/widgets.jsx';
import TagManager from '../components/TagManager.jsx';

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
      <Field label="Primary email"><input type="email" value={form.email || ''} onChange={upd('email')} /></Field>
      <Field label="Secondary email"><input type="email" value={form.email_2 || ''} onChange={upd('email_2')} /></Field>
      <Field label="Direct phone"><input value={form.phone_direct || ''} onChange={upd('phone_direct')} /></Field>
      <Field label="Cell phone"><input value={form.phone_cell || ''} onChange={upd('phone_cell')} /></Field>
      <Field label="Other phone"><input value={form.phone_other || ''} onChange={upd('phone_other')} /></Field>
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
  const [company, setCompany] = useState(null);
  const [history, setHistory] = useState(null);
  const [contactTags, setContactTags] = useState([]);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [phoneExpanded, setPhoneExpanded] = useState(false);
  const loadContact = async () => {
    const c = await api.get(`/contacts/${id}`);
    setContact(c);
    if (c.company_id) {
      api.get(`/companies/${c.company_id}/full`).then(setCompany).catch(() => {});
    }
  };
  const loadHistory = async () => {
    const h = await api.get(`/contacts/${id}/history`);
    setHistory(h);
  };
  const loadTags = async () => {
    const t = await api.get(`/tags/contact/${id}`);
    setContactTags(t);
  };
  const loadAll = () => Promise.all([loadContact(), loadHistory(), loadTags()]).catch(() => {});

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

  const completeTask = (taskId) =>
    run(async () => { await api.patch(`/tasks/${taskId}`, { completed: true }); await loadHistory(); }, 'Task completed');

  const deleteTask = (taskId) =>
    run(async () => { await api.del(`/tasks/${taskId}`); await loadHistory(); }, 'Task deleted');

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
              {contact.first_name && (
                <div className="key-info-row">
                  <span className="key-info-label">First name</span>
                  <span className="key-info-value">{contact.first_name}</span>
                </div>
              )}
              {contact.last_name && (
                <div className="key-info-row">
                  <span className="key-info-label">Last name</span>
                  <span className="key-info-value">{contact.last_name}</span>
                </div>
              )}
              {contact.title && (
                <div className="key-info-row">
                  <span className="key-info-label">Title</span>
                  <span className="key-info-value">{contact.title}</span>
                </div>
              )}
              {(() => {
                const emails = [
                  contact.email && { label: 'Primary', value: contact.email, primary: true },
                  contact.email_2 && { label: 'Secondary', value: contact.email_2 },
                ].filter(Boolean);
                const first = emails[0];
                const rest = emails.slice(1);
                return (
                  <div className="key-info-row">
                    <span className="key-info-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Email
                      {rest.length > 0 && (
                        <button className="expand-arrow" onClick={() => setEmailExpanded(v => !v)} title={emailExpanded ? 'Collapse' : 'Show all emails'}>
                          {emailExpanded ? '▴' : '▾'}
                        </button>
                      )}
                    </span>
                    <span className="key-info-value">
                      {!first ? <span className="muted">--</span> : (
                        <>
                          <button className="link-btn" style={{ fontSize: 'inherit' }} onClick={() => setModal('email')}>✉️ {first.value}</button>
                          {emailExpanded && rest.map((e) => (
                            <div key={e.label} style={{ marginTop: 4 }}>
                              <span className="muted small">{e.label}: </span>
                              <a href={`mailto:${e.value}`} style={{ fontSize: 'inherit' }}>✉️ {e.value}</a>
                            </div>
                          ))}
                        </>
                      )}
                    </span>
                  </div>
                );
              })()}
              {(() => {
                const phones = [
                  contact.phone_direct && { label: 'Direct', value: contact.phone_direct },
                  contact.phone_cell && { label: 'Cell', value: contact.phone_cell },
                  contact.phone_other && { label: 'Other', value: contact.phone_other },
                  !contact.phone_direct && !contact.phone_cell && !contact.phone_other && contact.phone && { label: 'Phone', value: contact.phone },
                ].filter(Boolean);
                const first = phones[0];
                const rest = phones.slice(1);
                return (
                  <div className="key-info-row">
                    <span className="key-info-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {first?.label || 'Phone'}
                      {rest.length > 0 && (
                        <button className="expand-arrow" onClick={() => setPhoneExpanded(v => !v)} title={phoneExpanded ? 'Collapse' : 'Show all phones'}>
                          {phoneExpanded ? '▴' : '▾'}
                        </button>
                      )}
                    </span>
                    <span className="key-info-value">
                      {!first ? <span className="muted">--</span> : (
                        <>
                          <PhoneLink phone={fmtPhone(first.value) || first.value} contactId={contact.id} companyId={contact.company_id} contactName={contact.name} />
                          {phoneExpanded && rest.map((p) => (
                            <div key={p.label} style={{ marginTop: 4 }}>
                              <span className="muted small">{p.label}: </span>
                              <PhoneLink phone={fmtPhone(p.value) || p.value} contactId={contact.id} companyId={contact.company_id} contactName={contact.name} />
                            </div>
                          ))}
                        </>
                      )}
                    </span>
                  </div>
                );
              })()}
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
              <div className="key-info-row" style={{ alignItems: 'flex-start' }}>
                <span className="key-info-label">Tags</span>
                <TagManager entityType="contact" entityId={contact.id} tags={contactTags} onChanged={loadTags} />
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
            onCompleteTask={completeTask}
            onDeleteTask={deleteTask}
            emptyText="No activities match."
          />
        </div>

        {/* RIGHT — company + deals */}
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Company</h3></div>
            {contact.company_id ? (
              <>
                <Link to={`/companies/${contact.company_id}`} style={{ fontWeight: 600, color: 'var(--primary)', fontSize: 15 }}>
                  🏢 {contact.company_name} ↗
                </Link>
                {company?.website && (
                  <div className="small" style={{ marginTop: 6 }}>
                    <a href={absUrl(company.website)} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                      🌐 {company.domain || company.website}
                    </a>
                  </div>
                )}
                {company?.phone && (
                  <div className="small" style={{ marginTop: 4 }}>
                    <PhoneLink phone={fmtPhone(company.phone) || company.phone} contactId={null} companyId={contact.company_id} contactName={company.name} />
                  </div>
                )}
              </>
            ) : (
              <p className="muted">No company linked.</p>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Deals</h3>
            </div>
            {!company ? (
              <p className="muted small">Loading…</p>
            ) : company.deals?.length === 0 ? (
              <p className="muted">No deals yet.</p>
            ) : (
              company.deals?.map((d) => (
                <div key={d.id} className="deal-card">
                  <div className="row between">
                    <b>{d.name}</b>
                    <span>{d.value ? `$${Number(d.value).toLocaleString()}` : '—'}</span>
                  </div>
                  <div className="small muted">{d.stage} · closes {d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString() : '—'}</div>
                </div>
              ))
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
        <Modal title="Add note" onClose={() => setModal(null)} wide>
          <ContactNoteForm contact={contact} onSubmit={async (body) => { await saveNote(body, 'typed'); setModal(null); }} />
        </Modal>
      )}
      {modal === 'email' && (
        <Modal title="Send email" onClose={() => setModal(null)} wide>
          <ContactEmailForm contact={contact} onClose={() => setModal(null)} onSaved={loadHistory} />
        </Modal>
      )}
      {modal === 'call' && (
        <Modal title="Log call" onClose={() => setModal(null)} wide>
          <ContactActivityForm type="call" contact={contact} onSubmit={async (data) => {
            await run(async () => { await api.post('/activities', { contact_id: contact.id, company_id: contact.company_id, ...data }); await loadHistory(); }, 'Call logged');
            if (data.phone) window.location.href = `tel:${data.phone}`;
            setModal(null);
          }} />
        </Modal>
      )}
      {modal === 'task' && (
        <Modal title="Create task" onClose={() => setModal(null)} wide>
          <ContactTaskForm contact={contact} onSubmit={async (data) => {
            await run(async () => { await api.post('/tasks', { contact_id: contact.id, company_id: contact.company_id, ...data }); await loadHistory(); }, 'Task created');
            setModal(null);
          }} />
        </Modal>
      )}
      {modal === 'meeting' && (
        <Modal title="Schedule meeting" onClose={() => setModal(null)} wide>
          <ContactMeetingForm contact={contact} onClose={() => setModal(null)} onSaved={loadHistory} />
        </Modal>
      )}
    </div>
  );
}

function ContactNoteForm({ contact, onSubmit }) {
  const [body, setBody] = useState('');
  const [listening, setListening] = useState(false);
  const textRef = useRef(null);
  const recRef = useRef(null);
  const baseRef = useRef('');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const startListening = () => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = true; rec.interimResults = true;
    baseRef.current = body ? body.replace(/\s*$/, ' ') : '';
    rec.onresult = (e) => {
      let final = '', interim = '';
      for (const r of e.results) { if (r.isFinal) final += r[0].transcript + ' '; else interim += r[0].transcript; }
      const t = (baseRef.current + final + interim).replace(/\s+/g, ' ').trimStart();
      setBody(t);
      if (textRef.current) textRef.current.innerText = t;
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    recRef.current = rec; rec.start(); setListening(true);
  };
  const stopListening = () => { recRef.current?.stop(); };

  return (
    <div className="activity-modal">
      <div className="activity-modal-for">For <span className="activity-tag">{contact.name}</span></div>
      <div className="activity-toolbar">
        <span style={{ flex: 1 }} />
        {SpeechRecognition && (
          <button type="button" className={`fmt-btn mic-btn ${listening ? 'recording' : ''}`}
            onClick={listening ? stopListening : startListening}>
            {listening ? '◼ Stop' : '🎤 Dictate'}
          </button>
        )}
      </div>
      <div ref={textRef} className={`activity-editor${listening ? ' listening' : ''}`}
        contentEditable suppressContentEditableWarning
        data-placeholder={listening ? 'Listening… speak now' : 'Start typing to leave a note…'}
        onInput={(e) => setBody(e.currentTarget.innerText)} />
      <div className="activity-footer">
        <button className="btn primary" disabled={!body.trim()} onClick={() => onSubmit(body.trim())}>Create note</button>
      </div>
    </div>
  );
}

function ContactEmailForm({ contact, onClose, onSaved }) {
  const [subject, setSubject] = useState(`Re: ${contact.name}`);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [msStatus, setMsStatus] = useState(null);
  useEffect(() => { api.get('/integrations/microsoft/status').then(setMsStatus).catch(() => setMsStatus({ connected: false })); }, []);

  const send = async () => {
    if (!contact.email) return;
    setSending(true);
    try {
      await api.post('/email/send', { to: contact.email, subject, body, company_id: contact.company_id, contact_id: contact.id });
      onSaved(); onClose();
    } finally { setSending(false); }
  };

  return (
    <div className="activity-modal">
      <div className="activity-modal-for">To <span className="activity-tag">{contact.name}</span>{contact.email && <span className="muted small"> — {contact.email}</span>}</div>
      <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Body"><textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', resize: 'vertical' }} placeholder="Type your message…" /></Field>
      <div className="activity-footer">
        {msStatus?.connected ? (
          <button className="btn primary" onClick={send} disabled={sending || !contact.email}>
            {sending ? 'Sending…' : '✉️ Send via Outlook'}
          </button>
        ) : (
          <>
            {contact.email && (
              <a href={`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(contact.email)}&subject=${encodeURIComponent(subject)}`}
                target="_blank" rel="noreferrer" className="btn primary" style={{ textDecoration: 'none' }}>✉️ Open in Outlook</a>
            )}
            <span className="muted small">Connect Outlook in Settings to send directly</span>
          </>
        )}
      </div>
    </div>
  );
}

function ContactActivityForm({ type, contact, onSubmit }) {
  const [outcome, setOutcome] = useState('');
  const [body, setBody] = useState('');
  const OUTCOMES = ['connected', 'voicemail', 'no answer', 'replied', 'booked meeting', 'not interested'];
  return (
    <div className="activity-modal">
      <div className="activity-modal-for">For <span className="activity-tag">{contact.name}</span></div>
      <Field label="Outcome">
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">-- select --</option>
          {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Notes"><textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%' }} placeholder="What happened?" /></Field>
      <div className="activity-footer">
        <button className="btn primary" onClick={() => onSubmit({ type, outcome: outcome || null, body: body || null, phone: contact.phone })}>
          Log {type}
        </button>
      </div>
    </div>
  );
}

function ContactTaskForm({ contact, onSubmit }) {
  const me = localStorage.getItem('crm_display_name') || 'me';
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState(me);
  return (
    <div className="activity-modal">
      <div className="activity-modal-for">For <span className="activity-tag">{contact.name}</span></div>
      <input className="task-title-input" placeholder="Enter your task" value={description}
        onChange={(e) => setDescription(e.target.value)} autoFocus />
      <div className="task-attrs-row" style={{ marginTop: 12 }}>
        <div className="task-attr">
          <div className="task-meta-label">Due date</div>
          <input type="date" className="task-meta-select" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="task-attr">
          <div className="task-meta-label">Priority</div>
          <select className="task-meta-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </div>
        <div className="task-attr">
          <div className="task-meta-label">Assigned to</div>
          <input className="task-meta-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
        </div>
      </div>
      <div className="activity-footer">
        <button className="btn primary" disabled={!description.trim()}
          onClick={() => onSubmit({ description, due_date: dueDate || null, priority, owner: assignedTo || null })}>
          Create task
        </button>
      </div>
    </div>
  );
}

function ContactMeetingForm({ contact, onClose, onSaved }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const defaultStart = `${now.toISOString().slice(0, 11)}${pad(now.getHours() + 1)}:00`;
  const defaultEnd = `${now.toISOString().slice(0, 11)}${pad(now.getHours() + 2)}:00`;
  const [subject, setSubject] = useState(`Meeting — ${contact.name}`);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [msStatus, setMsStatus] = useState(null);
  useEffect(() => { api.get('/integrations/microsoft/status').then(setMsStatus).catch(() => setMsStatus({ connected: false })); }, []);

  const schedule = async () => {
    setSaving(true);
    try {
      await api.post('/calendar/events', {
        subject, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
        body: notes, location,
        attendees: contact.email ? [contact.email] : [],
        company_id: contact.company_id, contact_id: contact.id,
      });
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="activity-modal">
      <div className="activity-modal-for">With <span className="activity-tag">{contact.name}</span></div>
      <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Start"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Zoom, Office, Phone…" /></Field>
      <Field label="Notes"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%' }} /></Field>
      <div className="activity-footer">
        {msStatus?.connected ? (
          <button className="btn primary" onClick={schedule} disabled={saving}>
            {saving ? 'Creating…' : '📅 Create in Outlook Calendar'}
          </button>
        ) : (
          <a href={`https://outlook.office.com/calendar/action/compose?subject=${encodeURIComponent(subject)}&startdt=${encodeURIComponent(start)}&enddt=${encodeURIComponent(end)}`}
            target="_blank" rel="noreferrer" className="btn primary" style={{ textDecoration: 'none' }}>
            📅 Open in Outlook Calendar
          </a>
        )}
      </div>
    </div>
  );
}
