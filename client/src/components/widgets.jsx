import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useStore } from '../store.js';
import { isOverdue, fmtDate } from '../format.js';

export function CompanySelect({ value, onChange, required = true }) {
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    api.get(`/companies${qs({ sort: 'name', order: 'asc', limit: 500 })}`)
      .then((d) => setCompanies(d.companies))
      .catch(() => {});
  }, []);
  return (
    <select required={required} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a company…</option>
      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

// Click-to-call link: dials via the OS handler (mobile, Teams, Google Voice, RingCentral, …)
// and, when contact/company context is given, pops the quick call-log dialog.
export function PhoneLink({ phone, contactId, companyId, contactName, companyName }) {
  if (!phone) return <span className="muted">--</span>;
  const href = `tel:${phone.replace(/[^+\d]/g, '')}`;
  const onClick = (e) => {
    e.stopPropagation();
    if (contactId || companyId) {
      useStore.getState().startCall({ phone, contactId, companyId, contactName, companyName });
    }
  };
  return (
    <a href={href} className="phone-link" title={`Call ${phone}`} onClick={onClick}>
      📞 {phone}
    </a>
  );
}

export function StageChip({ stage }) {
  if (!stage) return <span className="muted">—</span>;
  return <span className={`chip stage stage-${stage}`}>{stage}</span>;
}

export function PriorityChip({ priority }) {
  return <span className={`chip prio prio-${priority}`}>{priority}</span>;
}

export function TaskRow({ task, onToggle, onDelete, showTarget = false }) {
  return (
    <div className={`task-row ${task.completed ? 'done' : ''}`}>
      <input type="checkbox" checked={task.completed} onChange={() => onToggle(task)} />
      <div className="task-main">
        <div className="task-desc">{task.description}</div>
        <div className="task-meta">
          <span className={isOverdue(task) ? 'overdue' : ''}>
            {task.due_date ? fmtDate(task.due_date) : 'No due date'}
          </span>
          <PriorityChip priority={task.priority} />
          {task.owner && <span className="muted">@{task.owner}</span>}
          {showTarget && (task.contact_name || task.company_name) && (
            <span className="muted">· {task.contact_name || task.company_name}</span>
          )}
        </div>
      </div>
      {onDelete && (
        <button className="icon-btn" title="Delete task" onClick={() => onDelete(task)}>✕</button>
      )}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
