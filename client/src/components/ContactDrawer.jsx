import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { fmtDateTime, relTime } from '../format.js';
import Modal from './Modal.jsx';
import Timeline from './Timeline.jsx';
import VoiceNoteInput from './VoiceNoteInput.jsx';
import { Field, PhoneLink } from './widgets.jsx';

const INTERACTION_TYPES = ['call', 'email', 'sms', 'meeting', 'linkedin', 'other'];
const OUTCOMES = ['connected', 'voicemail', 'no answer', 'replied', 'bounced', 'booked meeting', 'not interested'];

function LogInteraction({ contact, onLogged }) {
  const { run } = useStore();
  const [type, setType] = useState('call');
  const [outcome, setOutcome] = useState('');
  const [body, setBody] = useState('');

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/activities', {
        contact_id: contact.id, type, outcome: outcome || null, body: body || null,
      });
      setBody(''); setOutcome('');
      await onLogged();
    }, 'Interaction logged');
  };

  return (
    <form className="log-interaction" onSubmit={submit}>
      <div className="row gap">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {INTERACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">outcome…</option>
          {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input
          className="grow" placeholder="What happened? (optional)"
          value={body} onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn primary" type="submit">Log</button>
      </div>
    </form>
  );
}

export function ContactForm({ initial = {}, onSubmit, submitLabel = 'Save' }) {
  const { meta } = useStore();
  const [form, setForm] = useState({
    name: '', title: '', email: '', phone: '', source: '', owner: '', lead_status: 'new', ...initial,
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <Field label="First name"><input value={form.first_name || ''} onChange={upd('first_name')} /></Field>
      <Field label="Last name"><input value={form.last_name || ''} onChange={upd('last_name')} /></Field>
      <Field label="Name *"><input required value={form.name} onChange={upd('name')} /></Field>
      <Field label="Title"><input value={form.title || ''} onChange={upd('title')} /></Field>
      <Field label="Primary email"><input type="email" value={form.email || ''} onChange={upd('email')} /></Field>
      <Field label="Secondary email"><input type="email" value={form.email_2 || ''} onChange={upd('email_2')} /></Field>
      <Field label="Direct phone"><input value={form.phone_direct || ''} onChange={upd('phone_direct')} /></Field>
      <Field label="Cell phone"><input value={form.phone_cell || ''} onChange={upd('phone_cell')} /></Field>
      <Field label="Other phone"><input value={form.phone_other || ''} onChange={upd('phone_other')} /></Field>
      <Field label="Source"><input value={form.source || ''} onChange={upd('source')} placeholder="cold list, referral, LinkedIn…" /></Field>
      <Field label="Owner"><input value={form.owner || ''} onChange={upd('owner')} placeholder="me" /></Field>
      <Field label="Lead status">
        <select value={form.lead_status || 'new'} onChange={upd('lead_status')}>
          {meta.lead_statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <div className="form-actions"><button className="btn primary" type="submit">{submitLabel}</button></div>
    </form>
  );
}

export default function ContactDrawer({ contact, onClose }) {
  const { run, mutateCompany } = useStore();
  const [history, setHistory] = useState(null);
  const [editing, setEditing] = useState(false);

  const loadHistory = async () => setHistory(await api.get(`/contacts/${contact.id}/history`));
  useEffect(() => { loadHistory().catch(() => {}); }, [contact.id]);

  const refreshAll = async () => {
    await loadHistory();
    await mutateCompany(async () => {}); // re-pull company payload (timeline, last contact)
  };

  const saveNote = (body, source) =>
    run(async () => {
      await api.post('/notes', { contact_id: contact.id, body, source });
      await refreshAll();
    }, source === 'voice' ? 'Voice note saved' : 'Note saved');

  const editNote = (id, body) =>
    run(async () => {
      await api.patch(`/notes/${id}`, { body });
      await refreshAll();
    }, 'Note updated');

  const deleteNote = (id) =>
    run(async () => {
      await api.del(`/notes/${id}`);
      await refreshAll();
    }, 'Note deleted');

  const updateContact = (form) =>
    run(async () => {
      await api.patch(`/contacts/${contact.id}`, form);
      setEditing(false);
      await mutateCompany(async () => {});
    }, 'Contact updated');

  const deleteContact = () => {
    if (!confirm(`Delete contact ${contact.name}? Their notes and history will be removed.`)) return;
    run(async () => {
      await mutateCompany(() => api.del(`/contacts/${contact.id}`));
      onClose();
    }, 'Contact deleted');
  };

  return (
    <Modal title={contact.name} onClose={onClose} wide>
      <div className="contact-drawer">
        <div className="contact-info">
          <div>
            <div className="muted">{contact.title || 'No title'}</div>
            {contact.email && <div><a href={`mailto:${contact.email}`}>{contact.email}</a></div>}
            {contact.email_2 && <div><a href={`mailto:${contact.email_2}`}>{contact.email_2}</a></div>}
            {contact.phone_direct && <div><span className="muted small">Direct: </span><PhoneLink phone={contact.phone_direct} contactId={contact.id} companyId={contact.company_id} contactName={contact.name} /></div>}
            {contact.phone_cell && <div><span className="muted small">Cell: </span><PhoneLink phone={contact.phone_cell} contactId={contact.id} companyId={contact.company_id} contactName={contact.name} /></div>}
            {contact.phone_other && <div><span className="muted small">Other: </span><PhoneLink phone={contact.phone_other} contactId={contact.id} companyId={contact.company_id} contactName={contact.name} /></div>}
            {!contact.phone_direct && !contact.phone_cell && !contact.phone_other && contact.phone && <div><PhoneLink phone={contact.phone} contactId={contact.id} companyId={contact.company_id} contactName={contact.name} /></div>}
            <div className="muted small">
              Source: {contact.source || '—'} · Owner: {contact.owner || 'unassigned'} ·
              Status: {contact.lead_status || 'new'} · Last contacted: {relTime(contact.last_contacted_at)}
              {contact.last_contacted_at && ` (${fmtDateTime(contact.last_contacted_at)})`}
            </div>
          </div>
          <div className="row gap">
            <button className="btn small" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn small danger" onClick={deleteContact}>Delete</button>
          </div>
        </div>

        <h4>Log an interaction</h4>
        <LogInteraction contact={contact} onLogged={refreshAll} />

        <h4>Add note 🎙</h4>
        <VoiceNoteInput compact placeholder={`Note about ${contact.name}…`} onSave={saveNote} />

        <h4>Conversation history</h4>
        {history === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <Timeline
            items={history}
            onEditNote={editNote}
            onDeleteNote={deleteNote}
            emptyText="No interactions logged with this contact yet."
          />
        )}
      </div>

      {editing && (
        <Modal title={`Edit ${contact.name}`} onClose={() => setEditing(false)}>
          <ContactForm initial={contact} onSubmit={updateContact} submitLabel="Save changes" />
        </Modal>
      )}
    </Modal>
  );
}
