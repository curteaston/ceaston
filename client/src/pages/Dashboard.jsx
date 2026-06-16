import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store.js';
import { StageChip, TaskRow } from '../components/widgets.jsx';
import { fmtDateTime, fmtMoney } from '../format.js';

function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { dashboard: d, fetchDashboard, toggleTask } = useStore();
  useEffect(() => { fetchDashboard(); }, []);

  if (!d) return <p className="muted">Loading dashboard…</p>;

  const maxFunnel = Math.max(1, ...d.funnel.map((f) => f.count));

  return (
    <div>
      <div className="page-head"><h1>Dashboard</h1></div>

      <div className="stat-grid">
        <Stat label="Companies" value={d.totals.companies} sub={`${d.contacts_per_company} contacts / company`} />
        <Stat label="Contacts" value={d.totals.contacts} />
        <Stat label="Open deals" value={d.totals.open_deals} sub={`${fmtMoney(d.totals.pipeline_value)} in pipeline`} />
        <Stat label="Won" value={fmtMoney(d.totals.won_value)} sub={d.win_rate != null ? `${d.win_rate}% win rate` : 'No closed deals yet'} />
        <Stat label="Activities (7d)" value={d.activity.last_7_days} sub={`${d.activity.last_30_days} in last 30 days`} />
        <Stat label="Notes (7d)" value={d.activity.notes_last_7_days} />
        <Stat
          label="Task completion"
          value={d.tasks.completion_rate != null ? `${d.tasks.completion_rate}%` : '—'}
          sub={`${d.tasks.completed}/${d.tasks.total} done · ${d.tasks.overdue} overdue · ${d.tasks.due_today} due today`}
        />
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3>Pipeline funnel & stage conversion</h3>
          {d.funnel.map((f, i) => (
            <div key={f.stage} className="funnel-row">
              <span className="funnel-label"><StageChip stage={f.stage} /></span>
              <div className="funnel-bar-track">
                <div className={`funnel-bar stage-bar-${f.stage}`} style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
              </div>
              <span className="funnel-count">{f.count} · {fmtMoney(f.value)}</span>
              {i < d.conversion.length && (
                <span className="muted small funnel-conv">
                  ↓ {d.conversion[i].rate != null ? `${d.conversion[i].rate}%` : '—'}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Activity by type (30d)</h3>
          {d.activity.by_type_30_days.length === 0 && <p className="muted">No activity logged yet.</p>}
          <table className="mini-table">
            <tbody>
              {d.activity.by_type_30_days.map((row) => (
                <tr key={row.type}><td>{row.type}</td><td className="right"><b>{row.n}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Upcoming tasks</h3>
          {d.upcoming_tasks.length === 0 && <p className="muted">Nothing due in the next 7 days.</p>}
          {d.upcoming_tasks.map((t) => (
            <TaskRow key={t.id} task={t} showTarget onToggle={async (task) => { await toggleTask(task); fetchDashboard(); }} />
          ))}
        </div>

        <div className="card">
          <h3>Recent activity</h3>
          {d.recent_activity.length === 0 && <p className="muted">No activity yet.</p>}
          {d.recent_activity.map((a) => (
            <div key={a.id} className="recent-row">
              <div className="small">
                <b>{a.type.replace('_', ' ')}</b>
                {a.outcome && <span className="chip outcome">{a.outcome}</span>}{' '}
                <Link to={`/companies/${a.company_id}`} className="company-link">{a.company_name}</Link>
                {a.contact_name && <span className="muted"> · {a.contact_name}</span>}
              </div>
              {a.body && <div className="muted small clamp">{a.body}</div>}
              <div className="muted small">{fmtDateTime(a.occurred_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
