import { useEffect, useState } from 'react';
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

function NoteForm({ onSubmit }) {
  const [body, setBody] = useState('');
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSubmit(body); }}>
      <Field label="Note">
        <textarea required rows={4} value={body} onChange={(e) => setBody(e.target.value)}
          style={{ width: '100%', resize: 'vertical' }} />
      </Field>
      <div className="form-actions"><button className="btn primary" type="submit">Save note</button></div>
    </form>
  );
}

function ActivityForm({ type, company, onSubmit }) {
  const [form, setForm] = useState({ body: '', outcome: '', contact_id: '', occurred_at: new Date().toISOString().slice(0, 16) });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const outcomeOptions = type === 'call'
    ? ['Connected', 'Left voicemail', 'No answer', 'Wrong number']
    : type === 'email'
    ? ['Sent', 'Opened', 'Replied', 'Bounced']
    : ['Completed', 'No show', 'Rescheduled'];
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, contact_id: form.contact_id || null }); }}>
      <Field label="Outcome">
        <select value={form.outcome} onChange={upd('outcome')}>
          <option value="">Select outcome…</option>
          {outcomeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Notes">
        <textarea rows={3} value={form.body} onChange={upd('body')} style={{ width: '100%', resize: 'vertical' }} />
      </Field>
      <Field label="Contact (optional)">
        <select value={form.contact_id} onChange={upd('contact_id')}>
          <option value="">Whole company</option>
          {company.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Date & time">
        <input type="datetime-local" value={form.occurred_at} onChange={upd('occurred_at')} />
      </Field>
      <div className="form-actions"><button className="btn primary" type="submit">Log {type}</button></div>
    </form>
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

function TaskForm({ company, onSubmit }) {
  const { meta } = useStore();
  const [form, setForm] = useState({ description: '', due_date: '', priority: 'medium', owner: '', contact_id: '' });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          description: form.description,
          due_date: form.due_date || null,
          priority: form.priority,
          owner: form.owner || null,
          company_id: form.contact_id ? null : company.id,
          contact_id: form.contact_id || null,
        });
      }}
    >
      <Field label="Description *"><input required value={form.description} onChange={upd('description')} /></Field>
      <Field label="Due date"><input type="date" value={form.due_date} onChange={upd('due_date')} /></Field>
      <Field label="Priority">
        <select value={form.priority} onChange={upd('priority')}>
          {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="Owner"><input value={form.owner} onChange={upd('owner')} placeholder="me" /></Field>
      <Field label="Tie to contact (optional)">
        <select value={form.contact_id} onChange={upd('contact_id')}>
          <option value="">Whole company</option>
          {company.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="form-actions"><button className="btn primary" type="submit">Create task</button></div>
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
  const [modal, setModal] = useState(null); // 'edit' | 'contact' | 'deal' | 'task' | 'note'

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
        <div className="stack">
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
              <button className="action-btn" title="Note" onClick={() => setModal('note')}>
                <span>📝</span><span>Note</span>
              </button>
              <button className="action-btn" title="Email" onClick={() => setModal('email')}>
                <span>✉️</span><span>Email</span>
              </button>
              <button className="action-btn" title="Call" onClick={() => setModal('call')}>
                <span>📞</span><span>Call</span>
              </button>
              <button className="action-btn" title="Task" onClick={() => setModal('task')}>
                <span>☑️</span><span>Task</span>
              </button>
              <button className="action-btn" title="Meeting" onClick={() => setModal('meeting')}>
                <span>📅</span><span>Meeting</span>
              </button>
              <button className="action-btn" onClick={() => setModal('edit')}>
                <span>⋯</span><span>More</span>
              </button>
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
        <Modal title="Add task" onClose={close}>
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
        <Modal title="Add note" onClose={close}>
          <NoteForm
            onSubmit={(body) => mutateCompany(async () => {
              await api.post('/notes', { company_id: company.id, body, source: 'typed' });
              close();
            }, 'Note saved')}
          />
        </Modal>
      )}
      {modal === 'email' && (
        <Modal title="Log email" onClose={close}>
          <ActivityForm
            type="email"
            company={company}
            onSubmit={(form) => mutateCompany(async () => {
              await api.post('/activities', { ...form, company_id: company.id, type: 'email' });
              close();
            }, 'Email logged')}
          />
        </Modal>
      )}
      {modal === 'call' && (
        <Modal title="Log call" onClose={close}>
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
        <Modal title="Log meeting" onClose={close}>
          <ActivityForm
            type="meeting"
            company={company}
            onSubmit={(form) => mutateCompany(async () => {
              await api.post('/activities', { ...form, company_id: company.id, type: 'meeting' });
              close();
            }, 'Meeting logged')}
          />
        </Modal>
      )}
    </div>
  );
}
