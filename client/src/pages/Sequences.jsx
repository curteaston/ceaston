import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import Modal from '../components/Modal.jsx';
import { Field } from '../components/widgets.jsx';

const TASK_TYPES = [
  ['call', '📞 Call'], ['email', '✉️ Email (manual)'], ['linkedin', '💼 LinkedIn'], ['general', '📌 General'],
];
const MERGE_FIELDS = ['first_name', 'last_name', 'name', 'title', 'company', 'domain'];

function blankStep(kind = 'task') {
  return kind === 'auto_email'
    ? { kind: 'auto_email', day_offset: 0, subject: '', body: '' }
    : { kind: 'task', day_offset: 0, task_type: 'call', description: '', priority: 'medium' };
}

function StepEditor({ step, index, onChange, onRemove }) {
  const upd = (patch) => onChange({ ...step, ...patch });
  return (
    <div className="seq-step">
      <div className="seq-step-head">
        <span className="seq-step-num">{index + 1}</span>
        <label className="seq-day">
          Day
          <input
            type="number" min="0" value={step.day_offset}
            onChange={(e) => upd({ day_offset: Number(e.target.value) })}
          />
        </label>
        <select value={step.kind} onChange={(e) => upd(blankStep(e.target.value))}>
          <option value="task">Manual task</option>
          <option value="auto_email">Auto-email</option>
        </select>
        <span className="grow" />
        <button type="button" className="icon-btn" title="Remove step" onClick={onRemove}>✕</button>
      </div>

      {step.kind === 'task' ? (
        <div className="seq-step-body">
          <select value={step.task_type} onChange={(e) => upd({ task_type: e.target.value })}>
            {TASK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input
            className="grow" placeholder="Task title (e.g. Call the owner about lead gen)"
            value={step.description} onChange={(e) => upd({ description: e.target.value })}
          />
          <select value={step.priority} onChange={(e) => upd({ priority: e.target.value })}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </div>
      ) : (
        <div className="seq-step-body col">
          <input
            placeholder="Subject — supports {{first_name}}, {{company}}…"
            value={step.subject} onChange={(e) => upd({ subject: e.target.value })}
          />
          <textarea
            rows={4} placeholder="Email body. Merge fields: {{first_name}} {{company}} {{title}}"
            value={step.body} onChange={(e) => upd({ body: e.target.value })}
          />
          <div className="muted small">Merge fields: {MERGE_FIELDS.map((f) => <code key={f}>{`{{${f}}}`}</code>)}</div>
        </div>
      )}
    </div>
  );
}

function SequenceEditor({ initial, onClose, onSaved }) {
  const { run } = useStore();
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [steps, setSteps] = useState(initial?.steps?.length ? initial.steps : [blankStep('task')]);

  const setStep = (i, s) => setSteps((arr) => arr.map((x, j) => (j === i ? s : x)));
  const removeStep = (i) => setSteps((arr) => arr.filter((_, j) => j !== i));

  const save = () => {
    if (!name.trim()) return;
    const payload = { name, description, steps };
    run(async () => {
      if (initial?.id) await api.put(`/sequences/${initial.id}`, payload);
      else await api.post('/sequences', payload);
      onSaved();
      onClose();
    }, initial?.id ? 'Sequence saved' : 'Sequence created');
  };

  return (
    <Modal title={initial?.id ? 'Edit sequence' : 'New sequence'} onClose={onClose} wide>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
        <Field label="Sequence name *"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="HVAC Cold Outreach" /></Field>
        <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>

      <h4>Steps</h4>
      <p className="muted small">
        Day is days after enrollment. <b>Manual task</b> steps create a dated task in your queue;
        <b> auto-email</b> steps send automatically on their day from your sequence sending domain.
      </p>
      {steps.map((s, i) => (
        <StepEditor key={i} step={s} index={i} onChange={(ns) => setStep(i, ns)} onRemove={() => removeStep(i)} />
      ))}
      <div className="row gap pad-top">
        <button className="btn small" onClick={() => setSteps((a) => [...a, blankStep('task')])}>+ Task step</button>
        <button className="btn small" onClick={() => setSteps((a) => [...a, blankStep('auto_email')])}>+ Auto-email step</button>
      </div>

      <div className="form-actions pad-top">
        <button className="btn primary" onClick={save} disabled={!name.trim() || steps.length === 0}>
          {initial?.id ? 'Save sequence' : 'Create sequence'}
        </button>
      </div>
    </Modal>
  );
}

export default function Sequences() {
  const { run } = useStore();
  const [sequences, setSequences] = useState([]);
  const [smtp, setSmtp] = useState(null);
  const [editor, setEditor] = useState(null); // null | {} | sequence

  const load = () => api.get('/sequences').then(setSequences).catch(() => {});
  useEffect(() => {
    load();
    api.get('/sequences/smtp').then(setSmtp).catch(() => {});
  }, []);

  const openEdit = async (seq) => {
    const full = await api.get(`/sequences/${seq.id}`);
    setEditor(full);
  };

  const del = (seq) => {
    if (!confirm(`Delete "${seq.name}"? Active enrollments and their pending tasks will be removed.`)) return;
    run(async () => { await api.del(`/sequences/${seq.id}`); load(); }, 'Sequence deleted');
  };

  const runNow = () =>
    run(async () => {
      const r = await api.post('/sequences/run');
      load();
      return r;
    }, 'Processed due sequence steps');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sequences</h1>
          <div className="muted small">Multi-step outbound cadences — manual tasks and auto-emails</div>
        </div>
        <div className="row gap">
          <button className="btn" onClick={runNow}>▶ Run due steps now</button>
          <button className="btn primary" onClick={() => setEditor({})}>New sequence</button>
        </div>
      </div>

      {smtp && !smtp.configured && (
        <div className="card warn-card">
          ⚠ Auto-email steps need a <b>separate sending domain</b> configured first.{' '}
          <a href="/settings">Set it up in Settings →</a> Manual task steps work without it.
        </div>
      )}

      {sequences.length === 0 && (
        <div className="card"><p className="muted">No sequences yet. Create one to start running outbound cadences.</p></div>
      )}

      <div className="seq-grid">
        {sequences.map((s) => (
          <div key={s.id} className="card seq-card">
            <div className="row between">
              <h3>{s.name}</h3>
              {!s.active && <span className="chip">paused</span>}
            </div>
            {s.description && <p className="muted small">{s.description}</p>}
            <div className="seq-card-stats">
              <span><b>{s.step_count}</b> steps</span>
              <span><b>{s.active_enrollments}</b> active enrollments</span>
            </div>
            <div className="row gap pad-top">
              <button className="btn small" onClick={() => openEdit(s)}>Edit</button>
              <button className="btn small danger" onClick={() => del(s)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editor && (
        <SequenceEditor
          initial={editor.id ? editor : null}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
