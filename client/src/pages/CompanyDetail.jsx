import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../store.js';
import Modal from '../components/Modal.jsx';
import Timeline from '../components/Timeline.jsx';
import VoiceNoteInput from '../components/VoiceNoteInput.jsx';
import ContactDrawer, { ContactForm } from '../components/ContactDrawer.jsx';
import CompanySequences from '../components/CompanySequences.jsx';
import { Field, PhoneLink, StageChip, TaskRow } from '../components/widgets.jsx';
import { CompanyForm } from './Companies.jsx';
import { fmtDate, fmtMoney, relTime } from '../format.js';

// Returns a date N business days from today, formatted as YYYY-MM-DD
function addBusinessDays(n) {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}
function fmtBusinessDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function toDateInput(d) {
  return d.toISOString().slice(0, 10);
}

const DUE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 business days', days: 3, business: true },
  { label: 'In 1 week', days: 7 },
  { label: 'Custom', days: null },
];

const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

function NoteForm({ company, onSubmit }) {
  const [body, setBody] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(3);
  const [listening, setListening] = useState(false);
  const textRef = useRef(null);
  const recRef = useRef(null);
  const baseRef = useRef('');

  const format = (cmd) => { textRef.current?.focus(); document.execCommand(cmd); };

  const handleSubmit = () => {
    if (!body.trim()) return;
    onSubmit(body, followUp ? { days: followUpDays } : null);
  };

  const startListening = () => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    baseRef.current = body ? body.replace(/\s*$/, ' ') : '';
    rec.onresult = (event) => {
      let final = '', interim = '';
      for (const r of event.results) {
        if (r.isFinal) final += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      const newText = (baseRef.current + final + interim).replace(/\s+/g, ' ').trimStart();
      setBody(newText);
      if (textRef.current) textRef.current.innerText = newText;
    };
    rec.onerror = () => {};
    rec.onend = () => { setListening(false); recRef.current = null; };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stopListening = () => { recRef.current?.stop(); };

  return (
    <div className="activity-modal">
      <div className="activity-modal-for">
        For <span className="activity-tag">{company.name}</span>
      </div>
      <div className="activity-toolbar">
        <button type="button" className="fmt-btn" onMouseDown={(e) => { e.preventDefault(); format('bold'); }}><b>B</b></button>
        <button type="button" className="fmt-btn" onMouseDown={(e) => { e.preventDefault(); format('italic'); }}><i>I</i></button>
        <button type="button" className="fmt-btn" onMouseDown={(e) => { e.preventDefault(); format('underline'); }}><u>U</u></button>
        <button type="button" className="fmt-btn" onMouseDown={(e) => { e.preventDefault(); format('insertUnorderedList'); }}>≡</button>
        <span style={{ flex: 1 }} />
        {SpeechRecognition && (
          <button
            type="button"
            className={`fmt-btn mic-btn ${listening ? 'recording' : ''}`}
            title={listening ? 'Stop dictation' : 'Dictate note (speech-to-text)'}
            onClick={listening ? stopListening : startListening}
            style={{ fontSize: 15, padding: '2px 10px' }}
          >
            {listening ? '◼ Stop' : '🎤 Dictate'}
          </button>
        )}
      </div>
      <div
        ref={textRef}
        className={`activity-editor${listening ? ' listening' : ''}`}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={listening ? 'Listening… speak now' : 'Start typing to leave a note…'}
        onInput={(e) => setBody(e.currentTarget.innerText)}
      />
      <div className="activity-assoc">Associated with 1 record: <b>{company.name}</b></div>
      <div className="activity-followup">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
          Create a <strong>To-do</strong> task to follow up in
          <select value={followUpDays} onChange={(e) => setFollowUpDays(Number(e.target.value))}
            style={{ margin: '0 4px' }}>
            <option value={1}>1 business day</option>
            <option value={2}>2 business days</option>
            <option value={3}>3 business days</option>
            <option value={5}>5 business days</option>
            <option value={7}>1 week</option>
          </select>
          <b>({fmtBusinessDate(addBusinessDays(followUpDays))})</b>
        </label>
      </div>
      <div className="activity-footer">
        <button className="btn primary" onClick={handleSubmit}>Create note</button>
      </div>
    </div>
  );
}

function TaskForm({ company, onSubmit }) {
  const me = localStorage.getItem('crm_display_name') || 'me';
  const defaultDate = addBusinessDays(3);
  const [description, setDescription] = useState('');
  const [duePreset, setDuePreset] = useState('In 3 business days');
  const [dueDate, setDueDate] = useState(toDateInput(defaultDate));
  const [dueTime, setDueTime] = useState('08:00');
  const [reminder, setReminder] = useState('No reminder');
  const [repeat, setRepeat] = useState(false);
  const [taskType, setTaskType] = useState('To-do');
  const [priority, setPriority] = useState('None');
  const [assignedTo, setAssignedTo] = useState(me);
  const [notes, setNotes] = useState('');
  const [contactId, setContactId] = useState('');
  const notesRef = useRef(null);

  const applyPreset = (preset) => {
    setDuePreset(preset.label);
    if (preset.days === null) return;
    const d = preset.business ? addBusinessDays(preset.days) : (() => { const x = new Date(); x.setDate(x.getDate() + preset.days); return x; })();
    setDueDate(toDateInput(d));
  };

  const dueDateLabel = () => {
    if (duePreset === 'Custom') return dueDate;
    const d = new Date(dueDate + 'T12:00:00');
    return fmtBusinessDate(d);
  };

  const handleSubmit = () => {
    if (!description.trim()) return;
    onSubmit({
      description,
      due_date: dueDate || null,
      priority: priority.toLowerCase() === 'none' ? 'medium' : priority.toLowerCase(),
      owner: assignedTo || null,
      company_id: contactId ? null : company.id,
      contact_id: contactId || null,
    });
  };

  return (
    <div className="activity-modal">
      <input
        className="task-title-input"
        placeholder="Enter your task"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        autoFocus
      />
      <div className="task-meta-row">
        <div className="task-meta-block">
          <div className="task-meta-label">Activity date</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="task-meta-select" value={duePreset}
              onChange={(e) => applyPreset(DUE_PRESETS.find((p) => p.label === e.target.value) || DUE_PRESETS[4])}>
              {DUE_PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}
            </select>
            {duePreset === 'Custom' && (
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="task-meta-select" />
            )}
            <span className="task-meta-value">🕐 {dueTime}</span>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="task-meta-select" style={{ width: 110 }} />
          </div>
          {duePreset !== 'Custom' && <div className="task-meta-sublabel"><b>{dueDateLabel()}</b></div>}
        </div>
        <div className="task-meta-block">
          <div className="task-meta-label">Send reminder</div>
          <select className="task-meta-select" value={reminder} onChange={(e) => setReminder(e.target.value)}>
            <option>No reminder</option>
            <option>At time of task</option>
            <option>30 min before</option>
            <option>1 hour before</option>
            <option>1 day before</option>
          </select>
        </div>
      </div>
      <div className="task-repeat-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          Set to repeat
        </label>
      </div>
      <div className="task-attrs-row">
        <div className="task-attr">
          <div className="task-meta-label">Task Type</div>
          <select className="task-meta-select" value={taskType} onChange={(e) => setTaskType(e.target.value)}>
            <option>To-do</option><option>Call</option><option>Email</option><option>LinkedIn</option>
          </select>
        </div>
        <div className="task-attr">
          <div className="task-meta-label">Priority</div>
          <select className="task-meta-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option>None</option><option>Low</option><option>Medium</option><option>High</option>
          </select>
        </div>
        <div className="task-attr">
          <div className="task-meta-label">Contact</div>
          <select className="task-meta-select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">None</option>
            {company.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="task-attr">
          <div className="task-meta-label">Assigned to</div>
          <input className="task-meta-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
        </div>
      </div>
      <div
        ref={notesRef}
        className="activity-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Notes…"
        onInput={(e) => setNotes(e.currentTarget.innerText)}
        style={{ minHeight: 80 }}
      />
      <div className="activity-assoc">Associated with 1 record: <b>{company.name}</b></div>
      <div className="activity-footer">
        <button className="btn primary" onClick={handleSubmit} disabled={!description.trim()}>Create</button>
      </div>
    </div>
  );
}

function EmailForm({ company, onClose, onSaved }) {
  const { run } = useStore();
  const [contactId, setContactId] = useState(company.contacts[0]?.id || '');
  const [subject, setSubject] = useState(`Re: ${company.name}`);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [msStatus, setMsStatus] = useState(null);

  useEffect(() => {
    api.get('/integrations/microsoft/status').then(setMsStatus).catch(() => setMsStatus({ connected: false }));
  }, []);

  const contact = company.contacts.find((c) => String(c.id) === String(contactId));

  const sendViaApi = async () => {
    if (!contact?.email) return;
    setSending(true);
    try {
      await api.post('/email/send', {
        to: contact.email, subject, body,
        company_id: company.id, contact_id: contact.id,
      });
      onSaved();
      onClose();
    } finally { setSending(false); }
  };

  return (
    <div className="activity-modal">
      <div className="activity-modal-for">To <span className="activity-tag">{company.name}</span></div>
      <Field label="Contact">
        <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">-- select contact --</option>
          {company.contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ' (no email)'}</option>
          ))}
        </select>
      </Field>
      <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Body">
        <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)}
          style={{ width: '100%', resize: 'vertical' }} placeholder="Type your message…" />
      </Field>
      <div className="activity-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        {msStatus?.connected ? (
          <button className="btn primary" onClick={sendViaApi} disabled={sending || !contact?.email}>
            {sending ? 'Sending…' : '✉️ Send via Outlook'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {contact?.email && (
              <a href={`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(contact.email)}&subject=${encodeURIComponent(subject)}`}
                target="_blank" rel="noreferrer" className="btn primary" style={{ textDecoration: 'none' }}>
                ✉️ Open in Outlook
              </a>
            )}
            <span className="muted small">Connect Outlook in Settings to send directly</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingForm({ company, onClose, onSaved }) {
  const { run } = useStore();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const defaultStart = `${now.toISOString().slice(0, 11)}${pad(now.getHours() + 1)}:00`;
  const defaultEnd = `${now.toISOString().slice(0, 11)}${pad(now.getHours() + 2)}:00`;

  const [subject, setSubject] = useState(`Meeting — ${company.name}`);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [contactId, setContactId] = useState('');
  const [saving, setSaving] = useState(false);
  const [msStatus, setMsStatus] = useState(null);

  useEffect(() => {
    api.get('/integrations/microsoft/status').then(setMsStatus).catch(() => setMsStatus({ connected: false }));
  }, []);

  const contact = company.contacts.find((c) => String(c.id) === String(contactId));

  const scheduleViaApi = async () => {
    setSaving(true);
    try {
      await api.post('/calendar/events', {
        subject, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
        body: notes, location,
        attendees: contact?.email ? [contact.email] : [],
        company_id: company.id, contact_id: contact?.id || null,
      });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  const openOutlook = () => {
    const url = `https://outlook.office.com/calendar/action/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(notes)}&startdt=${encodeURIComponent(start)}&enddt=${encodeURIComponent(end)}`;
    window.open(url, '_blank');
    onClose();
  };

  return (
    <div className="activity-modal">
      <div className="activity-modal-for">For <span className="activity-tag">{company.name}</span></div>
      <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Start"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Zoom, Office, Phone" /></Field>
      <Field label="Invite contact (optional)">
        <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">None</option>
          {company.contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>
          ))}
        </select>
      </Field>
      <Field label="Notes"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%', resize: 'vertical' }} /></Field>
      <div className="activity-footer" style={{ gap: 8 }}>
        {msStatus?.connected ? (
          <button className="btn primary" onClick={scheduleViaApi} disabled={saving}>
            {saving ? 'Creating…' : '📅 Create in Outlook Calendar'}
          </button>
        ) : (
          <button className="btn primary" onClick={openOutlook}>📅 Open in Outlook Calendar</button>
        )}
        {!msStatus?.connected && <span className="muted small">Connect Outlook in Settings to sync automatically</span>}
      </div>
    </div>
  );
}

function ActivityForm({ type, company, onSubmit }) {
  const [form, setForm] = useState({ body: '', outcome: '', contact_id: '', occurred_at: new Date().toISOString().slice(0, 16) });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const outcomeOptions = ['Connected', 'Left voicemail', 'No answer', 'Wrong number'];
  const contact = company.contacts.find((c) => String(c.id) === String(form.contact_id));
  const phone = contact?.phone || company.contacts[0]?.phone || '';

  return (
    <div className="activity-modal">
      <div className="activity-modal-for">For <span className="activity-tag">{company.name}</span></div>
      <Field label="Contact to call">
        <select value={form.contact_id} onChange={upd('contact_id')}>
          <option value="">Whole company</option>
          {company.contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>
          ))}
        </select>
      </Field>
      {phone && (
        <button type="button" className="btn primary" style={{ marginBottom: 12 }}
          onClick={() => window.location.href = `tel:${phone.replace(/[^+\d]/g, '')}`}>
          📞 Dial {phone}
        </button>
      )}
      <Field label="Outcome">
        <select value={form.outcome} onChange={upd('outcome')}>
          <option value="">Select outcome…</option>
          {outcomeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Notes">
        <textarea rows={3} value={form.body} onChange={upd('body')} style={{ width: '100%', resize: 'vertical' }} />
      </Field>
      <Field label="Date & time">
        <input type="datetime-local" value={form.occurred_at} onChange={upd('occurred_at')} />
      </Field>
      <div className="activity-footer">
        <button className="btn primary" onClick={() => onSubmit({ ...form, contact_id: form.contact_id || null })}>
          Log call
        </button>
      </div>
    </div>
  );
}

function DealForm({ companyId, initial = {}, onSubmit, submitLabel = 'Save' }) {
  const { meta } = useStore();
  const [form, setForm] = useState({
    name: '', value: '', stage: 'lead', probability: '', expected_close_date: '', ...initial,
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...form,
          company_id: companyId,
          value: form.value === '' ? 0 : Number(form.value),
          probability: form.probability === '' ? undefined : Number(form.probability),
          expected_close_date: form.expected_close_date || null,
        });
      }}
    >
      <Field label="Deal name *"><input required value={form.name} onChange={upd('name')} /></Field>
      <Field label="Value ($)"><input type="number" min="0" step="0.01" value={form.value} onChange={upd('value')} /></Field>
      <Field label="Stage">
        <select value={form.stage} onChange={upd('stage')}>
          {meta.stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Probability % (blank = stage default)">
        <input type="number" min="0" max="100" value={form.probability} onChange={upd('probability')} />
      </Field>
      <Field label="Expected close"><input type="date" value={form.expected_close_date || ''} onChange={upd('expected_close_date')} /></Field>
      <div className="form-actions"><button className="btn primary" type="submit">{submitLabel}</button></div>
    </form>
  );
}

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
  'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky',
  'Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi',
  'Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico',
  'New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania',
  'Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

function StateTypeahead({ value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = query.trim()
    ? US_STATES.filter((s) => s.toLowerCase().startsWith(query.toLowerCase()))
    : US_STATES;

  const select = (state) => { setQuery(state); onChange(state); setOpen(false); };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder="Type to search states…"
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto'
        }}>
          {filtered.map((s) => (
            <div key={s} style={{ padding: '7px 12px', cursor: 'pointer' }}
              onMouseDown={() => select(s)}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.background = ''}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company, loadingCompany, fetchCompany, mutateCompany, toggleTask, meta, run } = useStore();
  const [openContact, setOpenContact] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => { fetchCompany(id); }, [id]);

  if (loadingCompany && !company) return <p className="muted">Loading…</p>;
  if (!company) return <p className="muted">Company not found.</p>;

  // Keep the drawer's contact object fresh after mutations.
  const drawerContact = openContact && company.contacts.find((c) => c.id === openContact.id);

  const close = () => setModal(null);
  const saveNote = (body, source) =>
    mutateCompany(() => api.post('/notes', { company_id: company.id, body, source }),
      source === 'voice' ? 'Voice note saved' : 'Note saved');
  const editNote = (noteId, body) => mutateCompany(() => api.patch(`/notes/${noteId}`, { body }), 'Note updated');
  const deleteNote = (noteId) => mutateCompany(() => api.del(`/notes/${noteId}`), 'Note deleted');

  const deleteCompany = () => {
    if (!confirm(`Delete ${company.name} and ALL its contacts, deals, tasks and notes?`)) return;
    run(async () => {
      await api.del(`/companies/${company.id}`);
      navigate('/companies');
    }, 'Company deleted');
  };

  const openDeals = company.deals.filter((d) => !['won', 'lost'].includes(d.stage));
  const openTasks = company.tasks.filter((t) => !t.completed);

  return (
    <div>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn small" onClick={() => navigate('/companies')}>← Companies</button>
        </div>
      </div>

      <div className="detail-grid">
        {/* LEFT COLUMN */}
        <div className="stack left-panel">
          {/* Company header card */}
          <div className="card company-header-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div className="company-avatar">{company.name.slice(0, 3).toUpperCase()}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{company.name}</div>
                {company.website && (
                  <a href={company.website} target="_blank" rel="noreferrer"
                    style={{ fontSize: 13, color: 'var(--primary)' }}>
                    {company.domain || company.website} ↗
                  </a>
                )}
                {!company.website && company.domain && (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{company.domain}</span>
                )}
              </div>
            </div>
            <div className="company-action-buttons">
              <button className="action-btn" title="Note" onClick={() => setModal('note')}><span>📝</span><span>Note</span></button>
              <button className="action-btn" title="Email" onClick={() => setModal('email')}><span>✉️</span><span>Email</span></button>
              <button className="action-btn" title="Call" onClick={() => setModal('call')}><span>📞</span><span>Call</span></button>
              <button className="action-btn" title="Task" onClick={() => setModal('task')}><span>☑️</span><span>Task</span></button>
              <button className="action-btn" title="Meeting" onClick={() => setModal('meeting')}><span>📅</span><span>Meeting</span></button>
              <button className="action-btn" onClick={() => setModal('edit')}><span>⋯</span><span>More</span></button>
            </div>
          </div>

          {/* Key information card */}
          <div className="card">
            <div className="card-head">
              <h3>Key information</h3>
              <button className="btn small" onClick={() => setModal('edit')}>Actions ▾</button>
            </div>
            <div className="key-info-grid">
              <div className="key-info-row">
                <span className="key-info-label">Company owner</span>
                <input
                  className="key-info-input"
                  defaultValue={company.owner || ''}
                  placeholder="--"
                  onBlur={(e) => { if (e.target.value !== (company.owner || '')) mutateCompany(() => api.patch(`/companies/${company.id}`, { owner: e.target.value || null }), 'Saved'); }}
                />
              </div>
              <div className="key-info-row">
                <span className="key-info-label">City</span>
                <input
                  className="key-info-input"
                  defaultValue={company.city || ''}
                  placeholder="--"
                  onBlur={(e) => { if (e.target.value !== (company.city || '')) mutateCompany(() => api.patch(`/companies/${company.id}`, { city: e.target.value || null }), 'Saved'); }}
                />
              </div>
              <div className="key-info-row">
                <span className="key-info-label">State</span>
                <StateTypeahead
                  value={company.state || ''}
                  onChange={(val) => { if (US_STATES.includes(val) && val !== company.state) mutateCompany(() => api.patch(`/companies/${company.id}`, { state: val }), 'Saved'); }}
                />
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Lifecycle Stage</span>
                <select
                  className="key-info-select"
                  value={company.lifecycle_stage || ''}
                  onChange={(e) => mutateCompany(() => api.patch(`/companies/${company.id}`, { lifecycle_stage: e.target.value }), 'Saved')}
                >
                  <option value="">--</option>
                  {meta.lifecycle_stages.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Lead Status</span>
                <select
                  className="key-info-select"
                  value={company.lead_status || ''}
                  onChange={(e) => mutateCompany(() => api.patch(`/companies/${company.id}`, { lead_status: e.target.value || null }), 'Saved')}
                >
                  <option value="">--</option>
                  {meta.lead_statuses.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Industry</span>
                <span className="key-info-value">{company.industry || <span className="muted">--</span>}</span>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Last Contacted</span>
                <span className="key-info-value muted">{company.last_activity_at ? relTime(company.last_activity_at) : '--'}</span>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Employees</span>
                <span className="key-info-value">{company.employee_count != null ? company.employee_count : <span className="muted">--</span>}</span>
              </div>
              <div className="key-info-row">
                <span className="key-info-label">Ad Spend</span>
                <span className="key-info-value">{company.ad_spend_range || <span className="muted">--</span>}</span>
              </div>
            </div>
            <button className="btn small danger" style={{ marginTop: 16 }} onClick={deleteCompany}>Delete company</button>
          </div>

          {/* Contacts card */}
          <div className="card">
            <div className="card-head">
              <h3>Contacts ({company.contacts.length})</h3>
              <button className="btn small" onClick={() => setModal('contact')}>+ Add</button>
            </div>
            {company.contacts.length === 0 && <p className="muted">No contacts yet.</p>}
            {company.contacts.map((c) => (
              <button key={c.id} className="contact-card" onClick={() => setOpenContact(c)}>
                <div className="contact-name">{c.name}</div>
                <div className="muted small">{c.title || '—'}</div>
                {c.phone && <div className="small"><PhoneLink phone={c.phone} contactId={c.id} companyId={c.company_id} contactName={c.name} /></div>}
                <div className="small">Last contact: <b>{relTime(c.last_contacted_at)}</b></div>
              </button>
            ))}
          </div>
        </div>

        {/* CENTER — timeline */}
        <div className="card timeline-card">
          <h3>Activity timeline</h3>
          <p className="muted small">All calls, emails, notes and stage changes across every contact at {company.name}.</p>
          <VoiceNoteInput placeholder={`Company note about ${company.name}…`} onSave={saveNote} />
          <Timeline items={company.timeline} onEditNote={editNote} onDeleteNote={deleteNote} />
        </div>

        {/* RIGHT — deals + tasks */}
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Deals</h3>
              <button className="btn small" onClick={() => setModal('deal')}>+ Add</button>
            </div>
            {company.deals.length === 0 && <p className="muted">No deals yet.</p>}
            {company.deals.map((d) => (
              <div key={d.id} className="deal-card">
                <div className="row between">
                  <b>{d.name}</b>
                  <span>{fmtMoney(d.value)}</span>
                </div>
                <div className="row between small">
                  <select
                    className="stage-select"
                    value={d.stage}
                    onChange={(e) => mutateCompany(() => api.patch(`/deals/${d.id}`, { stage: e.target.value }), 'Stage updated')}
                  >
                    {meta.stages.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="muted">{d.probability}% · closes {d.expected_close_date ? fmtDate(d.expected_close_date) : '—'}</span>
                </div>
              </div>
            ))}
            {openDeals.length > 0 && (
              <div className="muted small pad-top">
                Open pipeline: <b>{fmtMoney(openDeals.reduce((s, d) => s + Number(d.value), 0))}</b>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Tasks ({openTasks.length} open)</h3>
              <button className="btn small" onClick={() => setModal('task')}>+ Add</button>
            </div>
            {company.tasks.length === 0 && <p className="muted">No tasks yet.</p>}
            {company.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                showTarget
                onToggle={toggleTask}
                onDelete={(task) => mutateCompany(() => api.del(`/tasks/${task.id}`), 'Task deleted')}
              />
            ))}
          </div>

          <CompanySequences company={company} />
        </div>
      </div>

      {drawerContact && <ContactDrawer contact={drawerContact} onClose={() => setOpenContact(null)} />}

      {modal === 'edit' && (
        <Modal title={`Edit ${company.name}`} onClose={close}>
          <CompanyForm
            initial={company}
            submitLabel="Save changes"
            onSubmit={(form) => mutateCompany(async () => {
              await api.patch(`/companies/${company.id}`, form);
              close();
            }, 'Company updated')}
          />
        </Modal>
      )}
      {modal === 'contact' && (
        <Modal title="Add contact" onClose={close}>
          <ContactForm
            submitLabel="Add contact"
            onSubmit={(form) => mutateCompany(async () => {
              await api.post('/contacts', { ...form, company_id: company.id });
              close();
            }, 'Contact added')}
          />
        </Modal>
      )}
      {modal === 'deal' && (
        <Modal title="Add deal" onClose={close}>
          <DealForm
            companyId={company.id}
            submitLabel="Create deal"
            onSubmit={(form) => mutateCompany(async () => {
              await api.post('/deals', form);
              close();
            }, 'Deal created')}
          />
        </Modal>
      )}
      {modal === 'task' && (
        <Modal title="Task" onClose={close} wide>
          <TaskForm
            company={company}
            onSubmit={(form) => mutateCompany(async () => {
              await api.post('/tasks', form);
              close();
            }, 'Task created')}
          />
        </Modal>
      )}
      {modal === 'note' && (
        <Modal title="Note" onClose={close} wide>
          <NoteForm
            company={company}
            onSubmit={(body, followUp) => mutateCompany(async () => {
              await api.post('/notes', { company_id: company.id, body, source: 'typed' });
              if (followUp) {
                const d = addBusinessDays(followUp.days);
                await api.post('/tasks', {
                  company_id: company.id,
                  description: `Follow up on note — ${company.name}`,
                  due_date: toDateInput(d),
                  priority: 'medium',
                });
              }
              close();
            }, 'Note saved')}
          />
        </Modal>
      )}
      {modal === 'email' && (
        <Modal title="Send email" onClose={close} wide>
          <EmailForm company={company} onClose={close} onSaved={() => mutateCompany(() => Promise.resolve(), 'Email sent')} />
        </Modal>
      )}
      {modal === 'call' && (
        <Modal title="Log call" onClose={close} wide>
          <ActivityForm
            type="call"
            company={company}
            onSubmit={(form) => mutateCompany(async () => {
              await api.post('/activities', { ...form, company_id: company.id, type: 'call' });
              close();
            }, 'Call logged')}
          />
        </Modal>
      )}
      {modal === 'meeting' && (
        <Modal title="Schedule meeting" onClose={close} wide>
          <MeetingForm company={company} onClose={close} onSaved={() => mutateCompany(() => Promise.resolve(), 'Meeting created')} />
        </Modal>
      )}
    </div>
  );
}
