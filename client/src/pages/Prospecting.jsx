import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { fmtMoney, relTime } from '../format.js';
import {
  BUYING_COMMITTEE_LABELS,
  CONTACT_ROLE_LABELS,
  TARGET_TIER_LABELS,
} from '../prospecting.js';

const VIEWS = [
  { key: 'work_now', label: 'Work now' },
  { key: 'ready', label: 'Ready' },
  { key: 'role_gaps', label: 'Role gaps' },
  { key: 'needs_next_step', label: 'No next step' },
  { key: 'replies', label: 'Replies' },
  { key: 'suppressed', label: 'Suppressed' },
];

const STATUS_LABELS = {
  ready_now: 'Ready',
  find_roles: 'Find roles',
  needs_next_step: 'Needs next step',
  reply_review: 'Reply review',
  blocked_no_contacts: 'No contacts',
  suppressed: 'Suppressed',
};

const STATUS_CLASS = {
  ready_now: 'ok-chip',
  find_roles: 'prio-medium',
  needs_next_step: 'prio-medium',
  reply_review: 'outcome',
  blocked_no_contacts: 'danger-chip',
  suppressed: 'danger-chip',
};

function contactLine(contact) {
  if (!contact) return 'None';
  const role = CONTACT_ROLE_LABELS[contact.contact_role] || contact.contact_role || 'Contact';
  return `${contact.name} (${role})`;
}

function roleList(roles) {
  if (!roles?.length) return <span className="muted">None mapped</span>;
  return roles.map((role) => (
    <span key={role} className="chip role-chip">{CONTACT_ROLE_LABELS[role] || role}</span>
  ));
}

function missingList(roles) {
  if (!roles?.length) return <span className="chip ok-chip">Covered</span>;
  return roles.map((role) => (
    <span key={role} className="chip prio-medium">{CONTACT_ROLE_LABELS[role] || role}</span>
  ));
}

function SummaryCard({ label, value }) {
  return (
    <div className="prospecting-metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function AccountRow({ account }) {
  const statusClass = STATUS_CLASS[account.status] || '';
  const source = [account.source, account.campaign].filter(Boolean).join(' / ') || 'No source';
  const nextStep = account.next_step || account.next_task?.description || account.reason;
  return (
    <tr>
      <td>
        <Link to={`/companies/${account.id}`} className="company-link">{account.name}</Link>
        <div className="muted small">
          {[account.domain, account.owner ? `Owner: ${account.owner}` : null].filter(Boolean).join(' - ') || 'No domain'}
        </div>
      </td>
      <td>
        <div className="row gap wrap">
          {account.target_tier && <span className="chip tier-chip">{TARGET_TIER_LABELS[account.target_tier] || account.target_tier}</span>}
          <span className={`chip ${statusClass}`}>{STATUS_LABELS[account.status] || account.status}</span>
        </div>
        <div className="muted small pad-top">{account.reason}</div>
      </td>
      <td>
        <div>{contactLine(account.primary_contact)}</div>
        <div className="muted small">{contactLine(account.secondary_contact)}</div>
        <div className="role-chip-row">{roleList(account.roles)}</div>
      </td>
      <td>
        <div className="role-chip-row">{missingList(account.missing_roles)}</div>
        <div className="muted small">{BUYING_COMMITTEE_LABELS[account.buying_committee_status] || account.buying_committee_status || 'Unknown'}</div>
      </td>
      <td>
        <div>{nextStep}</div>
        <div className="muted small">{account.sequence_angle}</div>
      </td>
      <td>
        <div>{source}</div>
        <div className="muted small">
          {account.open_deal_value > 0 ? `${fmtMoney(account.open_deal_value)} open - ` : ''}
          last touch {relTime(account.last_activity_at)}
        </div>
      </td>
    </tr>
  );
}

export default function Prospecting() {
  const [view, setView] = useState('work_now');
  const [targetTier, setTargetTier] = useState('');
  const [q, setQ] = useState('');
  const [hideTestData, setHideTestData] = useState(() => localStorage.getItem('prospecting_hide_test_data') !== '0');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    localStorage.setItem('prospecting_hide_test_data', hideTestData ? '1' : '0');
    setError(null);
    api.get(`/prospecting/workbench${qs({
      view,
      q,
      target_tier: targetTier,
      hide_test_data: hideTestData,
      limit: 100,
    })}`)
      .then(setData)
      .catch((err) => {
        setError(err.message);
        setData(null);
      });
  }, [view, q, targetTier, hideTestData]);

  const activeView = useMemo(() => VIEWS.find((item) => item.key === view) || VIEWS[0], [view]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Prospecting</h1>
          <div className="company-meta">
            <span>{activeView.label}</span>
            {data?.hidden_test_records > 0 && <span>{data.hidden_test_records} test records hidden</span>}
          </div>
        </div>
        <div className="row gap wrap">
          <Link to="/import" className="btn">Import list</Link>
          <Link to="/companies" className="btn">Companies</Link>
        </div>
      </div>

      <div className="prospecting-metrics">
        <SummaryCard label="Work now" value={data?.summary?.work_now ?? '-'} />
        <SummaryCard label="Ready" value={data?.summary?.ready ?? '-'} />
        <SummaryCard label="Role gaps" value={data?.summary?.role_gaps ?? '-'} />
        <SummaryCard label="No next step" value={data?.summary?.needs_next_step ?? '-'} />
        <SummaryCard label="Replies" value={data?.summary?.replies ?? '-'} />
        <SummaryCard label="Suppressed" value={data?.summary?.suppressed ?? '-'} />
      </div>

      <div className="card prospecting-controls">
        <div className="segmented">
          {VIEWS.map((item) => (
            <button key={item.key} className={view === item.key ? 'on' : ''} onClick={() => setView(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <input className="filter-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account, contact, campaign..." />
          <select value={targetTier} onChange={(e) => setTargetTier(e.target.value)}>
            <option value="">Any tier</option>
            {Object.entries(TARGET_TIER_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label className="checkbox-inline">
            <input type="checkbox" checked={hideTestData} onChange={(e) => setHideTestData(e.target.checked)} />
            Hide test records
          </label>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!data && !error && <p className="muted">Loading...</p>}
      {data && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Priority</th>
                <th>Contact path</th>
                <th>Coverage</th>
                <th>Next action</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((account) => <AccountRow key={account.id} account={account} />)}
              {data.accounts.length === 0 && (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">
                      <p>No accounts match this view.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
