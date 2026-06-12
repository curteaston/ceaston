import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { PriorityChip } from '../components/widgets.jsx';
import { fmtDate, isOverdue } from '../format.js';

const GROUPS = [
  { key: 'overdue', label: '🔴 Overdue' },
  { key: 'today', label: '📍 Due today' },
  { key: 'upcoming', label: '📆 Upcoming' },
  { key: 'someday', label: 'No due date' },
  { key: 'completed', label: '✅ Completed' },
];

function groupOf(task) {
  if (task.completed) return 'completed';
  if (!task.due_date) return 'someday';
  if (isOverdue(task)) return 'overdue';
  const due = new Date(task.due_date).toDateString();
  if (due === new Date().toDateString()) return 'today';
  return 'upcoming';
}

export default function Tasks() {
  const { tasks, fetchTasks, toggleTask, meta, run } = useStore();
  const [filters, setFilters] = useState({ priority: '', status: 'open' });

  useEffect(() => { fetchTasks(); }, []);

  const visible = tasks.filter((t) => {
    if (filters.status === 'open' && t.completed) return false;
    if (filters.status === 'completed' && !t.completed) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    return true;
  });

  const deleteTask = (task) =>
    run(async () => {
      await api.del(`/tasks/${task.id}`);
      await fetchTasks();
    }, 'Task deleted');

  return (
    <div>
      <div className="page-head"><h1>Tasks</h1></div>
      <div className="filter-bar">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="open">Open</option>
          <option value="completed">Completed</option>
          <option value="all">All</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
          <option value="">Priority: any</option>
          {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="muted">{visible.length} tasks</span>
      </div>

      {GROUPS.map(({ key, label }) => {
        const group = visible.filter((t) => groupOf(t) === key);
        if (!group.length) return null;
        return (
          <div className="card" key={key}>
            <h3>{label} <span className="muted">({group.length})</span></h3>
            {group.map((t) => (
              <div key={t.id} className={`task-row ${t.completed ? 'done' : ''}`}>
                <input type="checkbox" checked={t.completed} onChange={() => toggleTask(t)} />
                <div className="task-main">
                  <div className="task-desc">{t.description}</div>
                  <div className="task-meta">
                    <span className={isOverdue(t) ? 'overdue' : ''}>{t.due_date ? fmtDate(t.due_date) : 'No due date'}</span>
                    <PriorityChip priority={t.priority} />
                    {t.owner && <span className="muted">@{t.owner}</span>}
                    {(t.company_id || t.contact_id) && (
                      <Link to={`/companies/${t.company_id || ''}`} className="muted">
                        {t.contact_name ? `${t.contact_name} · ` : ''}{t.company_name || 'View company'}
                      </Link>
                    )}
                  </div>
                </div>
                <button className="icon-btn" title="Delete task" onClick={() => deleteTask(t)}>✕</button>
              </div>
            ))}
          </div>
        );
      })}
      {visible.length === 0 && <p className="muted">No tasks match these filters.</p>}
    </div>
  );
}
