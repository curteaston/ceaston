import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import Modal from './Modal.jsx';
import { Field } from './widgets.jsx';

// Enroll a company (and optional contact) into an outbound sequence.
export default function EnrollModal({ company, onClose, onEnrolled }) {
  const { run, notify } = useStore();
  const me = localStorage.getItem('crm_display_name') || 'Curt';
  const [sequences, setSequences] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [sequenceId, setSequenceId] = useState('');
  const [contactId, setContactId] = useState('');
  const [owner, setOwner] = useState(company.owner || me);

  useEffect(() => {
    api.get('/sequences').then((rows) => setSequences(rows.filter((s) => s.active && s.step_count > 0))).catch(() => {});
    api.get(`/contacts?company_id=${company.id}&limit=200`).then((d) => {
      setContacts(d.contacts);
      const first = d.contacts.find((c) => c.email) || d.contacts[0];
      if (first) setContactId(String(first.id));
    }).catch(() => {});
  }, [company.id]);

  const selected = sequences.find((s) => String(s.id) === sequenceId);
  const contact = contacts.find((c) => String(c.id) === contactId);
  const needsEmail = selected; // any sequence may contain an auto-email step

  const submit = () => {
    if (!sequenceId) return notify('Pick a sequence', true);
    run(async () => {
      await api.post(`/sequences/${sequenceId}/enroll`, {
        company_id: company.id,
        contact_id: contactId ? Number(contactId) : null,
        owner: owner || null,
      });
      onEnrolled?.();
      onClose();
    }, `Enrolled ${company.name}`);
  };

  return (
    <Modal title={`Enroll ${company.name} in a sequence`} onClose={onClose}>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
        <Field label="Sequence *">
          <select value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
            <option value="">Choose a sequence…</option>
            {sequences.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.step_count} steps)</option>)}
          </select>
        </Field>
        <Field label="Primary contact (receives auto-emails)">
          <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">No specific contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ' · (no email)'}</option>
            ))}
          </select>
        </Field>
        <Field label="Assign tasks to"><input value={owner} onChange={(e) => setOwner(e.target.value)} /></Field>
      </div>

      {sequences.length === 0 && (
        <p className="muted small">No active sequences with steps. Build one on the Sequences page first.</p>
      )}
      {needsEmail && contact && !contact.email && (
        <p className="muted small">⚠ {contact.name} has no email — auto-email steps for this enrollment will be skipped until you add one.</p>
      )}

      <div className="form-actions pad-top">
        <button className="btn primary" onClick={submit} disabled={!sequenceId}>Enroll</button>
      </div>
    </Modal>
  );
}
