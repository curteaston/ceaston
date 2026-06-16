import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store.js';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { CompanySelect, Field, PriorityChip } from '../components/widgets.jsx';
import { fmtDate, isOverdue } from '../format.js';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
];

function inTab(task, tab) {
  if (tab === 'completed') return task.completed;
  if (task.completed) return false;
  if (tab === 'all') return true;
  if (tab === 'overdue') return isOverdue(task);
  const today = new Date().toDateString();
  if (tab === 'today') return task.due_date && new Date(task.due_date).toDateString() === today;
  if (tab === 'upcoming') return task.due_date && new Date(task.due_date) > new Date(new Date().toDateString());
  return true;
}

function CreateTaskModal({ onClose, onSaved }) {
  const { run, meta } = useStore();
  const me = localStorage.getItem('crm_display_name') || 'Curt';
  const [companyId, setCompanyId] = useState('');
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    description: '', due_date: new Date().toISOString().slice(0, 10),
    priority: 'medium', owner: me, contact_id: '',
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    setForm((f) => ({ ...f, contact_id: '' }));
    if (!companyId) return setContacts([]);
    api.get(`/contacts?company_id=${companyId}&limit=200`).then((d) => setContacts(d.contacts)).catch(() => {});
  }, [companyId]);

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/tasks', {
        description: form.description,
        due_date: form.due_date || null,
        priority: form.priority,
        owner: form.owner || null,
        company_id: form.contact_id ? null : Number(companyId),
        contact_id: form.contact_id ? Number(form.contact_id) : null,
      });
      onSaved();
      onClose();
    }, 'Task created');
  };

  return (
    <Modal title="Create task" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Title *"><input required value={form.description} onChange={upd('description')} placeholder="e.g. Follow up with owner" /></Field>
        <Field label="Due date"><input type="date" value={form.due_date} onChange={upd('due_date')} /></Field>
        <Field label="Priority">
          <select value={form.priority} onChange={upd('priority')}>
            {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Assigned to"><input value={form.owner} onChange={upd('owner')} placeholder="me" /></Field>
        <Field label="Associated company *"><CompanySelect value={companyId} onChange={setCompanyId} /></Field>
        <Field label="Associated contact (optional)">
          <select value={form.contact_id} onChange={upd('contact_id')} disabled={!companyId}>
            <option value="">Whole company</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="form-actions"><button className="btn primary" type="submit" disabled={!companyId}>Create task</button></div>
      </form>
    </Modal>
  );
}

// Step-through focus mode launched by "Start N tasks".
function FocusMode({ tasks, onClose, onToggle }) {
  const [i, setI] = useState(0);
  const task = tasks[i];
  const done = i >= tasks.length;

  const complete = async () => {
    await onToggle(task);
    setI((n) => n + 1);
  };

  return (
    <Modal title={done ? 'Focus complete' : `Task ${i + 1} of ${tasks.length}`} onClose={onClose}>
      {done ? (
        <div className="center pad">
          <div style={{ fontSize: 40 }}>🎉</div>
          <p>You worked through {tasks.length} task{tasks.length === 1 ? '' : 's'}. Nice work.</p>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="focus-task">
          <div className="focus-progress">
            <div className="focus-bar" style={{ width: `${(i / tasks.length) * 100}%` }} />
          </div>
          <h2 className="focus-desc">{task.description}</h2>
          <div className="task-meta pad-top">
            <span className={isOverdue(task) ? 'overdue' : ''}>{task.due_date ? fmtDate(task.due_date) : 'No due date'}</span>
            <PriorityChip priority={task.priority} />
            {task.owner && <span className="muted">@{task.owner}</span>}
          </div>
          {(task.company_id || task.contact_id) && (
            <p className="pad-top">
              <Link to={`/companies/${task.company_id || ''}`} onClick={onClose} className="company-link">
                {task.contact_name ? `${task.contact_name} · ` : ''}{task.company_name || 'View company'}
              </Link>
            </p>
          )}
          <div className="row gap focus-actions">
            <button className="btn primary" onClick={complete}>✓ Complete &amp; next</button>
            <button className="btn" onClick={() => setI((n) => n + 1)}>Skip →</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Tasks() {
  const { tasks, fetchTasks, toggleTask, meta, run } = useStore();
  const me = localStorage.getItem('crm_display_name') || 'Curt';
  const [tab, setTab] = useState('all');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [focus, setFocus] = useState(false);
  const searchTimer = useRef(null);

  useEffect(() => { fetchTasks(); }, []);

  const owners = useMemo(() => {
    const set = new Set([me]);
    tasks.forEach((t) => t.owner && set.add(t.owner));
    return [...set];
  }, [tasks, me]);

  const visible = useMemo(() => tasks.filter((t) => {
    if (!inTab(t, tab)) return false;
    if (owner && (t.owner || '') !== owner) return false;
    if (priority && t.priority !== priority) return false;
    if (search.trim() && !t.description.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }), [tasks, tab, owner, priority, search]);

  const onSearch = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(value), 200);
  };

  const clearAll = () => { setOwner(''); setPriority(''); setSearch(''); };
  const hasFilters = owner || priority || search;

  const deleteTask = (task) =>
    run(async () => {
      await api.del(`/tasks/${task.id}`);
      await fetchTasks();
    }, 'Task deleted');

  const startable = visible.filter((t) => !t.completed);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <div className="muted small">{visible.length} record{visible.length === 1 ? '' : 's'}</div>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>Create task</button>
      </div>

      <div className="task-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`task-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="task-tab-count">{tasks.filter((x) => inTab(x, t.key)).length}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar task-filter-bar">
        <select className="assigned-pill" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Assigned to: anyone</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Priority: any</option>
          {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {hasFilters && <button className="link-btn" onClick={clearAll}>Clear all</button>}
        <span className="grow" />
        <button className="btn" onClick={() => setFocus(true)} disabled={startable.length === 0}>
          ▶ Start {startable.length} task{startable.length === 1 ? '' : 's'}
        </button>
      </div>

      <div className="card table-card">
        <div className="task-search-row">
          <input
            className="task-search"
            placeholder="🔍 Search task title…"
            defaultValue={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {visible.length === 0 ? (
          <div className="task-empty">
            <div>
              <h2>You're all caught up on tasks.</h2>
              <p className="muted">{hasFilters ? 'No tasks match these filters.' : tab === 'completed' ? 'No completed tasks yet.' : 'Nice work.'}</p>
            </div>
            <div className="task-empty-art">🛋️💤</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th className="check-col"></th><th>Title</th><th>Associated with</th><th>Due date</th><th>Priority</th><th>Assigned to</th><th></th></tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className={t.completed ? 'task-done-row' : ''}>
                  <td className="check-col">
                    <input type="checkbox" checked={t.completed} onChange={() => toggleTask(t)} />
                  </td>
                  <td className={t.completed ? 'struck' : ''}><b>{t.description}</b></td>
                  <td>
                    {(t.company_id || t.contact_id) ? (
                      <Link to={`/companies/${t.company_id || ''}`} className="company-link">
                        {t.contact_name ? `${t.contact_name} · ` : ''}{t.company_name || 'View company'}
                      </Link>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className={isOverdue(t) ? 'overdue' : ''}>{t.due_date ? fmtDate(t.due_date) : '—'}</td>
                  <td><PriorityChip priority={t.priority} /></td>
                  <td>{t.owner || <span className="muted">Unassigned</span>}</td>
                  <td><button className="icon-btn" title="Delete task" onClick={() => deleteTask(t)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onSaved={fetchTasks} />}
      {focus && startable.length > 0 && (
        <FocusMode
          tasks={startable}
          onClose={() => { setFocus(false); fetchTasks(); }}
          onToggle={toggleTask}
        />
      )}
    </div>
  );
}
