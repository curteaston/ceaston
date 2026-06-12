import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../store.js';
import Modal from '../components/Modal.jsx';
import Timeline from '../components/Timeline.jsx';
import VoiceNoteInput from '../components/VoiceNoteInput.jsx';
import ContactDrawer, { ContactForm } from '../components/ContactDrawer.jsx';
import { Field, StageChip, TaskRow } from '../components/widgets.jsx';
import { CompanyForm } from './Companies.jsx';
import { fmtDate, fmtMoney, relTime } from '../format.js';

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

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company, loadingCompany, fetchCompany, mutateCompany, toggleTask, meta, run } = useStore();
  const [openContact, setOpenContact] = useState(null);
  const [modal, setModal] = useState(null); // 'edit' | 'contact' | 'deal' | 'task'

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
      <div className="page-head">
        <div>
          <h1>{company.name}</h1>
          <div className="company-meta">
            {company.domain && <span>🌐 {company.domain}</span>}
            <span>{company.industry || 'No industry'}</span>
            <span>{company.employee_count != null ? `${company.employee_count} employees` : 'Size unknown'}</span>
            <span>Ad spend: {company.ad_spend_range || 'unknown'}</span>
            {company.website && <a href={company.website} target="_blank" rel="noreferrer">Website ↗</a>}
            <span className="muted">Added {fmtDate(company.created_at)}</span>
            <span className="muted">Last activity {relTime(company.last_activity_at)}</span>
          </div>
        </div>
        <div className="row gap">
          <button className="btn" onClick={() => setModal('edit')}>Edit</button>
          <button className="btn danger" onClick={deleteCompany}>Delete</button>
        </div>
      </div>

      <div className="detail-grid">
        {/* Contacts */}
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
              <div className="small">Last contact: <b>{relTime(c.last_contacted_at)}</b></div>
            </button>
          ))}
        </div>

        {/* Unified timeline */}
        <div className="card timeline-card">
          <h3>Activity timeline</h3>
          <p className="muted small">All calls, emails, notes and stage changes across every contact at {company.name}.</p>
          <VoiceNoteInput placeholder={`Company note about ${company.name}…`} onSave={saveNote} />
          <Timeline items={company.timeline} onEditNote={editNote} onDeleteNote={deleteNote} />
        </div>

        {/* Deals + tasks */}
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
    </div>
  );
}
