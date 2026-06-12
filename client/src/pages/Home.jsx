import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useStore } from '../store.js';
import Modal from '../components/Modal.jsx';
import { Field, PriorityChip, StageChip } from '../components/widgets.jsx';
import { fmtDate, fmtDateTime, fmtMoney, relTime } from '../format.js';

const FEED_ICONS = {
  call: '📞', email: '✉️', sms: '💬', meeting: '📅',
  linkedin: '💼', stage_change: '🔀', other: '📌', note: '📝',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function CompanySelect({ value, onChange }) {
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    api.get(`/companies${qs({ sort: 'name', order: 'asc', limit: 500 })}`)
      .then((d) => setCompanies(d.companies))
      .catch(() => {});
  }, []);
  return (
    <select required value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a company…</option>
      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function NewMeetingModal({ onClose, onSaved }) {
  const { run } = useStore();
  const [companyId, setCompanyId] = useState('');
  const [contacts, setContacts] = useState([]);
  const [contactId, setContactId] = useState('');
  const [time, setTime] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [body, setBody] = useState('');

  useEffect(() => {
    setContactId('');
    if (!companyId) return setContacts([]);
    api.get(`/contacts?company_id=${companyId}`).then(setContacts).catch(() => {});
  }, [companyId]);

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/activities', {
        company_id: Number(companyId),
        contact_id: contactId ? Number(contactId) : null,
        type: 'meeting',
        body: body || null,
        occurred_at: new Date(time).toISOString(),
      });
      onSaved();
      onClose();
    }, 'Meeting added');
  };

  return (
    <Modal title="New meeting" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Company *"><CompanySelect value={companyId} onChange={setCompanyId} /></Field>
        <Field label="With contact">
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={!companyId}>
            <option value="">—</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="When *"><input type="datetime-local" required value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Agenda / notes"><input value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="form-actions"><button className="btn primary" type="submit">Add meeting</button></div>
      </form>
    </Modal>
  );
}

function NewTaskModal({ onClose, onSaved }) {
  const { run, meta } = useStore();
  const [companyId, setCompanyId] = useState('');
  const [form, setForm] = useState({
    description: '', due_date: new Date().toISOString().slice(0, 10), priority: 'medium', owner: '',
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/tasks', {
        company_id: Number(companyId),
        description: form.description,
        due_date: form.due_date || null,
        priority: form.priority,
        owner: form.owner || null,
      });
      onSaved();
      onClose();
    }, 'Task created');
  };

  return (
    <Modal title="New task" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Company *"><CompanySelect value={companyId} onChange={setCompanyId} /></Field>
        <Field label="Description *"><input required value={form.description} onChange={upd('description')} /></Field>
        <Field label="Due date"><input type="date" value={form.due_date} onChange={upd('due_date')} /></Field>
        <Field label="Priority">
          <select value={form.priority} onChange={upd('priority')}>
            {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Owner"><input value={form.owner} onChange={upd('owner')} placeholder="me" /></Field>
        <div className="form-actions"><button className="btn primary" type="submit">Create task</button></div>
      </form>
    </Modal>
  );
}

function Section({ icon, title, actions, children }) {
  return (
    <section className="home-section">
      <div className="home-section-head">
        <span className="home-section-title">{icon} <u>{title}</u></span>
        <span className="row gap">{actions}</span>
      </div>
      {children}
    </section>
  );
}

function HomeTaskRow({ task, onToggle }) {
  return (
    <div className={`task-row ${task.completed ? 'done' : ''}`}>
      <input type="checkbox" checked={task.completed} onChange={() => onToggle(task)} />
      <div className="task-main">
        <div className="task-desc">{task.description}</div>
        <div className="task-meta">
          <PriorityChip priority={task.priority} />
          {task.due_date && <span>{fmtDate(task.due_date)}</span>}
          {task.company_id && (
            <Link to={`/companies/${task.company_id}`} className="muted">
              {task.contact_name ? `${task.contact_name} · ` : ''}{task.company_name}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { run } = useStore();
  const [data, setData] = useState(null);
  const [taskView, setTaskView] = useState('open');
  const [modal, setModal] = useState(null); // 'meeting' | 'task'
  const [name, setName] = useState(() => localStorage.getItem('crm_display_name') || 'Curt');

  const load = () => api.get('/home').then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const customize = () => {
    const next = prompt('Display name for your greeting:', name);
    if (next?.trim()) {
      localStorage.setItem('crm_display_name', next.trim());
      setName(next.trim());
    }
  };

  const toggleTask = (task) =>
    run(async () => {
      await api.patch(`/tasks/${task.id}`, { completed: !task.completed });
      await load();
    });

  if (!data) return <p className="muted">Loading…</p>;

  const { meetings_today, tasks_today, needs_attention, recent_activity } = data;
  const tasks = taskView === 'open' ? tasks_today.open : tasks_today.completed;
  const attentionCount =
    needs_attention.overdue_tasks.length +
    needs_attention.past_due_deals.length +
    needs_attention.stale_companies.length;

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <div className="home-date">{todayLabel()}</div>
          <h1 className="home-greet">{greeting()}, {name}</h1>
        </div>
        <button className="link-btn" onClick={customize}>⚙ Customize</button>
      </div>

      <Section
        icon="📅" title="Meetings"
        actions={<button className="icon-btn" title="New meeting" onClick={() => setModal('meeting')}>＋</button>}
      >
        <div className="outline-card">
          {meetings_today.length === 0 ? (
            <div className="empty-state">
              <p>You don't have any meetings today</p>
              <button className="btn" onClick={() => setModal('meeting')}>＋ New meeting</button>
            </div>
          ) : (
            meetings_today.map((m) => (
              <div key={m.id} className="meeting-row">
                <b>{new Date(m.occurred_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</b>
                <Link to={`/companies/${m.company_id}`} className="company-link">{m.company_name}</Link>
                {m.contact_name && <span className="muted">with {m.contact_name}</span>}
                {m.body && <span className="muted">— {m.body}</span>}
              </div>
            ))
          )}
        </div>
      </Section>

      <Section
        icon="☑️" title="Tasks"
        actions={
          <>
            <button className="icon-btn" title="New task" onClick={() => setModal('task')}>＋</button>
            <span className="toggle-group">
              <button className={taskView === 'open' ? 'on' : ''} onClick={() => setTaskView('open')}>Open</button>
              <button className={taskView === 'completed' ? 'on' : ''} onClick={() => setTaskView('completed')}>Completed</button>
            </span>
          </>
        }
      >
        <div className="outline-card">
          {tasks.length === 0 ? (
            <div className="empty-state">
              <p>{taskView === 'open' ? 'You have no tasks today' : 'No tasks completed today'}</p>
              {taskView === 'open' && <button className="btn" onClick={() => setModal('task')}>＋ New Task</button>}
            </div>
          ) : (
            tasks.map((t) => <HomeTaskRow key={t.id} task={t} onToggle={toggleTask} />)
          )}
        </div>
      </Section>

      <Section icon="📡" title="Activity Feed">
        <h4>🔔 Needs attention {attentionCount > 0 && <span className="chip prio prio-high">{attentionCount}</span>}</h4>
        <div className="outline-card">
          {attentionCount === 0 && <div className="empty-state"><p>Nothing needs your attention. 🎉</p></div>}

          {needs_attention.overdue_tasks.map((t) => (
            <div key={`t${t.id}`} className="attention-row">
              <input type="checkbox" checked={false} onChange={() => toggleTask(t)} title="Mark done" />
              <span className="overdue">Overdue {fmtDate(t.due_date)}</span>
              <span>{t.description}</span>
              {t.company_id && (
                <Link to={`/companies/${t.company_id}`} className="muted">
                  {t.contact_name ? `${t.contact_name} · ` : ''}{t.company_name}
                </Link>
              )}
              <PriorityChip priority={t.priority} />
            </div>
          ))}

          {needs_attention.past_due_deals.map((d) => (
            <div key={`d${d.id}`} className="attention-row">
              <span>💰</span>
              <span className="overdue">Deal past close date ({fmtDate(d.expected_close_date)})</span>
              <Link to={`/companies/${d.company_id}`} className="company-link">{d.name}</Link>
              <span className="muted">{d.company_name} · {fmtMoney(d.value)}</span>
              <StageChip stage={d.stage} />
            </div>
          ))}

          {needs_attention.stale_companies.map((c) => (
            <div key={`c${c.id}`} className="attention-row">
              <span>🧊</span>
              <span className="overdue">Going cold</span>
              <Link to={`/companies/${c.id}`} className="company-link">{c.name}</Link>
              <span className="muted">
                open pipeline {fmtMoney(c.open_deal_value)} · last touch {relTime(c.last_activity_at)}
              </span>
            </div>
          ))}
        </div>

        <h4>🕘 Recent activity</h4>
        <div className="outline-card">
          {recent_activity.length === 0 && (
            <div className="empty-state"><p>No activity yet — log a call or add a note and it'll show up here.</p></div>
          )}
          {recent_activity.map((a) => (
            <div key={`${a.kind}${a.id}`} className="feed-row">
              <span className="tl-icon">{a.kind === 'note' ? FEED_ICONS.note : FEED_ICONS[a.type] || FEED_ICONS.other}</span>
              <div className="grow">
                <div className="small">
                  <b style={{ textTransform: 'capitalize' }}>{a.kind === 'note' ? 'Note' : (a.type || '').replace('_', ' ')}</b>
                  {a.source === 'voice' && <span className="chip voice">🎙 voice</span>}
                  {a.outcome && <span className="chip outcome">{a.outcome}</span>}{' '}
                  <Link to={`/companies/${a.company_id}`} className="company-link">{a.company_name}</Link>
                  {a.contact_name && <span className="muted"> · {a.contact_name}</span>}
                </div>
                {a.body && <div className="muted small clamp">{a.body}</div>}
              </div>
              <span className="muted small feed-time">{fmtDateTime(a.occurred_at)}</span>
            </div>
          ))}
        </div>
      </Section>

      {modal === 'meeting' && <NewMeetingModal onClose={() => setModal(null)} onSaved={load} />}
      {modal === 'task' && <NewTaskModal onClose={() => setModal(null)} onSaved={load} />}
    </div>
  );
}
